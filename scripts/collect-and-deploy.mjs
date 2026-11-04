import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {syncAdultSnapshot} from './sync-adult-snapshot.mjs';
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${command} failed: ${signal||code}`)))})}
for(let attempt=0;;attempt++){
 try{await run(process.execPath,['scripts/collect.mjs']);break}
 catch(error){if(attempt>=4)throw error;console.error(`Collection interrupted, resuming after a short wait (${attempt+1}/4).`);await new Promise(resolve=>setTimeout(resolve,30000))}
}
await syncAdultSnapshot();
await run(process.execPath,['scripts/audit-snapshot.mjs','public/data','ordinary']);
let adultPresent=true;try{await access('public/adult-data/catalog.json')}catch(e){if(e.code==='ENOENT')adultPresent=false;else throw e}
if(adultPresent)await run(process.execPath,['scripts/audit-snapshot.mjs','public/adult-data','adult']);
await run('npm',['run','test']);
await run('npm',['run','build']);
await run('wrangler',['pages','deploy','dist','--project-name','trailertube','--branch','main','--commit-dirty=true']);
console.log('Collection, validation, build and deployment finished.');
