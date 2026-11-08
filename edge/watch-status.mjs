const indexConfig="__MOVIE_INDEX_CONFIG__";
const response=(status,message,method)=>new Response(method==='HEAD'?null:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${message} - TrailerTube</title><meta name="robots" content="noindex"></head><body><main><h1>${message}</h1><p><a href="/">Return to TrailerTube</a></p></main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store',...(status===503?{'retry-after':'60'}:{})}});
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');

export function createWatchHandler(config){
 return async function(request,env){
  const url=new URL(request.url),method=request.method;
  if(!['GET','HEAD'].includes(method))return env.ASSETS.fetch(request);
  if(url.pathname==='/'){const asset=new URL('/home-prerender',url);return env.ASSETS.fetch(new Request(asset,request))}
  const match=/^\/watch\/([^/]+)\/?$/.exec(url.pathname);
  if(!match)return env.ASSETS.fetch(request);
  const id=match[1].replace(/\.html$/,'');
  if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||String(Number(id))!==id)return response(404,'Movie not found',method);
  try{
   const index=Number(id)%config.digests.length,asset=new URL(`/seo-data/movie-ids-${String(index).padStart(4,'0')}.json`,url.origin);
   const result=await env.ASSETS.fetch(new Request(asset,{method:'GET'}));
   if(!result.ok||!result.headers.get('content-type')?.includes('application/json'))throw Error('Movie index unavailable');
   const bytes=await result.arrayBuffer(),digest=hex(await crypto.subtle.digest('SHA-256',bytes));
   if(digest!==config.digests[index])throw Error('Movie index integrity failure');
   const ids=JSON.parse(new TextDecoder().decode(bytes));
   if(!Array.isArray(ids))throw Error('Movie index invalid');
   if(!ids.includes(id))return response(404,'Movie not found',method);
   return await env.ASSETS.fetch(request);
  }catch{return response(503,'Movie lookup temporarily unavailable',method)}
 };
}
export default {fetch(request,env){return createWatchHandler(indexConfig)(request,env)}};
