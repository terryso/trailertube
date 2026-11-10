// Refresh watch-provider availability for the bounded homepage pilot.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTmdbClient} from '../incremental/tmdb-client.mjs';

export async function refreshWatchProviders(site,{apiKey=process.env.TMDB_API_KEY,request}={}){
 if(!apiKey)return {skipped:true,reason:'no-tmdb-api-key'};
 const root=resolve(site);
 const clientRequest=request||createTmdbClient({key:apiKey});
 const catalog=JSON.parse(await readFile(`${root}/data/catalog.json`));
 const lists=JSON.parse(await readFile(`${root}/data/fast-lists.json`));
 if(catalog.generatedAt!==lists.generatedAt)throw Error('Mismatched snapshots');
 const popular=lists.playlists.find(x=>x.id==='popular-trailers')?.videos;
 if(!Array.isArray(catalog.featured)||!Array.isArray(popular))throw Error('Missing homepage selection');
 const ids=[...new Set([...catalog.featured.slice(0,48),...popular.slice(0,10)].map(x=>String(x.id)))];
 if(!ids.length||ids.some(x=>!/^[1-9]\d*$/.test(x)))throw Error('Invalid IDs');
 const movies={};
 for(const id of ids){const data=await clientRequest(`/movie/${id}/watch/providers`);if(String(data?.id)!==id||!data.results||typeof data.results!=='object'||Array.isArray(data.results))throw Error(`Invalid response for ${id}`);movies[id]=data.results}
 const out=`${root}/data/watch-providers.json`;await writeFile(out+'.tmp',JSON.stringify({updatedAt:new Date().toISOString(),movies}));await rename(out+'.tmp',out);
 return {movies:ids.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await refreshWatchProviders(resolve(process.argv[2]||'dist'));
 console.log(result.skipped?`Skipped watch providers: ${result.reason}`:`Refreshed ${result.movies} movies`);
}
