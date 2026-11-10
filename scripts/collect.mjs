import {movieTitle} from '../src/movie-title.js';
import { readFile, writeFile, mkdir, appendFile, rename } from 'node:fs/promises';
import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from './youtube-data.mjs';
import {writeCatalogSnapshot} from './write-catalog.mjs';
import {previewCandidates,repairUnavailableTrailers,previewChecked,needsPreviewCheck,needsTeaserBackfill} from './trailer-selection.mjs';
import {readSupplement,mergeOrdinarySupplement,reconcileOrdinaryGaps} from './adult-supplement.mjs';
import {syncAdultSnapshot} from './sync-adult-snapshot.mjs';

// Credentials are consumed only by this local collector; they never enter public/.
const key = process.env.TMDB_API_KEY;
if (!key) throw new Error('Set TMDB_API_KEY before running the collector.');
const seed = process.argv.includes('--seed');
const today=process.env.COLLECT_END||new Intl.DateTimeFormat('en-CA',{timeZone:process.env.COLLECT_TIMEZONE||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const [year,month,day]=today.split('-').map(Number),startYear=year-10,startDay=Math.min(day,new Date(Date.UTC(startYear,month,0)).getUTCDate());
const start=process.env.COLLECT_START||`${startYear}-${String(month).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`;
const cache = '.cache';
const trailerLanguages='en,ko,fr,es,de,ja,zh,hi,pt,it,ru,ar,tr,pl,nl,sv,id,th,uk,vi,da,fi,no,he,el,ro,hu,cs,fa,ta,te,ml,bn,mr,ur,ms,ca,et,lv,lt'.split(',');
await mkdir(cache, {recursive:true}); await mkdir('public/data',{recursive:true});
const readJson = async p => { try {return JSON.parse(await readFile(p,'utf8'))} catch(e) {if(e.code==='ENOENT')return null;throw e} };
async function atomic(path, data) {await writeFile(path+'.tmp',JSON.stringify(data)); await rename(path+'.tmp',path)}
let nextStart = 0;
async function request(path, params={}) {
  for(let attempt=0;attempt<7;attempt++) {
    const now=Date.now(), scheduled=Math.max(now,nextStart);nextStart=scheduled+85;const wait=scheduled-now;if(wait)await new Promise(r=>setTimeout(r,wait));
    const url=new URL('https://api.themoviedb.org/3'+path);url.search=new URLSearchParams({...params,api_key:key});
    try {const res=await fetch(url,{signal:AbortSignal.timeout(30000)}); if(res.status===404&&path.endsWith('/videos'))return {results:[]}; if(res.status===429||res.status>=500) {await new Promise(r=>setTimeout(r,Math.min(30000,1000*2**attempt)));continue;} if(!res.ok)throw new Error(`TMDB HTTP ${res.status} for ${path}`);return await res.json()} catch(e){if(attempt===6)throw new Error(`TMDB request failed: ${path}: ${e.name}`); await new Promise(r=>setTimeout(r,1000*2**attempt))}
  } throw new Error(`TMDB retries exceeded: ${path}`);
}
const genres=await request('/genre/movie/list',{language:'en-US'});
await atomic('public/data/genres.json',genres.genres);
const movies=new Map();let auditFailures=[];
async function pagesFor(params, first, into) {
 if(first.total_pages>500)throw new Error(`Daily result exceeds TMDB 500-page limit: ${params['primary_release_date.gte']}`);
 for(const m of first.results)into.set(m.id,m);
 let page=2;async function pageWorker(){while(page<=first.total_pages){const n=page++;const result=await request('/discover/movie',{...params,page:n});for(const m of result.results)into.set(m.id,m)}}
 await Promise.all(Array.from({length:4},pageWorker));
}
async function discoverDay(date) {
 const file=`${cache}/day-${date}.json`;let stored=await readJson(file);
 if(stored?.audited){for(const m of stored.items)movies.set(m.id,m);return}
 const params={'primary_release_date.gte':date,'primary_release_date.lte':date,include_adult:'false',include_video:'false',language:'en-US'};
 const found=new Map((stored?.items||[]).map(m=>[m.id,m]));let expected=0;
 for(const sort of ['popularity.desc','popularity.asc','vote_count.desc']) {
  const query={...params,sort_by:sort};const first=await request('/discover/movie',{...query,page:1});expected=Math.max(expected,first.total_results);await pagesFor(query,first,found);if(found.size>=expected)break;
 }
 const audited=found.size>=expected;await atomic(file,{date,expected,audited,items:[...found.values()]});
 for(const m of found.values())movies.set(m.id,m);if(!audited)auditFailures.push({date,expected,actual:found.size});
}
if(seed){
 const seedFiles=(await import('node:fs/promises')).readdir(cache);for(const f of await seedFiles)if(/^discover-.*_3\.json$/.test(f)){for(const m of await readJson(`${cache}/${f}`))movies.set(m.id,m)}
 if(!movies.size)throw new Error('Seed cache not available; run the previous seed import or run the full collector.');
}else{
 const dates=[];let at=new Date(start+'T00:00:00Z');while(at.toISOString().slice(0,10)<=today){dates.push(at.toISOString().slice(0,10));at=new Date(at.getTime()+86400000)}
 let current=0,doneDays=0;async function dateWorker(){while(current<dates.length){const date=dates[current++];await discoverDay(date);doneDays++;if(doneDays%100===0)console.log(`audited days ${doneDays}/${dates.length}; movies ${movies.size}; gaps ${auditFailures.length}`)}}await Promise.all(Array.from({length:4},dateWorker));
 await atomic(`${cache}/audit.json`,{start,end:today,days:dates.length,gaps:auditFailures});
}
const supplement=await readSupplement(cache,start,today),merged=mergeOrdinarySupplement(movies,supplement);
if(merged.added.length||merged.removed.length)console.log(`broader discovery: ${merged.added.length} ordinary movies added, ${merged.removed.length} adult-classified movies removed from ordinary catalog`);
const sourceGaps=[...auditFailures];let resolvedGaps=[];async function reconcile(supplement){const result=await reconcileOrdinaryGaps(cache,sourceGaps,supplement.ordinary,movies);auditFailures=result.remaining;resolvedGaps=result.resolved;if(result.resolved.length)console.log(`source count gaps resolved by broader discovery: ${result.resolved.length}`);await atomic(`${cache}/audit.json`,{start,end:today,days:Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1,gaps:auditFailures,resolvedBySupplement:resolvedGaps})}
await reconcile(supplement);
if(process.argv.includes('--discover-only')){console.log(JSON.stringify({movies:movies.size,gaps:auditFailures}));process.exit(0)}
const trailerPath=`${cache}/trailers.jsonl`;let trailerCache=new Map();try{for(const line of (await readFile(trailerPath,'utf8')).split('\n'))if(line){const x=JSON.parse(line);trailerCache.set(x.id,x)}}catch(e){if(e.code!=='ENOENT')throw e}
let list=[...movies.values()].sort((a,b)=>(b.popularity||0)-(a.popularity||0));let queue=list.filter(x=>needsPreviewCheck(trailerCache.get(x.id)));let done=0;
async function exportCatalog(complete=false){
 const key=await readYouTubeKey(),oauthFile=await readYouTubeOAuthFile();let youtube;
 let fallbackFailures=0;const youtubeOptions={key,getToken:oauthFile?googleOAuthTokenProvider(oauthFile):undefined};
 try{youtube=await enrichYouTube(list.map(m=>trailerCache.get(m.id)?.trailer).filter(Boolean),youtubeOptions);
 if(key||oauthFile){const repaired=await repairUnavailableTrailers(list,trailerCache,youtube,{fetchCandidates:m=>request(`/movie/${m.id}/videos`,{include_video_language:[...new Set([...trailerLanguages,m.original_language,'null'].filter(Boolean))].join(',')}),enrich:ids=>enrichYouTube(ids,youtubeOptions),saveRecord:record=>appendFile(trailerPath,JSON.stringify(record)+'\n')});youtube=repaired.metadata;fallbackFailures=repaired.failures;if(repaired.replaced||repaired.failures)console.log(`fallback trailers: ${repaired.replaced} replaced, ${repaired.failures} deferred`)}}catch(error){console.error('YouTube verification deferred:',error.message);fallbackFailures=1;youtube=await enrichYouTube([],{})}
 const entries=list.map(m=>({id:String(m.id),title:movieTitle(m),originalTitle:typeof m.original_title==='string'?m.original_title.trim().slice(0,300):'',description:m.overview||'',createdAt:m.release_date||'',genreIds:(m.genre_ids||[]).map(String),popularity:m.popularity||0,rating:m.vote_average||0,cover:m.backdrop_path?`https://image.tmdb.org/t/p/w780${m.backdrop_path}`:m.poster_path?`https://image.tmdb.org/t/p/w500${m.poster_path}`:'',poster:m.poster_path?`https://image.tmdb.org/t/p/w500${m.poster_path}`:'',trailer:trailerCache.get(m.id)?.trailer||null,previewType:trailerCache.get(m.id)?.previewType||(trailerCache.get(m.id)?.trailer?'Trailer':null),duration:youtube.get(trailerCache.get(m.id)?.trailer)?.duration??null,views:youtube.get(trailerCache.get(m.id)?.trailer)?.views??null,playable:youtube.get(trailerCache.get(m.id)?.trailer)?.available??null,regionRestriction:youtube.get(trailerCache.get(m.id)?.trailer)?.regionRestriction??null,trailerChecked:previewChecked(trailerCache.get(m.id))}));
 const youtubeChecked=entries.filter(x=>typeof x.playable==='boolean').length,withTrailer=entries.filter(x=>x.trailer).length,durationCount=entries.filter(x=>typeof x.duration==='number'&&x.playable!==false).length;complete=complete&&youtubeChecked===withTrailer&&fallbackFailures===0;
 const manifest=await writeCatalogSnapshot({entries,genres:genres.genres,outputDir:'public/data',start,end:today,complete,auditGaps:auditFailures.length,pendingTeasers:list.filter(m=>needsTeaserBackfill(trailerCache.get(m.id))).length});
 console.log(JSON.stringify({movies:entries.length,checked:entries.filter(x=>x.trailerChecked).length,withTrailer:entries.filter(x=>x.trailer).length,complete}));
}
const checkpoint=async()=>{
 if(process.env.COLLECT_DEPLOY_CHECKPOINTS!=='1')return;
 const adult=await syncAdultSnapshot();if(adult)console.log(`adult snapshot staged: ${adult.count} movies, ${adult.checked} checked`);
 const {spawn}=await import('node:child_process');
 const run=(cmd,args)=>new Promise((resolve,reject)=>{const child=spawn(cmd,args,{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${cmd} failed: ${signal||code}`)))});
 await run(process.execPath,['scripts/audit-snapshot.mjs','public/data','ordinary']);if(await readJson('public/adult-data/catalog.json'))await run(process.execPath,['scripts/audit-snapshot.mjs','public/adult-data','adult']);await run('npm',['test']);await run('npm',['run','build']);
 try{await run('wrangler',['pages','deploy','dist','--project-name','trailertube','--branch','main','--commit-dirty=true'])}
 catch(error){console.error(`Checkpoint deployment failed; cached collection will continue: ${error.message}`)}
};
await exportCatalog(false);await checkpoint();
for(let offset=0;offset<queue.length;offset+=10000){
 const batch=queue.slice(offset,offset+10000);let next=0;
 async function worker(){while(next<batch.length){const m=batch[next++];if(!movies.has(m.id))continue;const data=await request(`/movie/${m.id}/videos`,{include_video_language:[...new Set([...trailerLanguages,m.original_language,'null'].filter(Boolean))].join(',')});const candidates=previewCandidates(data.results);const record={id:m.id,trailer:candidates[0]?.key||null,previewType:candidates[0]?.type||null,alternates:candidates.map(v=>v.key),candidateTypes:Object.fromEntries(candidates.map(v=>[v.key,v.type])),previewVersion:2,originalChecked:true};await appendFile(trailerPath,JSON.stringify(record)+'\n');trailerCache.set(m.id,record);done++;if(done%1000===0)console.log(`video records ${done}/${queue.length}`)}}
 await Promise.all(Array.from({length:8},worker));const supplement=await readSupplement(cache,start,today),merged=mergeOrdinarySupplement(movies,supplement);if(merged.removed.length)list=list.filter(movie=>movies.has(movie.id));for(const movie of merged.added){list.push(movie);if(!trailerCache.has(movie.id))queue.push(movie)}if(merged.added.length||merged.removed.length)console.log(`broader discovery: ${merged.added.length} ordinary movies added, ${merged.removed.length} adult-classified movies removed from ordinary catalog`);await reconcile(supplement);await exportCatalog(false);await checkpoint();
}
await exportCatalog(!seed&&auditFailures.length===0);
