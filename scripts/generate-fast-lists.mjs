import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCuratedPlaylists} from '../src/curated-playlists.js';
import {newestFirst,playableTrailer} from '../src/catalog-overview.js';

export async function generateFastLists(site) {
 for(const part of ['data','adult-data']){
  const dir=join(site,part);let catalog;try{catalog=JSON.parse(await readFile(join(dir,'catalog.json'),'utf8'))}catch(e){if(e.code==='ENOENT')continue;throw e}
  if(!Array.isArray(catalog.feedShards)||!catalog.generatedAt)throw Error('Unsupported catalog for fast lists');
  const movies=[];for(const name of catalog.feedShards){if(!/^feed-\d{4}\.json$/.test(name))throw Error('Invalid feed shard');movies.push(...JSON.parse(await readFile(join(dir,name),'utf8')))}
  const longs=movies.filter(m=>playableTrailer(m)&&typeof m.duration==='number'&&m.duration>=3600&&m.playable!==false).sort(newestFirst);
  await writeFile(join(dir,'fast-lists.json'),JSON.stringify({generatedAt:catalog.generatedAt,playlists:makeCuratedPlaylists(movies),longs}));
  const categories={};
  const keys=new Set([...(catalog.overview?.categories||[]),...(catalog.overview?.groups||[])].map(item=>String(item.id)));
  const ordered=movies.filter(playableTrailer).sort(newestFirst);
  for(const key of keys){const ids=key.split(',');if(!ids.every(id=>id==='uncategorized'||/^\d+$/.test(id)))continue;let total=0;const videos=[];for(const movie of ordered){if(!ids.some(id=>id==='uncategorized'?!movie.genreIds.length:movie.genreIds.includes(id)))continue;total++;if(videos.length<48)videos.push(movie)}categories[key]={total,videos}}
  await writeFile(join(dir,'category-first-pages.json'),JSON.stringify({generatedAt:catalog.generatedAt,categories}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await generateFastLists(resolve(process.argv[2]||'dist'));
