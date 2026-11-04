import {readFile} from 'node:fs/promises';
import {buildCatalogOverview,newestFirst,playableTrailer} from '../src/catalog-overview.js';
const dir=process.argv[2]||'public/data',kind=process.argv[3]||'ordinary';
if(!['ordinary','adult'].includes(kind))throw new Error('Expected ordinary or adult');
const read=async name=>JSON.parse(await readFile(`${dir}/${name}`,'utf8'));
const manifest=await read('catalog.json'),genres=await read('genres.json');
if(manifest.shardBy!=='id-modulo-v2'||manifest.shards.length!==manifest.stateShards.length)throw new Error('Unexpected snapshot format');
const movies=new Map(),states=new Map();
for(let i=0;i<manifest.shards.length;i++){
 for(const movie of await read(manifest.shards[i])){if(Number(movie.id)%manifest.shards.length!==i||movies.has(movie.id))throw new Error('Duplicate or misplaced movie');if(kind==='adult'&&movie.adult!==true||kind==='ordinary'&&movie.adult===true)throw new Error('Unexpected adult classification');if(typeof movie.title!=='string'||!movie.title.trim())throw new Error('Movie title missing');movies.set(movie.id,movie)}
 for(const state of await read(manifest.stateShards[i])){if(Number(state.id)%manifest.shards.length!==i||states.has(state.id))throw new Error('Duplicate or misplaced trailer state');states.set(state.id,state)}
}
if(movies.size!==manifest.count)throw new Error('Movie count mismatch');
for(const id of states.keys())if(!movies.has(id))throw new Error('Trailer state has no movie');
const empty={trailer:null,previewType:null,duration:null,views:null,playable:null,regionRestriction:null,trailerChecked:false};
const entries=[...movies.values()].map(movie=>({...movie,...empty,...states.get(movie.id)}));
const expectedFeed=new Set(entries.filter(playableTrailer).map(m=>m.id)),feed=new Set();
for(const name of manifest.feedShards)for(const movie of await read(name)){if(feed.has(movie.id)||!expectedFeed.has(movie.id))throw new Error('Invalid trailer feed');const state=states.get(movie.id);if(!state||state.trailer!==movie.trailer||state.playable!==movie.playable||state.duration!==movie.duration||(state.previewType??null)!==(movie.previewType??null)||(state.views??null)!==(movie.views??null))throw new Error('Trailer feed state mismatch');feed.add(movie.id)}
if(feed.size!==expectedFeed.size)throw new Error('Trailer feed count mismatch');
const sorted=[...entries].sort(newestFirst);let offset=0;
for(let i=0;i<manifest.browseShards.length;i++){
 const cards=await read(manifest.browseShards[i]),browseStates=await read(manifest.browseStateShards[i]);
 for(let j=0;j<cards.length;j++)if(cards[j].id!==sorted[offset+j]?.id)throw new Error('Browse order mismatch');
 const cardIds=new Set(cards.map(card=>card.id)),seenStates=new Set();for(const state of browseStates){const primary=states.get(state.id);if(!cardIds.has(state.id)||seenStates.has(state.id)||!primary||JSON.stringify(state)!==JSON.stringify(primary))throw new Error('Browse state mismatch');seenStates.add(state.id)}
 const expectedStates=cards.reduce((n,c)=>n+Number(states.has(c.id)),0);if(expectedStates!==browseStates.length)throw new Error('Browse state count mismatch');offset+=cards.length;
}
if(offset!==manifest.count)throw new Error('Browse count mismatch');
const overview=buildCatalogOverview(entries,genres);if(JSON.stringify(overview)!==JSON.stringify(manifest.overview))throw new Error('Category overview mismatch');
const featured=sorted.filter(playableTrailer).slice(0,240).map(x=>x.id);if(JSON.stringify(featured)!==JSON.stringify(manifest.featured.map(x=>x.id)))throw new Error('Featured ordering mismatch');
const last=await read('catalog.json');if(last.generatedAt!==manifest.generatedAt)throw new Error('Snapshot changed during audit');
console.log(JSON.stringify({kind,count:movies.size,states:states.size,feed:feed.size,browse:offset,genres:genres.length,complete:manifest.complete,gaps:manifest.auditGaps,generatedAt:manifest.generatedAt}));
