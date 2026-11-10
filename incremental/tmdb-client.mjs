const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createTmdbClient({key,fetcher=fetch,now=Date.now,wait=sleep,spacingMs=85,retries=5}={}) {
  if(!key||typeof fetcher!=='function'||!Number.isFinite(spacingMs)||spacingMs<0||!Number.isInteger(retries)||retries<0)throw new Error('Invalid TMDB client configuration');
  let nextStart=0;
  return async function request(path,params={}) {
    if(!/^\/(movie\/changes|movie\/\d+(?:\/watch\/providers)?|discover\/movie|genre\/movie\/list)$/.test(path))throw new Error('Unsupported TMDB endpoint');
    for(let attempt=0;attempt<=retries;attempt++){
      const at=Math.max(now(),nextStart);nextStart=at+spacingMs;if(at>now())await wait(at-now());
      const url=new URL(`https://api.themoviedb.org/3${path}`);url.search=new URLSearchParams({...params,api_key:key});
      let response;try{response=await fetcher(url,{signal:AbortSignal.timeout(30000)})}catch(error){if(attempt===retries)throw new Error(`TMDB network failure for ${path}`,{cause:error});await wait(Math.min(30000,1000*2**attempt));continue}
      if(response.status===404&&/^\/movie\/\d+$/.test(path))return null;
      if(response.status===429||response.status>=500){if(attempt===retries)throw new Error(`TMDB HTTP ${response.status} for ${path}`);await wait(Math.min(30000,1000*2**attempt));continue}
      if(!response.ok)throw new Error(`TMDB HTTP ${response.status} for ${path}`);
      try{return await response.json()}catch(error){if(attempt===retries)throw new Error(`TMDB response could not be read for ${path}`,{cause:error});await wait(Math.min(30000,1000*2**attempt))}
    }
  };
}
