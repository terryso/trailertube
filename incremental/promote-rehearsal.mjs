// Promote a completed, independently preview-verified rehearsal. An intent
// journal prevents an ambiguous failed deployment from being retried blindly.
import {readFile,writeFile,rename,rm} from 'node:fs/promises';import {resolve,relative,join,basename} from 'node:path';import {spawn} from 'node:child_process';
import {withRunLock,readCursor,writeCursor} from './state.mjs';import {readSnapshot} from './snapshot.mjs';import {assertPublishedBaseline} from './baseline.mjs';import {verifyDeployment} from './verify-deployment.mjs';import {guardPromotion} from './promotion-guard.mjs';import {promoteCandidate} from './promote.mjs';import {createTmdbClient} from './tmdb-client.mjs';import {runWrangler} from './wrangler.mjs';import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from '../scripts/youtube-data.mjs';
const root=resolve('.cache/incremental'),runs=join(root,'runs'),directory=resolve(process.argv[2]||''),version=relative(runs,directory);
if(process.argv.length!==3||!/^run-[a-zA-Z0-9]+$/.test(version)||!process.env.TMDB_API_KEY)throw new Error('A staged run and TMDB_API_KEY are required');
const key=await readYouTubeKey(),oauth=await readYouTubeOAuthFile();if(!key&&!oauth)throw new Error('YouTube credentials are required');
const audit=(path,kind)=>new Promise((ok,fail)=>{const child=spawn(process.execPath,['scripts/audit-snapshot.mjs',path,kind],{stdio:'inherit'});child.on('error',fail);child.on('exit',(code,signal)=>code===0?ok():fail(new Error(`Audit failed: ${signal||code}`)))});
await withRunLock(root,async()=>{
 const existing=await readCursor(root);let source=resolve('public');
 if(existing){if(!/^run-[a-zA-Z0-9]+$/.test(existing.snapshotVersion||''))throw new Error('Cursor does not identify a safe snapshot');if(existing.snapshotVersion===version)throw new Error('Snapshot is already committed');source=join(runs,existing.snapshotVersion)}
 const marker=JSON.parse(await readFile(join(directory,'rehearsal-result.json'),'utf8')),preview=JSON.parse(await readFile(join(directory,'preview-receipt.json'),'utf8'));
 if(!Array.isArray(marker.deferredIds)||marker.deferredIds.some(id=>!/^\d+$/.test(String(id)))||new Set(marker.deferredIds.map(String)).size!==marker.deferredIds.length||preview.productionPublished!==false||preview.cursorCommitted!==false)throw new Error('Invalid rehearsal evidence');
 const [ordinary,adult,nextOrdinary,nextAdult]=await Promise.all([readSnapshot(join(source,'data'),'ordinary'),readSnapshot(join(source,'adult-data'),'adult'),readSnapshot(join(directory,'data'),'ordinary'),readSnapshot(join(directory,'adult-data'),'adult')]);
 if(marker.ordinaryBaseline!==ordinary.manifest.generatedAt||marker.adultBaseline!==adult.manifest.generatedAt||marker.cursor!==nextOrdinary.manifest.end||marker.cursor!==nextAdult.manifest.end)throw new Error('Rehearsal baseline mismatch');
 if(!Array.isArray(marker.pendingGaps??[])||JSON.stringify(marker.pendingGaps??[])!==JSON.stringify(nextOrdinary.manifest.incrementalPendingGaps??[])||JSON.stringify(marker.pendingGaps??[])!==JSON.stringify(nextAdult.manifest.incrementalPendingGaps??[]))throw new Error('Rehearsal pending gaps mismatch');
 if(existing&&marker.cursor<existing.cursor)throw new Error('Rehearsal cursor would move backwards');
 const request=createTmdbClient({key:process.env.TMDB_API_KEY}),getToken=oauth?googleOAuthTokenProvider(oauth):undefined,pending=join(root,'promotion-pending.json');
 const baseline=()=>assertPublishedBaseline({ordinary,adult});const alias=()=>assertPublishedBaseline({ordinary:nextOrdinary,adult:nextAdult});
 const directEnv={...process.env};for(const name of ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy','NODE_USE_ENV_PROXY'])delete directEnv[name];
 const deployment=await promoteCandidate({
  audit:async()=>{for(const [part,kind] of [['data','ordinary'],['adult-data','adult']]){await audit(join(directory,part),kind);await audit(join(directory,'site',part),kind);const staged=await readFile(join(directory,part,'catalog.json'),'utf8'),built=await readFile(join(directory,'site',part,'catalog.json'),'utf8');if(staged!==built)throw new Error('Built catalog differs from rehearsal')}},
  baseline,verifyPreview:()=>verifyDeployment({url:preview.url,directory}),
  guard:async()=>{const result=await guardPromotion({beforeOrdinary:ordinary.entries,beforeAdult:adult.entries,afterOrdinary:nextOrdinary.entries,afterAdult:nextAdult.entries,start:nextOrdinary.manifest.start,end:nextOrdinary.manifest.end,request,verifyVideos:ids=>enrichYouTube(ids,{key,getToken,cachePath:join(directory,`promotion-youtube-${Date.now()}.jsonl`)})});console.log(JSON.stringify({phase:'promotion-guard',...result}))},
  recordIntent:()=>writeFile(pending,JSON.stringify({version,cursor:marker.cursor,previewUrl:preview.url,startedAt:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600}),
  deployMain:async()=>{const output=await runWrangler(['pages','deploy',join(directory,'site'),'--project-name','trailertube','--branch','main','--commit-dirty=true'],{env:directEnv});const urls=output.match(/https:\/\/[a-f0-9]{8}\.trailertube\.pages\.dev\b/g)||[];if(urls.length!==1)throw new Error('Missing or ambiguous production receipt');const data={version,cursor:marker.cursor,previewUrl:preview.url,productionUrl:urls[0],startedAt:new Date().toISOString()};const temp=`${pending}.tmp`;await writeFile(temp,JSON.stringify(data)+'\n',{mode:0o600});await rename(temp,pending);return {url:urls[0]}},
  verifyMain:async receipt=>Object.assign(receipt,await verifyDeployment({url:receipt.url,directory})),
  verifyAlias:async()=>{for(let attempt=0;attempt<12;attempt++){try{return await alias()}catch(error){if(attempt===11)throw error;await new Promise(r=>setTimeout(r,5000))}}},
  commit:async receipt=>{await writeCursor(root,{cursor:marker.cursor,deploymentUrl:receipt.url,verifiedAt:receipt.verifiedAt,snapshotVersion:basename(directory),deferredIds:marker.deferredIds.map(String),pendingGaps:marker.pendingGaps??[]});await rm(pending,{force:true})},
 });
 console.log(JSON.stringify({phase:'production-verified',url:deployment.url,cursor:marker.cursor,deferred:marker.deferredIds.length}));
});
