import {spawn} from 'node:child_process';
const job=process.argv[2];if(!['discover-adult-metadata.mjs','collect-adult.mjs'].includes(job))throw new Error('Unknown adult catalog job');
function run(){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/'+job],{env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${job} stopped: ${signal||code}`)))})}
for(let attempt=0;;attempt++){try{await run();break}catch(error){if(attempt>=4)throw error;console.error(`${job} interrupted; resuming from saved progress (${attempt+1}/4).`);await new Promise(resolve=>setTimeout(resolve,30000))}}
