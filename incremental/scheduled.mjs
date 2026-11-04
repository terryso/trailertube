import {readFile,access} from 'node:fs/promises';import {isAbsolute,resolve} from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {readCursor} from './state.mjs';

export async function runScheduled({configPath,projectRoot,read=readFile,readCurrentCursor=readCursor,now=new Date(),execute}={}) {
 if(!isAbsolute(configPath||'')||!isAbsolute(projectRoot||'')||typeof execute!=='function')throw new Error('Absolute scheduler paths and executor are required');
 try{await access(resolve(projectRoot,'.cache/incremental/promotion-pending.json'));throw new Error('A prior production promotion requires recovery')}catch(error){if(error.code!=='ENOENT')throw error}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),state=await readCurrentCursor(resolve(projectRoot,'.cache/incremental'));
 if(!state)throw new Error('A verified production cursor is required before scheduled runs');
 if(state?.cursor===today)return {skipped:true,reason:'already-published-today'};
 if(state?.cursor>today)throw new Error('Incremental cursor is in the future');
 const config=JSON.parse(await read(configPath,'utf8'));for(const name of ['tmdbEnvFile','youtubeOAuthFile'])if(!isAbsolute(config[name]||''))throw new Error(`Invalid scheduler ${name}`);
 const source=await read(config.tmdbEnvFile,'utf8');const line=source.split(/\r?\n/).find(s=>/^\s*(?:export\s+)?TMDB_API_KEY\s*=/.test(s));const key=line?.slice(line.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'');if(!key)throw new Error('TMDB_API_KEY is unavailable');
 let proxy='';if(config.proxy){const url=new URL(config.proxy);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Scheduler proxy must be an unauthenticated local HTTP proxy');proxy=url.origin}
 await access(config.youtubeOAuthFile);const env={...process.env,TMDB_API_KEY:key,YOUTUBE_OAUTH_TOKEN_FILE:config.youtubeOAuthFile};if(proxy){env.HTTPS_PROXY=proxy;env.NODE_USE_ENV_PROXY='1'}
 await execute({command:process.execPath,args:['--max-old-space-size=4096',resolve(projectRoot,'incremental/run.mjs'),'--publish'],cwd:projectRoot,env});
 return {skipped:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=resolve('.'),configPath=resolve('.cache/incremental/scheduler.json');
 const result=await runScheduled({configPath,projectRoot:root,execute:({command,args,cwd,env})=>new Promise((ok,fail)=>{const child=spawn(command,args,{cwd,env,stdio:'inherit'});child.on('error',fail);child.on('exit',(code,signal)=>code===0?ok():fail(new Error(`Incremental job failed: ${signal||code}`)))})});console.log(JSON.stringify({time:new Date().toISOString(),phase:'scheduled-result',...result}));
}
