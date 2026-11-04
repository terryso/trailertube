// A bounded, explicitly selected, isolated real-data rehearsal. No production
// snapshots, cursor, deployment, or shared YouTube cache are written.
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {createTmdbClient} from './tmdb-client.mjs';
import {readSnapshot} from './snapshot.mjs';
import {fetchMovieUpdates} from './updates.mjs';
import {stageCatalogs} from './stage.mjs';
import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from '../scripts/youtube-data.mjs';
import {buildStagedSite} from './build.mjs';

const ids=process.argv.slice(2);if(!ids.length||ids.length>10||ids.some(x=>!/^\d+$/.test(x))||new Set(ids).size!==ids.length)throw new Error('Pass one to ten distinct TMDB IDs');
if(!process.env.TMDB_API_KEY)throw new Error('TMDB_API_KEY is required');
const key=await readYouTubeKey(),oauth=await readYouTubeOAuthFile();if(!key&&!oauth)throw new Error('YouTube credentials are required');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const [year,month,day]=today.split('-').map(Number),start=`${year-10}-${String(month).padStart(2,'0')}-${String(Math.min(day,new Date(Date.UTC(year-10,month,0)).getUTCDate())).padStart(2,'0')}`;
const root='.cache/incremental-dry-run';await mkdir(root,{recursive:true});const temp=await mkdtemp(join(root,'run-'));
const run=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit'});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${command} failed: ${signal||code}`)))});
try {
 const ordinary=await readSnapshot('public/data','ordinary'),adult=await readSnapshot('public/adult-data','adult');
 const updates=await fetchMovieUpdates({ids,ordinary:ordinary.entries,adult:adult.entries,request:createTmdbClient({key:process.env.TMDB_API_KEY}),start,end:today,verifyVideos:videos=>enrichYouTube(videos,{key,getToken:oauth?googleOAuthTokenProvider(oauth):undefined,cachePath:join(temp,'youtube.jsonl')})});
 const artifact=await stageCatalogs({ordinary,adult,updates,start,end:today,directory:temp});
 await run(process.execPath,['scripts/audit-snapshot.mjs',join(temp,'data'),'ordinary']);await run(process.execPath,['scripts/audit-snapshot.mjs',join(temp,'adult-data'),'adult']);
 const output=await buildStagedSite(temp);await run(process.execPath,['scripts/audit-snapshot.mjs',join(output,'data'),'ordinary']);await run(process.execPath,['scripts/audit-snapshot.mjs',join(output,'adult-data'),'adult']);
 console.log(JSON.stringify({mode:'dry-run',changed:updates.length,ordinaryCount:artifact.ordinary.count,adultCount:artifact.adult.count,builtAndAudited:true,stagedOnly:true}));
}finally{await rm(temp,{recursive:true,force:true})}
