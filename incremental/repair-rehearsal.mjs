// Repair a completed isolated rehearsal made by the earlier 404 policy.
// The repaired run is staged only; this command never publishes or commits.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';import {spawn} from 'node:child_process';
import {withRunLock} from './state.mjs';import {readSnapshot} from './snapshot.mjs';import {compareCatalogs} from './compare.mjs';import {fetchMovieUpdates} from './updates.mjs';import {stageCatalogs} from './stage.mjs';import {buildStagedSite} from './build.mjs';import {assertPublishedBaseline} from './baseline.mjs';import {createTmdbClient} from './tmdb-client.mjs';import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from '../scripts/youtube-data.mjs';
const root=resolve('.cache/incremental'),runs=join(root,'runs'),source=resolve(process.argv[2]||''),rel=relative(runs,source);
if(process.argv.length!==3||!/^run-[a-zA-Z0-9]+$/.test(rel)||!process.env.TMDB_API_KEY)throw new Error('A staged run and TMDB_API_KEY are required');
const key=await readYouTubeKey(),oauth=await readYouTubeOAuthFile();if(!key&&!oauth)throw new Error('YouTube credentials are required');
const audit=(dir,kind)=>new Promise((ok,fail)=>{const child=spawn(process.execPath,['scripts/audit-snapshot.mjs',dir,kind],{stdio:'inherit'});child.on('error',fail);child.on('exit',(code,signal)=>code===0?ok():fail(new Error(`Audit failed: ${signal||code}`)))});
await withRunLock(root,async()=>{
 const meta=JSON.parse(await readFile(join(source,'rehearsal-result.json'),'utf8'));if(!Array.isArray(meta.deferredIds)||meta.deferredIds.some(id=>!/^\d+$/.test(String(id))))throw new Error('Missing deferred IDs');
 const [oldNormal,oldAdult,currentNormal,currentAdult]=await Promise.all([readSnapshot('public/data','ordinary'),readSnapshot('public/adult-data','adult'),readSnapshot(join(source,'data'),'ordinary'),readSnapshot(join(source,'adult-data'),'adult')]);
 if(meta.ordinaryBaseline!==oldNormal.manifest.generatedAt||meta.adultBaseline!==oldAdult.manifest.generatedAt||meta.cursor!==currentNormal.manifest.end||meta.cursor!==currentAdult.manifest.end)throw new Error('Rehearsal baseline mismatch');
 await assertPublishedBaseline({ordinary:oldNormal,adult:oldAdult});
 const start=currentNormal.manifest.start,end=currentNormal.manifest.end;
 const comparison=compareCatalogs({beforeOrdinary:oldNormal.entries,beforeAdult:oldAdult.entries,afterOrdinary:currentNormal.entries,afterAdult:currentAdult.entries,start,end});
 console.log(JSON.stringify({phase:'repair-missing',total:comparison.missingInRange.length}));
 const request=createTmdbClient({key:process.env.TMDB_API_KEY}),getToken=oauth?googleOAuthTokenProvider(oauth):undefined;
 const updates=await fetchMovieUpdates({ids:comparison.missingInRange,ordinary:oldNormal.entries,adult:oldAdult.entries,request,start,end,verifyVideos:ids=>enrichYouTube(ids,{key,getToken,cachePath:join(root,'youtube-repair.jsonl')})});
 // Restore originals before applying newly checked details; this preserves 404
 // and missing-date records while allowing explicitly moved dates to expire.
 const ordinary={...currentNormal,entries:new Map(currentNormal.entries)},adult={...currentAdult,entries:new Map(currentAdult.entries)};
 for(const id of comparison.missingInRange){const item=oldNormal.entries.get(id)||oldAdult.entries.get(id);(item.adult===true?adult.entries:ordinary.entries).set(id,item)}
 await mkdir(runs,{recursive:true});const directory=await mkdtemp(join(runs,'run-'));const artifact=await stageCatalogs({ordinary,adult,updates,start,end,directory});
 const allowed=new Set(updates.filter(x=>!x.deferred&&typeof x.createdAt==='string'&&(x.createdAt<start||x.createdAt>end)).map(x=>String(x.id)));
 const [nextNormal,nextAdult]=await Promise.all([readSnapshot(join(directory,'data'),'ordinary'),readSnapshot(join(directory,'adult-data'),'adult')]);
 const checked=compareCatalogs({beforeOrdinary:oldNormal.entries,beforeAdult:oldAdult.entries,afterOrdinary:nextNormal.entries,afterAdult:nextAdult.entries,start,end});
 if(checked.missingInRange.some(id=>!allowed.has(id)))throw new Error('Repair still omits an unaccounted in-range movie');
 const pending=new Set(meta.deferredIds.map(String));for(const update of updates){if(update.deferred)pending.add(String(update.id));else pending.delete(String(update.id))}
 const receipt={cursor:meta.cursor,deferredIds:[...pending],ordinaryBaseline:meta.ordinaryBaseline,adultBaseline:meta.adultBaseline,repairedFrom:rel,unaccountedMissing:0,accountedMoved:checked.missingInRange.length};
 await audit(join(directory,'data'),'ordinary');await audit(join(directory,'adult-data'),'adult');const site=await buildStagedSite(directory);await audit(join(site,'data'),'ordinary');await audit(join(site,'adult-data'),'adult');
 await writeFile(join(directory,'rehearsal-result.json'),JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({phase:'repair-complete',directory,checked:updates.length,deferred:pending.size,accountedMoved:checked.missingInRange.length,ordinary:artifact.ordinary.count,adult:artifact.adult.count,productionPublished:false,cursorCommitted:false}));
});
