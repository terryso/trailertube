import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {readSnapshot} from './snapshot.mjs';
import {withRunLock,readCursor,writeCursor} from './state.mjs';
import {assertPublishedBaseline} from './baseline.mjs';
import {syncIncremental} from './pipeline.mjs';
import {verifyDeployment} from './verify-deployment.mjs';
import {openDetailCheckpoint} from './checkpoint.mjs';

// State points at an immutable staged snapshot. If a publish succeeds but the
// process dies before cursor commit, the baseline guard fails closed on retry.
export async function runIncremental({root,publicRoot='public',today,start,request,verifyVideos,audit,deploy,rehearse,promotionGuard,baseline=assertPublishedBaseline,verify=verifyDeployment,load=readSnapshot,sync=syncIncremental,stageOnly=false,onProgress=()=>{}}) {
 if(!root||!today||!start)throw new Error('Incremental paths and dates are required');
 if(stageOnly&&typeof rehearse!=='function')throw new Error('Stage-only rehearsal adapter is required');
 if(!stageOnly&&typeof promotionGuard!=='function')throw new Error('Production promotion guard is required');
 root=resolve(root);publicRoot=resolve(publicRoot);
 return withRunLock(root,async()=>{
  const pending=join(root,'promotion-pending.json');try{await access(pending);throw new Error('A prior production promotion requires recovery')}catch(error){if(error.code!=='ENOENT')throw error}
  const state=await readCursor(root);let source=publicRoot;
  if(state){if(!/^run-[a-zA-Z0-9]+$/.test(state.snapshotVersion||''))throw new Error('Cursor does not identify a safe snapshot');source=join(root,'runs',state.snapshotVersion)}
  const ordinary=await load(join(source,'data'),'ordinary'),adult=await load(join(source,'adult-data'),'adult');
  const cursor=state?.cursor||[ordinary.manifest.end,adult.manifest.end].sort()[0];
  if(!cursor)throw new Error('Baseline cursor is unavailable');
  await baseline({ordinary,adult});
  const runs=join(root,'runs');await mkdir(runs,{recursive:true});const directory=await mkdtemp(join(runs,'run-'));
  if(state?.deferredIds&&(!Array.isArray(state.deferredIds)||state.deferredIds.some(id=>!/^\d+$/.test(id))))throw new Error('Invalid deferred IDs');
  const checkpoint=await openDetailCheckpoint({root,context:{version:1,source:state?.snapshotVersion||'public',ordinary:ordinary.manifest.generatedAt,adult:adult.manifest.generatedAt,cursor,today,start}});onProgress({phase:'checkpoint-ready',cached:checkpoint.size});
  return sync({cursor,today,start,ordinary,adult,directory,request,verifyVideos,audit,onProgress,checkpoint,deferredIds:state?.deferredIds||[],
   prepare:async({cursor:nextCursor,deferredIds})=>{await writeFile(join(directory,'prepared-result.json'),JSON.stringify({cursor:nextCursor,deferredIds,ordinaryBaseline:ordinary.manifest.generatedAt,adultBaseline:adult.manifest.generatedAt,preparedAt:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600})},
   deploy:async artifact=>{await baseline({ordinary,adult});if(stageOnly)return rehearse(artifact);let intentWritten=false;const check=async()=>{await baseline({ordinary,adult});await promotionGuard({ordinary,adult,artifact});await writeFile(pending,JSON.stringify({version:basename(directory),cursor:today,startedAt:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600});intentWritten=true};await promotionGuard({ordinary,adult,artifact});const receipt=await deploy(artifact,{beforeProduction:check});if(!intentWritten)throw new Error('Production intent was not recorded');return receipt},
   verify:async(deployment,artifact)=>{if(stageOnly)return;await verify({url:deployment.url,directory:artifact.directory});const normal={manifest:JSON.parse(await readFile(join(artifact.directory,'data/catalog.json'),'utf8'))},adultNext={manifest:JSON.parse(await readFile(join(artifact.directory,'adult-data/catalog.json'),'utf8'))};for(let attempt=0;attempt<12;attempt++){try{return await baseline({ordinary:normal,adult:adultNext})}catch(error){if(attempt===11)throw error;await new Promise(r=>setTimeout(r,5000))}}},
   commit:async({cursor:nextCursor,deployment,deferredIds=[]})=>{if(stageOnly){await writeFile(join(directory,'rehearsal-result.json'),JSON.stringify({cursor:nextCursor,deferredIds,ordinaryBaseline:ordinary.manifest.generatedAt,adultBaseline:adult.manifest.generatedAt})+'\n',{flag:'wx',mode:0o600});return}await writeCursor(root,{cursor:nextCursor,deploymentUrl:deployment.url,verifiedAt:deployment.verifiedAt,snapshotVersion:basename(directory),deferredIds});await rm(pending,{force:true})},
  });
 });
}
