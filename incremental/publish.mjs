import {verifyDeployment} from './verify-deployment.mjs';

function deploymentUrl(output){const matches=String(output).match(/https:\/\/[a-f0-9]{8}\.trailertube\.pages\.dev\b/g)||[];if(matches.length!==1)throw new Error('Missing or ambiguous immutable Pages deployment URL');return matches[0]}

// Publishing is deliberately ordered: preview verification precedes the main
// deployment. An exception at any step prevents cursor commit by the caller.
export async function publishStagedSite({artifact,build,runWrangler,verify=verifyDeployment,beforeProduction=async()=>{}}) {
 if(!artifact?.directory||typeof build!=='function'||typeof runWrangler!=='function')throw new Error('Invalid publication configuration');
 const site=await build(artifact.directory);
 const preview=deploymentUrl(await runWrangler(['pages','deploy',site,'--project-name','trailertube','--branch','incremental-preview','--commit-dirty=true']));
 await verify({url:preview,directory:artifact.directory});
 await beforeProduction();
 const production=deploymentUrl(await runWrangler(['pages','deploy',site,'--project-name','trailertube','--branch','main','--commit-dirty=true']));
 const checked=await verify({url:production,directory:artifact.directory});
 return {url:production,previewUrl:preview,verifiedAt:checked.verifiedAt};
}
