import {appendFile,readFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

// Search results are review candidates, never automatically accepted trailers.
// Every successful search is journaled so an interrupted batch can resume.
export async function discoverTrailerCandidates({movies,journal,search,limit=10}) {
 if(!Array.isArray(movies)||!journal||typeof search!=='function'||!Number.isInteger(limit)||limit<1||limit>10)throw Error('Invalid discovery parameters');
 await mkdir(dirname(journal),{recursive:true});let raw='';try{raw=await readFile(journal,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 if(raw&&!raw.endsWith('\n'))throw Error('Incomplete discovery journal requires review');
 const seen=new Set();for(const line of raw.split('\n'))if(line){const item=JSON.parse(line);if(!/^\d+$/.test(item.movieId)||!Array.isArray(item.candidates))throw Error('Invalid discovery journal');seen.add(item.movieId)}
 let searched=0;for(const movie of movies){const id=String(movie.id);if(!/^\d+$/.test(id)||!movie.title||!/^\d{4}-\d{2}-\d{2}$/.test(movie.createdAt||''))throw Error('Invalid movie');if(movie.trailer||seen.has(id))continue;if(searched>=limit)break;
  const candidates=await search(movie);if(!Array.isArray(candidates)||candidates.some(c=>!/^[-\w]{11}$/.test(c.videoId||'')||typeof c.title!=='string'||typeof c.channel!=='string'))throw Error('Invalid search response');
  await appendFile(journal,JSON.stringify({movieId:id,title:movie.title,releaseDate:movie.createdAt,checkedAt:new Date().toISOString(),candidates})+'\n',{mode:0o600});seen.add(id);searched++;
 }
 return {searched,previouslySearched:seen.size-searched};
}
