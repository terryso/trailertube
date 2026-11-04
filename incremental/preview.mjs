import {verifyDeployment} from './verify-deployment.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function validatePreview({artifact,site,runWrangler,verify=verifyDeployment,retries=2,wait=delay,onAttempt=()=>{}}) {
 if(!artifact?.directory||!site||typeof runWrangler!=='function'||!Number.isInteger(retries)||retries<0||retries>5)throw new Error('Invalid preview validation');
 for(let attempt=0;attempt<=retries;attempt++){
  try{onAttempt({attempt:attempt+1});const output=String(await runWrangler(['pages','deploy',site,'--project-name','trailertube','--branch','incremental-preview','--commit-dirty=true']));const matches=output.match(/https:\/\/[a-f0-9]{8}\.trailertube\.pages\.dev\b/g)||[];if(matches.length!==1)throw new Error('Missing or ambiguous immutable preview URL');const url=matches[0];const checked=await verify({url,directory:artifact.directory});return {url,verifiedAt:checked.verifiedAt,attempt:attempt+1};}
  catch(error){if(attempt===retries)throw error;await wait(Math.min(120000,30000*(attempt+1)))}
 }
}
