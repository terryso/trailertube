import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

// A successful upload alone does not prove the deployed version serves both
// staged catalogs. Compare immutable deployment manifests, never an alias.
export async function verifyDeployment({url,directory,fetcher=fetch}) {
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!/^[a-f0-9]{8}\.trailertube\.pages\.dev$/.test(parsed.hostname)||parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('Invalid immutable deployment URL');
 const fields=['generatedAt','count','checked','withTrailer','auditGaps','complete'];
 for(const subdir of ['data','adult-data']){
  const local=JSON.parse(await readFile(join(directory,subdir,'catalog.json'),'utf8'));
  const remoteUrl=new URL(`/${subdir}/catalog.json`,parsed);remoteUrl.searchParams.set('verify',local.generatedAt);
  const response=await fetcher(remoteUrl,{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok)throw new Error(`Deployment ${subdir} unavailable: HTTP ${response.status}`);
  const remote=await response.json();for(const field of fields)if(remote[field]!==local[field])throw new Error(`Deployment ${subdir} mismatch: ${field}`);
 }
 return {url:parsed.origin,verifiedAt:new Date().toISOString()};
}
