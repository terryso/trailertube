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
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await generateFastLists(resolve(process.argv[2]||'dist'));
