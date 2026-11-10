import {readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {playableTrailer} from '../src/catalog-overview.js';

export async function generateSimilarMovies(site){
 const dir=join(site,'data'),read=async name=>JSON.parse(await readFile(join(dir,name),'utf8'));
 const catalog=await read('catalog.json');
 if(!catalog.generatedAt||!Array.isArray(catalog.feedShards)||!Number.isSafeInteger(catalog.overview?.feedCount))throw Error('Invalid recommendation catalog');
 const movies=[],seen=new Set();
 for(const name of catalog.feedShards){
  if(!/^feed-\d{4}\.json$/.test(name))throw Error('Invalid recommendation feed shard');
  const rows=await read(name);if(!Array.isArray(rows))throw Error('Invalid recommendation feed');
  for(const movie of rows){if(typeof movie.id!=='string'||!/^\d+$/.test(movie.id)||seen.has(movie.id)||movie.adult===true||!playableTrailer(movie)||!Array.isArray(movie.genreIds))throw Error('Invalid recommendation movie');seen.add(movie.id);movies.push(movie)}
 }
 if(movies.length!==catalog.overview.feedCount)throw Error('Recommendation feed count mismatch');
 movies.sort((a,b)=>(Number(b.popularity)||0)-(Number(a.popularity)||0)||Number(b.id)-Number(a.id));
 const perGenre=new Map(),selected=[];
 for(const m of movies){const ids=[...new Set(m.genreIds.map(String))];if(!ids.some(id=>(perGenre.get(id)||0)<250))continue;for(const id of ids)perGenre.set(id,(perGenre.get(id)||0)+1);const {id,title,createdAt,genreIds,cover,poster,trailer,previewType,duration,views,playable,popularity}=m;selected.push({id,title,createdAt,genreIds,cover,poster,trailer,previewType,duration,views,playable,popularity})}
 const file=join(dir,'similar-movies.json');await writeFile(file+'.tmp',JSON.stringify({version:1,generatedAt:catalog.generatedAt,movies:selected}));await rename(file+'.tmp',file);return {movies:selected.length,genres:perGenre.size};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(await generateSimilarMovies(resolve(process.argv[2]||'dist')));
