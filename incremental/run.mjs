// Full real-data rehearsal or explicit, verified two-phase publication.
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {runIncremental} from './runner.mjs';
import {createTmdbClient} from './tmdb-client.mjs';
import {buildStagedSite} from './build.mjs';
import {publishStagedSite} from './publish.mjs';
import {runWrangler} from './wrangler.mjs';
import {readSnapshot} from './snapshot.mjs';
import {guardPromotion} from './promotion-guard.mjs';
import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from '../scripts/youtube-data.mjs';

if(process.argv.length!==3||!['--stage-only','--publish'].includes(process.argv[2]))throw new Error('Specify exactly --stage-only or --publish');
const stageOnly=process.argv[2]==='--stage-only';
if(!process.env.TMDB_API_KEY)throw new Error('TMDB_API_KEY is required');
const key=await readYouTubeKey(),oauth=await readYouTubeOAuthFile();if(!key&&!oauth)throw new Error('YouTube credentials are required');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const [year,month,day]=today.split('-').map(Number);const start=`${year-10}-${String(month).padStart(2,'0')}-${String(Math.min(day,new Date(Date.UTC(year-10,month,0)).getUTCDate())).padStart(2,'0')}`;
const root=resolve('.cache/incremental');await mkdir(root,{recursive:true});
const execute=(command,args)=>new Promise((resolvePromise,reject)=>{const child=spawn(command,args,{stdio:'inherit'});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolvePromise():reject(new Error(`${command} failed: ${signal||code}`)))});
const audit=async artifact=>{await execute(process.execPath,['scripts/audit-snapshot.mjs',join(artifact.directory,'data'),'ordinary']);await execute(process.execPath,['scripts/audit-snapshot.mjs',join(artifact.directory,'adult-data'),'adult'])};
const getToken=oauth?googleOAuthTokenProvider(oauth):undefined;
const request=createTmdbClient({key:process.env.TMDB_API_KEY});
// TMDB/YouTube may need the user's proxy; Cloudflare upload has a separate
// direct route which avoids the observed proxy header timeouts.
const cloudflareEnv={...process.env};for(const name of ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy','NODE_USE_ENV_PROXY'])delete cloudflareEnv[name];
const promotionGuard=async({ordinary,adult,artifact})=>{const [normalNext,adultNext]=await Promise.all([readSnapshot(join(artifact.directory,'data'),'ordinary'),readSnapshot(join(artifact.directory,'adult-data'),'adult')]);const result=await guardPromotion({beforeOrdinary:ordinary.entries,beforeAdult:adult.entries,afterOrdinary:normalNext.entries,afterAdult:adultNext.entries,start,end:today,request,verifyVideos:ids=>enrichYouTube(ids,{key,getToken,cachePath:join(artifact.directory,`promotion-youtube-${Date.now()}.jsonl`)})});console.log(JSON.stringify({phase:'promotion-guard',...result}))};
const buildAndAudit=async directory=>{const site=await buildStagedSite(directory);await audit({directory:site});return site};
const result=await runIncremental({root,today,start,request,verifyVideos:ids=>enrichYouTube(ids,{key,getToken,cachePath:join(root,stageOnly?'youtube-rehearsal.jsonl':'youtube.jsonl')}),audit,stageOnly,promotionGuard,onProgress:event=>console.log(JSON.stringify({time:new Date().toISOString(),...event})),rehearse:async artifact=>({staged:true,site:await buildAndAudit(artifact.directory)}),deploy:(artifact,{beforeProduction})=>publishStagedSite({artifact,build:buildAndAudit,runWrangler:args=>runWrangler(args,{env:cloudflareEnv}),beforeProduction})});
console.log(JSON.stringify({mode:stageOnly?'stage-only':'publish',...result,productionPublished:!stageOnly,cursorCommitted:!stageOnly}));
