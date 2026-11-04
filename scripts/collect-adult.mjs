import {movieTitle} from '../src/movie-title.js';
// Separate, opt-in catalog. This job stages snapshots and never deploys them itself.
import {readFile,writeFile,appendFile,rename,mkdir} from 'node:fs/promises';
import {readSupplement} from './adult-supplement.mjs';
import {writeCatalogSnapshot} from './write-catalog.mjs';
import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from './youtube-data.mjs';
import {previewCandidates,repairUnavailableTrailers,previewChecked,needsPreviewCheck,needsTeaserBackfill} from './trailer-selection.mjs';
const key=process.env.TMDB_API_KEY,start=process.env.COLLECT_START,end=process.env.COLLECT_END;if(!key||!start||!end)throw new Error('TMDB_API_KEY and the date range are required');
const expectedDays=Math.floor((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
const root='.cache/adult-snapshots',trailerPath='.cache/adult-trailers.jsonl',youtubePath='.cache/adult-youtube.jsonl';await mkdir(root,{recursive:true});
const read=async path=>{try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
let lastStart=0;
async function request(path,params={}){for(let attempt=0;attempt<7;attempt++){const now=Date.now(),at=Math.max(now,lastStart);lastStart=at+150;if(at>now)await new Promise(r=>setTimeout(r,at-now));const u=new URL('https://api.themoviedb.org/3'+path);u.search=new URLSearchParams({...params,api_key:key});try{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(r.status===404)return {results:[]};if(r.status===429||r.status>=500){await new Promise(resolve=>setTimeout(resolve,Math.min(30000,1000*2**attempt)));continue}if(!r.ok)throw new Error(`TMDB HTTP ${r.status}`);return await r.json()}catch(e){if(attempt===6)throw new Error(`TMDB request failed: ${e.name}`);await new Promise(resolve=>setTimeout(resolve,1000*2**attempt))}}throw new Error('TMDB retries exceeded')}
const languages='en,ko,fr,es,de,ja,zh,hi,pt,it,ru,ar,tr,pl,nl,sv,id,th,uk,vi,da,fi,no,he,el,ro,hu,cs,fa,ta,te,ml,bn,mr,ur,ms,ca,et,lv,lt'.split(',');
const params=m=>({include_video_language:[...new Set([...languages,m.original_language,'null'].filter(Boolean))].join(',')});
const genres=await read('public/data/genres.json');if(!genres)throw new Error('Movie genres unavailable');
const records=new Map();try{for(const line of (await readFile(trailerPath,'utf8')).split('\n'))if(line){const r=JSON.parse(line);records.set(r.id,r)}}catch(e){if(e.code!=='ENOENT')throw e}
const youtubeKey=await readYouTubeKey(),oauth=await readYouTubeOAuthFile(),youtubeOptions={key:youtubeKey,getToken:oauth?googleOAuthTokenProvider(oauth):undefined,cachePath:youtubePath};
let lastSignature='',cycles=0;
async function snapshot(movies,supp,discoveryComplete){
 let youtube=await enrichYouTube(movies.map(m=>records.get(m.id)?.trailer).filter(Boolean),youtubeOptions),failures=0;
 if(youtubeKey||oauth){const repaired=await repairUnavailableTrailers(movies,records,youtube,{fetchCandidates:m=>request(`/movie/${m.id}/videos`,params(m)),enrich:ids=>enrichYouTube(ids,youtubeOptions),saveRecord:r=>appendFile(trailerPath,JSON.stringify(r)+'\n')});youtube=repaired.metadata;failures=repaired.failures}
 const entries=movies.map(m=>{const r=records.get(m.id),v=youtube.get(r?.trailer);return {id:String(m.id),adult:true,title:movieTitle(m),description:m.overview||'',createdAt:m.release_date||'',genreIds:(m.genre_ids||[]).map(String),popularity:m.popularity||0,rating:m.vote_average||0,cover:m.backdrop_path?`https://image.tmdb.org/t/p/w780${m.backdrop_path}`:m.poster_path?`https://image.tmdb.org/t/p/w500${m.poster_path}`:'',poster:m.poster_path?`https://image.tmdb.org/t/p/w500${m.poster_path}`:'',trailer:r?.trailer||null,previewType:r?.previewType||(r?.trailer?'Trailer':null),duration:v?.duration??null,views:v?.views??null,playable:v?.available??null,regionRestriction:v?.regionRestriction??null,trailerChecked:previewChecked(r)}});
 const withTrailer=entries.filter(x=>x.trailer).length,youtubeChecked=entries.filter(x=>typeof x.playable==='boolean').length,pendingTeasers=movies.filter(m=>needsTeaserBackfill(records.get(m.id))).length,complete=discoveryComplete&&supp.gaps===0&&supp.unknown===0&&movies.every(m=>!needsPreviewCheck(records.get(m.id)))&&withTrailer===youtubeChecked&&failures===0;
 const version=`v${Date.now()}-${process.pid}-${cycles++}`,dir=`${root}/${version}`;const manifest=await writeCatalogSnapshot({entries,genres,outputDir:dir,start,end,complete,auditGaps:supp.gaps+supp.unknown,pendingTeasers});
 await writeFile(`${root}/latest.json.tmp`,JSON.stringify({version,generatedAt:manifest.generatedAt,count:manifest.count,checked:manifest.checked,playable:manifest.overview.playableCount}));await rename(`${root}/latest.json.tmp`,`${root}/latest.json`);
 console.log(JSON.stringify({snapshot:version,days:supp.days,movies:manifest.count,checked:manifest.checked,trailers:manifest.withTrailer,playable:manifest.overview.playableCount,complete}));
}
while(true){
 const supp=await readSupplement('.cache',start,end),movies=supp.adult.sort((a,b)=>(b.popularity||0)-(a.popularity||0)),audit=await read('.cache/adult-audit.json'),discoveryComplete=!!audit&&audit.start===start&&audit.end===end&&audit.days===expectedDays;
 const pending=movies.filter(m=>needsPreviewCheck(records.get(m.id))).slice(0,300),signature=`${supp.days}:${movies.length}:${records.size}`;
 if(pending.length){let next=0;async function worker(){while(next<pending.length){const m=pending[next++],d=await request(`/movie/${m.id}/videos`,params(m)),candidates=previewCandidates(d.results),r={id:m.id,trailer:candidates[0]?.key||null,previewType:candidates[0]?.type||null,alternates:candidates.map(v=>v.key),candidateTypes:Object.fromEntries(candidates.map(v=>[v.key,v.type])),previewVersion:2,originalChecked:true};await appendFile(trailerPath,JSON.stringify(r)+'\n');records.set(r.id,r)}}await Promise.all(Array.from({length:6},worker));await snapshot(movies,supp,discoveryComplete);lastSignature=`${supp.days}:${movies.length}:${records.size}`;continue}
 if(signature!==lastSignature&&movies.length){await snapshot(movies,supp,discoveryComplete);lastSignature=signature}
 if(discoveryComplete){console.log('Adult catalog processing complete for the discovered scope.');break}
 await new Promise(resolve=>setTimeout(resolve,30000));
}
