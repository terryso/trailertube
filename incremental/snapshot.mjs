import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const emptyState={trailer:null,trailerPublishedAt:null,previewType:null,duration:null,views:null,playable:null,regionRestriction:null,trailerChecked:false};
const namePattern=/^(catalog|state)-\d{4}\.json$/;
const read=async path=>JSON.parse(await readFile(path,'utf8'));

/** Load the authoritative movie and trailer state shards, never the feed subset. */
export async function readSnapshot(dir, kind) {
  if (!['ordinary','adult'].includes(kind)) throw new Error('Invalid catalog kind');
  const manifest=await read(join(dir,'catalog.json'));
  if (manifest.shardBy!=='id-modulo-v2'||!Array.isArray(manifest.shards)||!Array.isArray(manifest.stateShards)||manifest.shards.length!==64||manifest.stateShards.length!==64) throw new Error('Unexpected snapshot format');
  const entries=new Map();
  for(let i=0;i<64;i++) {
    const movieName=manifest.shards[i],stateName=manifest.stateShards[i];
    if (!namePattern.test(movieName)||!namePattern.test(stateName)||movieName!==`catalog-${String(i).padStart(4,'0')}.json`||stateName!==`state-${String(i).padStart(4,'0')}.json`) throw new Error('Invalid shard name');
    const movies=await read(join(dir,movieName)), states=await read(join(dir,stateName));
    if(!Array.isArray(movies)||!Array.isArray(states))throw new Error('Invalid shard');
    for(const movie of movies){const id=String(movie.id);if(!/^\d+$/.test(id)||Number(id)%64!==i||entries.has(id)||(kind==='adult' ? movie.adult!==true : movie.adult===true))throw new Error('Invalid movie classification or ID');entries.set(id,{...movie,...emptyState,id});}
    const seen=new Set();for(const state of states){const id=String(state.id);if(seen.has(id)||!entries.has(id)||Number(id)%64!==i)throw new Error('Invalid trailer state');seen.add(id);entries.set(id,{...entries.get(id),...state,id});}
  }
  if(entries.size!==manifest.count)throw new Error('Snapshot count mismatch');
  const after=await read(join(dir,'catalog.json'));if(after.generatedAt!==manifest.generatedAt)throw new Error('Snapshot changed while reading');
  return {manifest,genres:await read(join(dir,'genres.json')),entries};
}

/** Apply fully validated updates without mutating the source snapshot. */
export function mergeUpdates({ordinary,adult,updates,start,end}) {
  const nextOrdinary=new Map(ordinary),nextAdult=new Map(adult),seen=new Set();
  for(const catalog of [nextOrdinary,nextAdult])for(const [id,entry] of catalog)if(entry.createdAt<start||entry.createdAt>end)catalog.delete(id);
  for(const update of updates){
    const id=String(update?.id);if(!/^\d+$/.test(id)||seen.has(id)||typeof update.adult!=='boolean')throw new Error('Invalid or duplicate update');seen.add(id);
    if(update.deferred===true){const old=ordinary.get(id)||adult.get(id);nextOrdinary.delete(id);nextAdult.delete(id);if(old&&old.createdAt>=start&&old.createdAt<=end)(update.adult?nextAdult:nextOrdinary).set(id,{...old,adult:update.adult});continue;}
    if(update.ignored===true){if(nextOrdinary.has(id)||nextAdult.has(id))throw new Error('Cannot ignore an existing movie');continue;}
    if(update.removed===true){nextOrdinary.delete(id);nextAdult.delete(id);continue;}
    if(typeof update.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(update.createdAt)||typeof update.title!=='string'||!update.title.trim())throw new Error('Incomplete movie update');
    const old=nextOrdinary.get(id)||nextAdult.get(id);nextOrdinary.delete(id);nextAdult.delete(id);
    if(update.createdAt<start||update.createdAt>end)continue;
    const entry={...emptyState,...old,...update,id};(entry.adult?nextAdult:nextOrdinary).set(id,entry);
  }
  return {ordinary:nextOrdinary,adult:nextAdult};
}
