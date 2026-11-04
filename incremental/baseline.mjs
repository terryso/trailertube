// Do not publish a snapshot built from stale local data over a newer live site.
export async function assertPublishedBaseline({ordinary,adult,fetcher=fetch,origin='https://trailer.terryso.dev',retries=4,wait=ms=>new Promise(r=>setTimeout(r,ms))}) {
 const url=new URL(origin);if(url.origin!=='https://trailer.terryso.dev'||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error('Invalid production origin');
 if(!Number.isInteger(retries)||retries<0||retries>8)throw new Error('Invalid baseline retry count');
 const fields=['generatedAt','count','checked','withTrailer','auditGaps','complete'];
 for(const [name,local] of [['data',ordinary],['adult-data',adult]]){
  if(!local?.manifest)throw new Error(`Missing ${name} source manifest`);
  const target=new URL(`/${name}/catalog.json`,url);target.searchParams.set('baseline',local.manifest.generatedAt);
  let remote;for(let attempt=0;attempt<=retries;attempt++){
   try{const response=await fetcher(target,{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok){const error=new Error(`Production baseline unavailable for ${name}: HTTP ${response.status}`);if(response.status!==429&&response.status<500)throw Object.assign(error,{permanent:true});throw error}remote=await response.json();break}
   catch(error){if(error.permanent||attempt===retries)throw error;await wait(Math.min(15000,1000*2**attempt))}
  }
  for(const field of fields)if(remote[field]!==local.manifest[field])throw new Error(`Production baseline differs for ${name}: ${field}`);
 }
}
