import {buildCatalogOverview,newestFirst,playableTrailer} from './catalog-overview.js';
import {makeCuratedPlaylists} from './curated-playlists.js';
import {youtubeWatchUrl} from './youtube-link.js';
export function createCatalogClient(basePath='/data/',{adult=false}={}){
let metaPromise,fullPromise,feedPromise,fastPromise;
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
async function getFast(meta){
 return fastPromise ||= fetch(basePath+'fast-lists.json').then(async r=>{if(!r.ok)return null;const data=await r.json();return data.generatedAt===meta.catalog.generatedAt&&Array.isArray(data.playlists)&&Array.isArray(data.longs)?data:null}).catch(()=>null);
}
async function api(path){
 const meta=await getMeta(),{catalog,overview,names}=meta;
 const decorate=m=>{const fallback=youtubeWatchUrl(m.trailer)?`https://i.ytimg.com/vi/${m.trailer}/hqdefault.jpg`:'';return {...m,adult:adult||m.adult===true,categoryId:m.genreIds[0]||'',category:names.get(m.genreIds[0])||'',uploader:m.genreIds.map(id=>names.get(id)).filter(Boolean).join(' · '),frame:m.cover||m.poster||fallback,cover:m.poster||m.cover||fallback,duration:m.duration??null}};
 if(path==='/api/config')return {configured:true,account:'trailertube',mode:'static',catalog:{complete:catalog.complete,start:catalog.start||'',end:catalog.end||'',auditGaps:catalog.auditGaps||0,pendingTeasers:catalog.pendingTeasers||0,count:catalog.count??catalog.movies?.length??0,checked:catalog.checked??catalog.movies?.length??0,withTrailer:catalog.withTrailer??catalog.movies?.filter(x=>x.trailer).length??0,...overview}};
 if(path==='/api/categories')return {categories:overview.categories,groups:overview.groups,complete:catalog.complete};
 if(path==='/api/playlists'){const fast=await getFast(meta);const lists=fast?.playlists||(makeCuratedPlaylists((await getFeed(meta)).movies));return {playlists:lists.map(list=>({...list,videos:list.videos.map(decorate)}))}}
 if(path.startsWith('/api/video-briefs?')){const ids=new URL(path,location.origin).searchParams.getAll('id'),feed=await getFeed(meta);return {videos:ids.map(id=>feed.byId.get(id)).filter(Boolean).map(decorate)}}
 if(path.startsWith('/api/video/')){
  const id=decodeURIComponent(path.slice(11));let m=catalog.featured?.find(v=>v.id===id);
  if(!m&&fastPromise){const fast=await fastPromise;if(fast)m=fast.longs.find(v=>v.id===id)||fast.playlists.flatMap(list=>list.videos).find(v=>v.id===id)}
  if(!m&&['id-modulo','id-modulo-v2'].includes(catalog.shardBy)&&/^\d+$/.test(id)){const index=Number(id)%catalog.shards.length;const bucket=await loadShard(catalog.shards[index]);m=bucket.find(v=>v.id===id);if(m&&catalog.shardBy==='id-modulo-v2'){const states=await loadShard(catalog.stateShards[index]);m=applyTrailer(m,states.find(v=>v.id===id))}}
  if(!m&&!['id-modulo','id-modulo-v2'].includes(catalog.shardBy))m=(await getFull(meta)).byId.get(id);
  if(!m)throw new Error('Movie not found');return {video:decorate(m)};
 }
 if(path.startsWith('/api/videos')){
  const q=new URL(path,location.origin).searchParams,page=Number(q.get('page')||1),size=48;
  const query=(q.get('q')||'').toLowerCase(),category=q.get('category')||'',date=q.get('date')||'',sort=q.get('sort')||'',duration=q.get('dur')||'',availability=q.get('show')||'';
  const defaultFeed=!query&&!category&&!date&&!duration&&!availability&&(!sort||sort==='recent');
  if(defaultFeed&&catalog.featured&&Math.min(page*size,overview.feedCount)<=catalog.featured.length)return {videos:catalog.featured.slice((page-1)*size,page*size).map(decorate),page,totalPages:Math.ceil(overview.feedCount/size)};
  if(duration==='xlong'&&!query&&!category&&!date&&!availability&&(!sort||sort==='recent')){const fast=await getFast(meta);if(fast)return {videos:fast.longs.slice((page-1)*size,page*size).map(decorate),page,totalPages:Math.ceil(fast.longs.length/size)}}
  const defaultAll=availability==='all'&&!query&&!category&&!date&&!duration&&(!sort||sort==='recent');
  if(defaultAll&&Array.isArray(catalog.browseShards)){
   const offset=(page-1)*size,end=Math.min(offset+size,catalog.count),chunkSize=catalog.browseShardSize,first=Math.floor(offset/chunkSize),last=Math.floor((end-1)/chunkSize),selected=[];
   for(let index=first;index<=last;index++){const [cards,states]=await Promise.all([loadShard(catalog.browseShards[index]),loadShard(catalog.browseStateShards[index])]);const byId=new Map(states.map(state=>[state.id,state])),start=Math.max(offset-index*chunkSize,0),stop=Math.min(end-index*chunkSize,cards.length);selected.push(...cards.slice(start,stop).map(movie=>applyTrailer(movie,byId.get(movie.id))))}
   return {videos:selected.map(decorate),page,totalPages:Math.ceil(catalog.count/size)};
  }

  const full=await (availability==='all'?getFull(meta):getFeed(meta)),key=JSON.stringify([query,category,date,sort,duration,availability]);let movies=full.queries.get(key);
  if(!movies){
   if(sort==='popular'&&!full.popular)full.popular=[...full.movies].sort((a,b)=>b.popularity-a.popularity||Number(b.id)-Number(a.id));
   const categoryIds=category?category.split(','):[];
   movies=(sort==='popular'?full.popular:full.newest).filter(m=>(availability==='all'||playableTrailer(m))&&(!query||(`${m.title} ${m.description||''}`).toLowerCase().includes(query))&&(!categoryIds.length||categoryIds.some(id=>id==='uncategorized'?!m.genreIds.length:m.genreIds.includes(id))));
   if(date==='year'){const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-1);const iso=cutoff.toISOString().slice(0,10);movies=movies.filter(m=>m.createdAt>=iso)}
   else if(/^\d{3}0s$/.test(date))movies=movies.filter(m=>m.createdAt.startsWith(date.slice(0,3)));
   if(duration)movies=movies.filter(m=>typeof m.duration==='number'&&m.playable!==false&&(duration==='short'?m.duration<240:duration==='medium'?m.duration>=240&&m.duration<1200:duration==='long'?m.duration>=1200&&m.duration<3600:duration==='xlong'?m.duration>=3600:true));
   if(sort==='old')movies.reverse();
   if(query){const ranked=[[],[],[],[]];for(const movie of movies){const title=(movie.title||'').toLowerCase();let rank=3;if(title===query)rank=0;else if(title.startsWith(query)&&(!title[query.length]||!/[\p{L}\p{N}]/u.test(title[query.length])))rank=1;else if(title.includes(query))rank=2;ranked[rank].push(movie)}movies=ranked.flat()}
   if(full.queries.size>=4)full.queries.delete(full.queries.keys().next().value);full.queries.set(key,movies);
  }
  return {videos:movies.slice((page-1)*size,page*size).map(decorate),page,totalPages:Math.ceil(movies.length/size)};
 }
 throw new Error('Unknown catalog request');
}

return api;
}
export const api=createCatalogClient('/data/');
export const adultApi=createCatalogClient('/adult-data/',{adult:true});
