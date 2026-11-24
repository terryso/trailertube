import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
// These files are incorporated into the static build. Do not publish another
// task's uncommitted work while performing unattended data maintenance.
const inputs=['index.html','src','public','seo','edge','scripts','package.json','package-lock.json','vite.config.mjs','incremental'];
export async function assertCleanReleaseInputs({projectRoot,run=exec,read=readFile,list=readdir,inspect=lstat,fetcher=fetch}={}){
 if(!projectRoot)throw Error('Project root is required');
 const {stdout}=await run('git',['status','--porcelain=v1','--untracked-files=normal','--',...inputs],{cwd:projectRoot,maxBuffer:1024*1024});
 const dirty=stdout.trimEnd().split('\n').filter(Boolean);if(!dirty.length)return;
 // Permit only the known theme bootstrap and gallery assets when the exact
 // bytes are already served in production; all other dirty inputs fail closed.
 if(dirty.some(x=>x!==' M index.html'&&x!=='?? public/producthunt/'))throw Error('Uncommitted website build inputs prevent automatic publication');
 if(dirty.includes(' M index.html')){
  const {stdout:committed}=await run('git',['show','HEAD:index.html'],{cwd:projectRoot,maxBuffer:1024*1024});const local=await read(join(projectRoot,'index.html'),'utf8');const snippet=local.match(/<style id="initial-page-theme">[\s\S]*?<\/script>/)?.[0];
  if(!snippet||local.replace(snippet,'')!==committed)throw Error('Uncommitted website build inputs prevent automatic publication');
  const response=await fetcher('https://trailer.terryso.dev/',{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!response.ok||!(await response.text()).includes(snippet))throw Error('Uncommitted website build inputs prevent automatic publication');
 }
 if(dirty.includes('?? public/producthunt/')){
  const dir=join(projectRoot,'public/producthunt'),files=await list(dir);if(!files.length||files.length>20)throw Error('Uncommitted website build inputs prevent automatic publication');
  const hash=x=>createHash('sha256').update(x).digest('hex');for(const file of files){if(!/^[\w.-]+$/.test(file)||(await inspect(join(dir,file))).isFile()!==true||(await inspect(join(dir,file))).isSymbolicLink())throw Error('Uncommitted website build inputs prevent automatic publication');const response=await fetcher('https://trailer.terryso.dev/producthunt/'+encodeURIComponent(file),{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!response.ok||hash(await read(join(dir,file)))!==hash(Buffer.from(await response.arrayBuffer())))throw Error('Uncommitted website build inputs prevent automatic publication')}
 }
}
