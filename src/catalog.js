import {buildCatalogOverview,newestFirst,playableTrailer} from './catalog-overview.js';
import {makeCuratedPlaylists} from './curated-playlists.js';
import {youtubeWatchUrl} from './youtube-link.js';
import {decodeSearchMovie,movieSearchRank} from './search-index.js';
// Shared with the home prerender generator so the inline bootstrap payload
// carries exactly the shape the client-side playlists decorate to.
export function decorateMovie(movie,names=new Map(),adult=false){
 const fallback=youtubeWatchUrl(movie.trailer)?`https://i.ytimg.com/vi/${movie.trailer}/hqdefault.jpg`:'';
 return {...movie,adult:adult||movie.adult===true,categoryId:movie.genreIds?.[0]||'',category:names.get(movie.genreIds?.[0])||'',uploader:(movie.genreIds||[]).map(id=>names.get(id)).filter(Boolean).join(' · '),frame:movie.cover||movie.poster||fallback,cover:movie.poster||movie.cover||fallback,duration:movie.duration??null};
}
export function createCatalogClient(basePath='/data/',{adult=false}={}){
let metaPromise,fullPromise,feedPromise,fastPromise,peoplePromise,categoryPagesPromise,feedDetailsPromise,searchPromise;
const shardPromises=new Map();
async function loadShard(name){
 if(!shardPromises.has(name))shardPromises.set(name,(async()=>{
  for(let attempt=0;attempt<4;attempt++){
   try{const r=await fetch(basePath+name);if(r.ok)return await r.json();if(r.status!==429&&r.status<500)throw new Error(`Catalog segment unavailable (HTTP ${r.status})`)}catch(e){if(attempt===3)throw e}
   await new Promise(resolve=>setTimeout(resolve,300*2**attempt));
  }throw new Error('Catalog segment unavailable after retries');
 })().catch(e=>{shardPromises.delete(name);throw e}));
 return shardPromises.get(name);
}
async function loadShards(names){
 const parts=new Array(names.length);let next=0;
 async function worker(){while(next<names.length){const index=next++;parts[index]=await loadShard(names[index])}}
 await Promise.all(Array.from({length:Math.min(6,names.length)},worker));return parts.flat();
}
function makeState(movies){return {movies,byId:new Map(movies.map(m=>[m.id,m])),newest:[...movies].sort(newestFirst),queries:new Map(),popular:null}}
const emptyTrailer={trailer:null,previewType:null,duration:null,views:null,playable:null,regionRestriction:null,trailerChecked:false};
function applyTrailer(movie,state){return {...movie,...emptyTrailer,...state}}
async function getMeta(){
 return metaPromise ||= Promise.all([fetch(basePath+'catalog.json'),fetch(basePath+'genres.json')]).then(async ([a,b])=>{
  if(!a.ok||!b.ok)throw new Error('Catalog unavailable');
  const catalog=await a.json(),genres=await b.json();
  if(!catalog.movies&&!catalog.overview){catalog.movies=await loadShards(catalog.shards)}
  const overview=catalog.overview||buildCatalogOverview(catalog.movies,genres);
  return {catalog,genres,overview,names:new Map(genres.map(g=>[String(g.id),g.name]))};
 }).catch(e=>{metaPromise=null;throw e});
}
async function getFull(meta){
 return fullPromise ||= (async()=>{let movies=meta.catalog.movies||await loadShards(meta.catalog.shards);if(meta.catalog.shardBy==='id-modulo-v2'){const states=await loadShards(meta.catalog.stateShards),byId=new Map(states.map(state=>[state.id,state]));movies=movies.map(movie=>applyTrailer(movie,byId.get(movie.id)))}return makeState(movies)})().catch(e=>{fullPromise=null;throw e});
}
async function getFeed(meta){
 if(!Array.isArray(meta.catalog.feedShards))return getFull(meta);
 return feedPromise ||= (async()=>makeState(await loadShards(meta.catalog.feedShards)))().catch(e=>{feedPromise=null;throw e});
}
// The fast-lists download must not wait for the catalog manifest: home boot
// awaits both, and serializing them pushed the hydration swap (and LCP) out
// by a full extra transfer on slow links. warmHome() starts both in parallel.
let fastListsBody=null;
const fetchFastLists=()=>fastListsBody ||= fetch(basePath+'fast-lists.json').then(async r=>r.ok?r.json():null).catch(()=>null);
async function getFast(meta){
 return fastPromise ||= (async()=>{const data=await fetchFastLists();return data&&data.generatedAt===meta.catalog.generatedAt&&Array.isArray(data.playlists)&&Array.isArray(data.longs)?data:null})();
}
async function getFeedDetails(meta){
 return feedDetailsPromise ||= fetch(basePath+'feed-details-manifest.json').then(async r=>{if(!r.ok)return null;const data=await r.json();return data?.version===1&&data.generatedAt===meta.catalog.generatedAt&&Array.isArray(data.shards)&&data.shards.length===64&&data.shards.every((n,i)=>n===`feed-details-${String(i).padStart(4,'0')}.json`)?data:null}).catch(()=>null);
}
async function getSearch(meta){
 if(adult)return null;
 return searchPromise ||= fetch(basePath+'search-manifest.json').then(async r=>{if(!r.ok)return null;const manifest=await r.json();if(manifest.generatedAt!==meta.catalog.generatedAt||manifest.version!==1||manifest.count!==meta.overview.feedCount||!Array.isArray(manifest.shards)||!manifest.shards.length||manifest.shards.some((n,i)=>n!==`search-${String(i).padStart(4,'0')}.json`))return null;const records=[];for(const shard of await Promise.all(manifest.shards.map(name=>loadShard(name)))){if(!shard||shard.generatedAt!==meta.catalog.generatedAt||shard.version!==1||!Array.isArray(shard.records))return null;records.push(...shard.records)}if(records.length!==manifest.count)return null;const movies=records.map(decodeSearchMovie),ids=new Set(movies.map(m=>m.id));if(ids.size!==movies.length)return null;return makeState(movies)}).catch(()=>{searchPromise=null;return null});
}
async function api(path){
 const meta=await getMeta(),{catalog,overview,names}=meta;
 const decorate=m=>decorateMovie(m,names,adult);
 if(path==='/api/config')return {configured:true,account:'trailertube',mode:'static',catalog:{generatedAt:catalog.generatedAt||'',complete:catalog.complete,start:catalog.start||'',end:catalog.end||'',auditGaps:catalog.auditGaps||0,pendingTeasers:catalog.pendingTeasers||0,count:catalog.count??catalog.movies?.length??0,checked:catalog.checked??catalog.movies?.length??0,withTrailer:catalog.withTrailer??catalog.movies?.filter(x=>x.trailer).length??0,...overview}};
 if(path==='/api/categories')return {categories:overview.categories,groups:overview.groups,complete:catalog.complete};
 if(path.startsWith('/api/person/')){
  const id=path.slice('/api/person/'.length);if(adult||!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))throw new Error('Person not found');
  const index=await (peoplePromise ||= fetch(basePath+'people-manifest.json').then(async r=>{if(!r.ok)throw new Error('Person information is temporarily unavailable');const data=await r.json();if(data.generatedAt!==catalog.generatedAt||!Array.isArray(data.shards)||data.shards.length!==64||data.shards.some((n,i)=>n!==`people/person-${String(i).padStart(4,'0')}.json`))throw new Error('Person information does not match the catalog');return data}).catch(e=>{peoplePromise=null;throw e}));
  const part=await loadShard(index.shards[Number(id)%64]);if(part.generatedAt!==catalog.generatedAt||!Array.isArray(part.people))throw new Error('Person information does not match the catalog');const person=part.people.find(p=>String(p.id)===id);if(!person||!Array.isArray(person.films))throw new Error('Person not found');return {person:{...person,films:person.films.map(decorate)}};
 }
 if(path==='/api/playlists'){const fast=await getFast(meta);const lists=fast?.playlists||(makeCuratedPlaylists((await getFeed(meta)).movies));return {playlists:lists.map(list=>({...list,videos:list.videos.map(decorate)}))}}
 if(path.startsWith('/api/video-briefs?')){const ids=new URL(path,location.origin).searchParams.getAll('id'),feed=await getFeed(meta);return {videos:ids.map(id=>feed.byId.get(id)).filter(Boolean).map(decorate)}}
 if(path.startsWith('/api/video/')||path.startsWith('/api/warm/')){
  const id=decodeURIComponent(path.slice(path.startsWith('/api/warm/')?10:11));let m=catalog.featured?.find(v=>v.id===id);
  if(!m&&fastPromise){const fast=await fastPromise;if(fast?.homeDetailsVersion===2&&Array.isArray(fast.homeDetails))m=fast.homeDetails.find(v=>v.id===id)}
  if(!m&&fastPromise&&!catalog.movieDetailsVersion){const fast=await fastPromise;if(fast)m=fast.longs.find(v=>v.id===id)||fast.playlists.flatMap(list=>list.videos).find(v=>v.id===id)}
  if(!m&&['id-modulo','id-modulo-v2'].includes(catalog.shardBy)&&/^\d+$/.test(id)){
   const feedDetails=await getFeedDetails(meta);
   if(feedDetails){const bucket=await loadShard(feedDetails.shards[Number(id)%64]);if(Array.isArray(bucket))m=bucket.find(v=>v.id===id)}
  }
  if(!m&&['id-modulo','id-modulo-v2'].includes(catalog.shardBy)&&/^\d+$/.test(id)){const index=Number(id)%catalog.shards.length;const [bucket,states]=await Promise.all([loadShard(catalog.shards[index]),catalog.shardBy==='id-modulo-v2'?loadShard(catalog.stateShards[index]):Promise.resolve(null)]);m=bucket.find(v=>v.id===id);if(m&&states)m=applyTrailer(m,states.find(v=>v.id===id))}
  if(!m&&!['id-modulo','id-modulo-v2'].includes(catalog.shardBy))m=(await getFull(meta)).byId.get(id);
  if(!m)throw new Error('Movie not found');return {video:decorate(m)};
 }
 if(path.startsWith('/api/videos')){
  const q=new URL(path,location.origin).searchParams,page=Number(q.get('page')||1),size=48;
  const query=(q.get('q')||'').trim().toLowerCase(),category=q.get('category')||'',date=q.get('date')||'',sort=q.get('sort')||'',duration=q.get('dur')||'',availability=q.get('show')||'';
  const defaultFeed=!query&&!category&&!date&&!duration&&!availability&&(!sort||sort==='recent');
  if(defaultFeed&&catalog.featured&&Math.min(page*size,overview.feedCount)<=catalog.featured.length)return {videos:catalog.featured.slice((page-1)*size,page*size).map(decorate),page,totalPages:Math.ceil(overview.feedCount/size)};
  if(duration==='xlong'&&!query&&!category&&!date&&!availability&&(!sort||sort==='recent')){const fast=await getFast(meta);if(fast)return {videos:fast.longs.slice((page-1)*size,page*size).map(decorate),page,totalPages:Math.ceil(fast.longs.length/size)}}
  if(page===1&&category&&!query&&!date&&!duration&&!availability&&(!sort||sort==='recent')&&catalog.generatedAt){
   const index=await (categoryPagesPromise ||= fetch(basePath+'category-first-pages.json').then(async r=>r.ok?await r.json():null).catch(()=>null));
   const result=index?.generatedAt===catalog.generatedAt?index.categories?.[category]:null;
   if(result&&Array.isArray(result.videos)&&Number.isSafeInteger(result.total)&&result.total>=result.videos.length)return {videos:result.videos.map(decorate),page,totalPages:Math.ceil(result.total/size)};
  }
  const defaultAll=availability==='all'&&!query&&!category&&!date&&!duration&&(!sort||sort==='recent');
  if(defaultAll&&Array.isArray(catalog.browseShards)){
   const offset=(page-1)*size,end=Math.min(offset+size,catalog.count),chunkSize=catalog.browseShardSize,first=Math.floor(offset/chunkSize),last=Math.floor((end-1)/chunkSize),selected=[];
   for(let index=first;index<=last;index++){const [cards,states]=await Promise.all([loadShard(catalog.browseShards[index]),loadShard(catalog.browseStateShards[index])]);const byId=new Map(states.map(state=>[state.id,state])),start=Math.max(offset-index*chunkSize,0),stop=Math.min(end-index*chunkSize,cards.length);selected.push(...cards.slice(start,stop).map(movie=>applyTrailer(movie,byId.get(movie.id))))}
   return {videos:selected.map(decorate),page,totalPages:Math.ceil(catalog.count/size)};
  }

  const full=await (availability==='all'?getFull(meta):query&&!adult?(async()=>await getSearch(meta)||await getFeed(meta))():getFeed(meta)),key=JSON.stringify([query,category,date,sort,duration,availability]);let movies=full.queries.get(key);
  if(!movies){
   if(sort==='popular'&&!full.popular)full.popular=[...full.movies].sort((a,b)=>b.popularity-a.popularity||Number(b.id)-Number(a.id));
   const categoryIds=category?category.split(','):[];
   movies=(sort==='popular'?full.popular:full.newest).filter(m=>(availability==='all'||playableTrailer(m))&&(!query||movieSearchRank(m,query)>=0)&&(!categoryIds.length||categoryIds.some(id=>id==='uncategorized'?!m.genreIds.length:m.genreIds.includes(id))));
   if(date==='year'){const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-1);const iso=cutoff.toISOString().slice(0,10);movies=movies.filter(m=>m.createdAt>=iso)}
   else if(/^\d{3}0s$/.test(date))movies=movies.filter(m=>m.createdAt.startsWith(date.slice(0,3)));
   if(duration)movies=movies.filter(m=>typeof m.duration==='number'&&m.playable!==false&&(duration==='short'?m.duration<240:duration==='medium'?m.duration>=240&&m.duration<1200:duration==='long'?m.duration>=1200&&m.duration<3600:duration==='xlong'?m.duration>=3600:true));
   if(sort==='old')movies.reverse();
   if(query){const ranked=Array.from({length:7},()=>[]);for(const movie of movies){const rank=movieSearchRank(movie,query);if(rank>=0)ranked[rank].push(movie)}movies=ranked.flat()}
   if(full.queries.size>=4)full.queries.delete(full.queries.keys().next().value);full.queries.set(key,movies);
  }
  return {videos:movies.slice((page-1)*size,page*size).map(decorate),page,totalPages:Math.ceil(movies.length/size)};
 }
 throw new Error('Unknown catalog request');
}

 const warmed=new Set();
 api.warmMovie=id=>{if(typeof id!=='string'||!/^[1-9]\d*$/.test(id)||warmed.has(id))return Promise.resolve();warmed.add(id);return api('/api/warm/'+encodeURIComponent(id)).catch(()=>{})};
 api.warmHome=withFastLists=>{getMeta().catch(()=>{});if(withFastLists)fetchFastLists()};
 return api;
}
export const api=createCatalogClient('/data/'),warmMovie=api.warmMovie;
export const adultApi=createCatalogClient('/adult-data/',{adult:true});
