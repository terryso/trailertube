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
  if(subdir==='data'&&JSON.stringify(remote.incrementalPrerenderIds??[])!==JSON.stringify(local.incrementalPrerenderIds??[]))throw new Error('Deployment data mismatch: incrementalPrerenderIds');
 }
 // New builds include a separate root-only prerender. Verify its actual HTML,
 // not just the catalogs, before promoting the immutable deployment.
 let localHome;try{localHome=await readFile(join(directory,'site/home-prerender.html'),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 if(localHome){const extract=html=>html.match(/<div id="home-prerender"[\s\S]*?<div id="root"><\/div>/)?.[0];const local=extract(localHome);if(!local)throw Error('Invalid local homepage prerender');const response=await fetcher(new URL('/',parsed),{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok)throw Error('Deployment homepage unavailable');const remote=extract(await response.text());if(remote!==local)throw Error('Deployment homepage mismatch');}
 // Sample the oldest and newest generated incremental detail pages to catch
 // missing static files or an SPA fallback before production promotion.
 if(localHome){const manifest=JSON.parse(await readFile(join(directory,'data/catalog.json'),'utf8'));const ids=manifest.incrementalPrerenderIds??[];if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))))throw Error('Invalid incremental prerender candidates');const samples=[];for(const sequence of [ids,[...ids].reverse()]){for(const id of sequence){try{const html=await readFile(join(directory,'site/watch',id+'.html'),'utf8');samples.push({id,html});break}catch(e){if(e.code!=='ENOENT')throw e}}}for(const {id,html} of [...new Map(samples.map(x=>[x.id,x])).values()]){const extract=value=>value.match(/<div id="root"><main>[\s\S]*?<\/main><\/div>/)?.[0];const local=extract(html);if(!local)throw Error('Invalid local incremental detail');const response=await fetcher(new URL('/watch/'+id,parsed),{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok||extract(await response.text())!==local)throw Error('Deployment incremental detail mismatch');}}
 return {url:parsed.origin,verifiedAt:new Date().toISOString()};
}
