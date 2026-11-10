import {readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const byId=(a,b)=>Number(a.id)-Number(b.id);
async function atomic(path,data){await writeFile(path+'.tmp',JSON.stringify(data));await rename(path+'.tmp',path)}

// Build compact per-bucket display records for feed movies so detail pages can
// resolve from one small shard instead of the full catalog and state shards.
export async function generateFeedDetails(site){
 const dir=join(site,'data'),read=async name=>JSON.parse(await readFile(join(dir,name),'utf8'));
 const catalog=await read('catalog.json');
 if(catalog.shardBy!=='id-modulo-v2'||!catalog.generatedAt||!Array.isArray(catalog.shards)||catalog.shards.length!==64||!Array.isArray(catalog.stateShards)||catalog.stateShards.length!==64||!Array.isArray(catalog.feedShards)||!catalog.feedShards.length)throw Error('Unsupported catalog for feed details');
 const feedIds=new Map();
 for(const name of catalog.feedShards){
  if(!/^feed-\d{4}\.json$/.test(name))throw Error('Invalid feed shard');
  for(const movie of await read(name)){if(typeof movie.id!=='string'||!/^[1-9]\d*$/.test(movie.id))throw Error('Invalid feed movie');if(feedIds.has(movie.id))throw Error('Duplicate feed movie');feedIds.set(movie.id,movie)}
 }
 const buckets=Array.from({length:64},()=>[]);
 for(let i=0;i<64;i++){
  const suffix=String(i).padStart(4,'0');if(catalog.shards[i]!==`catalog-${suffix}.json`||catalog.stateShards[i]!==`state-${suffix}.json`)throw Error('Invalid feed details shard');
  const [details,states]=await Promise.all([read(catalog.shards[i]),read(catalog.stateShards[i])]);if(!Array.isArray(details)||!Array.isArray(states))throw Error('Invalid feed details source');
  const stateById=new Map(states.map(state=>[String(state.id),state]));
  for(const movie of details){
   const id=String(movie.id),feed=feedIds.get(id);if(!feed)continue;if(Number(id)%64!==i)throw Error('Movie in wrong feed details bucket');
   const {trailer,previewType,duration,views,playable,regionRestriction,trailerChecked}=feed,state=stateById.get(id),record={...movie,trailer,previewType,duration,views,playable,regionRestriction,trailerChecked};
   if(state?.trailerVariantsTracked===true)record.trailerVariantsTracked=true,record.trailerVariants=state.trailerVariants;
   buckets[i].push(record);feedIds.delete(id);
  }
 }
 if(feedIds.size)throw Error(`Feed movies missing from detail shards: ${[...feedIds.keys()].slice(0,3).join(', ')}${feedIds.size>3?'…':''}`);
 const shards=[];for(let i=0;i<64;i++){const name=`feed-details-${String(i).padStart(4,'0')}.json`;buckets[i].sort(byId);await atomic(join(dir,name),buckets[i]);shards.push(name)}
 const count=buckets.reduce((total,bucket)=>total+bucket.length,0),samples=[...buckets.keys()].sort((a,b)=>buckets[b].length-buckets[a].length||a-b).slice(0,2);
 await atomic(join(dir,'feed-details-manifest.json'),{version:1,generatedAt:catalog.generatedAt,shards,count,samples});
 return {movies:count,shards:shards.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await generateFeedDetails(resolve(process.argv[2]||'dist'))));
