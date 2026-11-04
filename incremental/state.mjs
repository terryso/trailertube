import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// One run owns the lock until its finally block finishes. A stale lock is never
// silently stolen: an operator must verify the owner before removing it.
export async function withRunLock(root,run) {
 await mkdir(root,{recursive:true});const lock=join(root,'run.lock');
 try{await mkdir(lock)}catch(error){if(error.code==='EEXIST')throw new Error('Another incremental run owns the lock');throw error}
 try{await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),nonce:randomUUID()}),{flag:'wx',mode:0o600});return await run()}
 finally{await rm(lock,{recursive:true,force:true})}
}

export async function readCursor(root) {
 let content;try{content=JSON.parse(await readFile(join(root,'cursor.json'),'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}
 if(!content||!validDate(content.cursor)||!/^https:\/\/[a-f0-9]{8}\.trailertube\.pages\.dev$/.test(content.deploymentUrl||'')||typeof content.verifiedAt!=='string')throw new Error('Invalid incremental cursor state');
 return content;
}
function validDate(date){if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date))return false;const time=Date.parse(`${date}T00:00:00Z`);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date}

// Write a same-directory temp file and atomically rename it after verification.
export async function writeCursor(root, state) {
 if(!validDate(state.cursor)||!/^https:\/\/[a-f0-9]{8}\.trailertube\.pages\.dev$/.test(state.deploymentUrl||'')||!Number.isFinite(Date.parse(state.verifiedAt)))throw new Error('Invalid incremental cursor state');
 await mkdir(root,{recursive:true});const temp=join(root,`cursor-${randomUUID()}.tmp`);
 try{await writeFile(temp,JSON.stringify(state)+'\n',{flag:'wx',mode:0o600});await rename(temp,join(root,'cursor.json'))}finally{await rm(temp,{force:true})}
}
