import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

// A successful upload alone does not prove the deployed version serves both
// staged catalogs. Compare immutable deployment manifests, never an alias.
export async function verifyDeployment({url,directory,fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),retries=2}) {
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!/^[a-f0-9]{8}\.trailertube\.pages\.dev$/.test(parsed.hostname)||parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('Invalid immutable deployment URL');
 if(!Number.isInteger(retries)||retries<0||retries>5)throw Error('Invalid deployment verification retry count');
 const fields=['generatedAt','count','checked','withTrailer','auditGaps','complete','movieDetailsVersion'];
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
 if(localHome){const extract=html=>html.match(/<div id="home-prerender"[\s\S]*?<div id="root"><\/div>/)?.[0];const local=extract(localHome);if(!local)throw Error('Invalid local homepage prerender');let remote;for(let attempt=0;attempt<=retries;attempt++){try{const response=await fetcher(new URL('/',parsed),{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok){const e=Error('Deployment homepage unavailable');if(response.status!==429&&response.status<500)e.permanent=true;throw e}remote=extract(await response.text());break}catch(e){if(e.permanent||attempt===retries)throw e;await wait(1000*2**attempt)}}if(remote!==local)throw Error('Deployment homepage mismatch');}
 // Sample the oldest and newest generated incremental detail pages to catch
 // missing static files or an SPA fallback before production promotion.
 if(localHome){const manifest=JSON.parse(await readFile(join(directory,'data/catalog.json'),'utf8'));const ids=manifest.incrementalPrerenderIds??[];if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))))throw Error('Invalid incremental prerender candidates');const samples=[];for(const sequence of [ids,[...ids].reverse()]){for(const id of sequence){try{const html=await readFile(join(directory,'site/watch',id+'.html'),'utf8');samples.push({id,html});break}catch(e){if(e.code!=='ENOENT')throw e}}}for(const {id,html} of [...new Map(samples.map(x=>[x.id,x])).values()]){const extract=value=>value.match(/<div id="root"><main>[\s\S]*?<\/main><\/div>/)?.[0];const local=extract(html);if(!local)throw Error('Invalid local incremental detail');const response=await fetcher(new URL('/watch/'+id,parsed),{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok||extract(await response.text())!==local)throw Error('Deployment incremental detail mismatch');}}
 // Validate the generated people index against the staged catalog and sample
 // actual person shards before a new snapshot is made public.
 let peopleIndex;try{peopleIndex=JSON.parse(await readFile(join(directory,'site/data/people-manifest.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 if(peopleIndex){const catalog=JSON.parse(await readFile(join(directory,'data/catalog.json'),'utf8'));if(peopleIndex.generatedAt!==catalog.generatedAt||!Array.isArray(peopleIndex.shards)||peopleIndex.shards.length!==64||!Array.isArray(peopleIndex.sampleIds)||peopleIndex.sampleIds.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('Invalid staged people index');const response=await fetcher(new URL('/data/people-manifest.json',parsed),{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok||JSON.stringify(await response.json())!==JSON.stringify(peopleIndex))throw Error('Deployment people manifest mismatch');for(const i of new Set(peopleIndex.sampleIds.map(id=>id%64))){const expected=`people/person-${String(i).padStart(4,'0')}.json`;if(peopleIndex.shards[i]!==expected)throw Error('Invalid staged people shard');const local=JSON.parse(await readFile(join(directory,'site/data',expected),'utf8'));const remote=await fetcher(new URL('/data/'+expected,parsed),{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!remote.ok||JSON.stringify(await remote.json())!==JSON.stringify(local))throw Error('Deployment people shard mismatch')}}
 return {url:parsed.origin,verifiedAt:new Date().toISOString()};
}
