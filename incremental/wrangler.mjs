import {spawn} from 'node:child_process';

// Capture a bounded CLI receipt without printing tokens or provider responses.
// The caller validates the immutable deployment URL and checks its manifests.
export function runWrangler(args,{command='wrangler',timeoutMs=1_800_000,maxBytes=1_048_576,env=process.env}={}) {
 if(!Array.isArray(args)||!args.every(x=>typeof x==='string')||!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isInteger(maxBytes)||maxBytes<=0)throw new Error('Invalid Wrangler invocation');
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],env});let chunks=[],size=0,failed=null,settled=false,killTimer;
  const fail=error=>{if(failed)return;failed=error;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),5000)};
  const collect=chunk=>{size+=chunk.length;if(size>maxBytes){fail(new Error('Wrangler output exceeded limit'));return}chunks.push(chunk)};
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  const timer=setTimeout(()=>fail(new Error('Wrangler deployment timed out')),timeoutMs);
  child.on('error',error=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);reject(new Error('Wrangler could not be started',{cause:error}))});
  child.on('close',(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);if(failed)return reject(failed);const output=Buffer.concat(chunks).toString('utf8');if(code!==0){const status=output.match(/\b(?:HTTP|status(?: code)?)\s*[:=]?\s*(4\d\d|5\d\d)\b/i)?.[1],cloudflare=output.match(/\[code:\s*(\d{4,8})\]/i)?.[1];return reject(new Error(`Wrangler deployment failed: ${signal||code}${status?`; HTTP ${status}`:''}${cloudflare?`; Cloudflare code ${cloudflare}`:''}`))}resolve(output)});
 });
}
