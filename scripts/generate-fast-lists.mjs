import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCuratedPlaylists} from '../src/curated-playlists.js';
import {newestFirst,playableTrailer} from '../src/catalog-overview.js';
import {validTrailerVariants} from '../src/trailer-variants.js';

export async function generateFastLists(site) {
 for(const part of ['data','adult-data']){
  const dir=join(site,part);let catalog;try{catalog=JSON.parse(await readFile(join(dir,'catalog.json'),'utf8'))}catch(e){if(e.code==='ENOENT')continue;throw e}
  if(!Array.isArray(catalog.feedShards)||!catalog.generatedAt)throw Error('Unsupported catalog for fast lists');
  const movies=[];for(const name of catalog.feedShards){if(!/^feed-\d{4}\.json$/.test(name))throw Error('Invalid feed shard');movies.push(...JSON.parse(await readFile(join(dir,name),'utf8')))}
  const longs=movies.filter(m=>playableTrailer(m)&&typeof m.duration==='number'&&m.duration>=3600&&m.playable!==false).sort(newestFirst);
  const playlists=makeCuratedPlaylists(movies),homeDetails=[];
  if(catalog.shardBy==='id-modulo-v2'&&Array.isArray(catalog.shards)&&catalog.shards.length){
   if(!Array.isArray(catalog.stateShards)||catalog.stateShards.length!==catalog.shards.length)throw Error('Invalid homepage state shards');
   const popular=playlists.find(p=>p.id==='popular-trailers')?.videos.slice(0,10)||[],buckets=new Map();
   for(const movie of popular){const index=Number(movie.id)%catalog.shards.length,name=catalog.shards[index],stateName=catalog.stateShards[index],suffix=String(index).padStart(4,'0');if(name!==`catalog-${suffix}.json`||stateName!==`state-${suffix}.json`)throw Error('Invalid homepage detail shard');if(!buckets.has(index)){const [details,states]=await Promise.all([readFile(join(dir,name),'utf8').then(JSON.parse),readFile(join(dir,stateName),'utf8').then(JSON.parse)]);if(!Array.isArray(details)||!Array.isArray(states))throw Error('Invalid homepage detail data');buckets.set(index,{details,states})}const bucket=buckets.get(index),detail=bucket.details.find(item=>item.id===movie.id),state=bucket.states.find(item=>item.id===movie.id);if(!detail||!state||state.trailer!==movie.trailer||state.playable!==movie.playable)throw Error('Homepage detail is missing or inconsistent');const tracked=state.trailerVariantsTracked===true,variants=state.trailerVariants;if(tracked&&(!Array.isArray(variants)||validTrailerVariants(variants).length!==variants.length)||!tracked&&variants?.length)throw Error('Invalid homepage trailer variants');homeDetails.push({...detail,...movie,...(tracked?{trailerVariantsTracked:true,trailerVariants:variants}:{})})}
  }
  await writeFile(join(dir,'fast-lists.json'),JSON.stringify({generatedAt:catalog.generatedAt,playlists,longs,homeDetails,homeDetailsVersion:2}));
  const categories={};
  const keys=new Set([...(catalog.overview?.categories||[]),...(catalog.overview?.groups||[])].map(item=>String(item.id)));
  const ordered=movies.filter(playableTrailer).sort(newestFirst);
  for(const key of keys){const ids=key.split(',');if(!ids.every(id=>id==='uncategorized'||/^\d+$/.test(id)))continue;let total=0;const videos=[];for(const movie of ordered){if(!ids.some(id=>id==='uncategorized'?!movie.genreIds.length:movie.genreIds.includes(id)))continue;total++;if(videos.length<48)videos.push(movie)}categories[key]={total,videos}}
  await writeFile(join(dir,'category-first-pages.json'),JSON.stringify({generatedAt:catalog.generatedAt,categories}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await generateFastLists(resolve(process.argv[2]||'dist'));
