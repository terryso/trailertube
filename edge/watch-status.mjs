const indexConfig="__MOVIE_INDEX_CONFIG__";
// Shared movie page rendering. This module is deployed verbatim as the Pages
// worker (scripts/generate-watch-index.mjs only replaces the config constant),
// so it must stay a single self-contained file with no local imports. The
// build-time prerender in scripts/generate-movie-pages.mjs imports these
// render helpers so static pages and edge-rendered pages stay identical.
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
// Mirrors youtubeWatchUrl in src/youtube-link.js; duplicated so the worker
// ships as one file. Keep both in sync.
const youtubeUrl=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id)?`https://www.youtube.com/watch?v=${id}`:null;
export const movieDescription=movie=>String(movie.description||'').trim().replace(/\s+/g,' ').slice(0,155);
export function moviePageEligible(movie){
 const title=String(movie?.title||'').trim();
 return Boolean(movie)&&movie.adult!==true&&movie.playable===true&&movie.trailerChecked===true&&Boolean(title)&&Boolean(youtubeUrl(movie.trailer));
}
export function movieVideoMeta(movie,video,snippet){
 if(video&&typeof video.name==='string'&&video.name.trim()&&typeof video.uploadDate==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(video.uploadDate)&&Number.isFinite(Date.parse(video.uploadDate))&&typeof video.thumbnailUrl==='string'&&new RegExp(`^https://i\\.ytimg\\.com/vi/${movie.trailer}/`).test(video.thumbnailUrl))return {name:video.name,uploadDate:video.uploadDate,thumbnailUrl:video.thumbnailUrl};
 if(snippet&&typeof snippet.name==='string'&&snippet.name.trim()&&typeof snippet.publishedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(snippet.publishedAt)&&Number.isFinite(Date.parse(snippet.publishedAt)))return {name:snippet.name,uploadDate:snippet.publishedAt,thumbnailUrl:`https://i.ytimg.com/vi/${movie.trailer}/hqdefault.jpg`};
 return null;
}
export function renderMoviePage({templateHtml,movie,genres=[],origin,videoMeta=null}){
 if(!moviePageEligible(movie))return null;
 if(!templateHtml.includes('<div id="root"></div>')||!/<title>[^<]*<\/title>/.test(templateHtml)||!/<meta name="description"[^>]*\/>/.test(templateHtml))throw new Error('Unexpected HTML template');
 const id=String(movie.id),title=String(movie.title||'').trim(),synopsis=movieDescription(movie),description=synopsis||`Watch the trailer for ${title} on TrailerTube.`,youtube=youtubeUrl(movie.trailer);
 const genreList=Array.isArray(genres)?genres.filter(x=>x&&/^\d+$/.test(String(x.id))&&typeof x.name==='string'&&x.name.trim()):[];
 const genreName=genreId=>genreList.find(x=>String(x.id)===String(genreId))?.name;
 const genreNames=(Array.isArray(movie.genreIds)?movie.genreIds:[]).map(genreName).filter(x=>typeof x==='string'&&x.trim());
 const genreLinks=(Array.isArray(movie.genreIds)?movie.genreIds:[]).map(gid=>{const genre=genreList.find(x=>String(x.id)===String(gid));return genre?`<a href="/browse?category=${encodeURIComponent(String(genre.id))}">${escapeHtml(genre.name)} trailers</a>`:null}).filter(Boolean).slice(0,4);
 const release=typeof movie.createdAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(movie.createdAt)&&!Number.isNaN(Date.parse(movie.createdAt+'T00:00:00Z'))&&new Date(movie.createdAt+'T00:00:00Z').toISOString().slice(0,10)===movie.createdAt?movie.createdAt:'';
 const runtime=Number.isSafeInteger(movie.runtimeMinutes)&&movie.runtimeMinutes>0&&movie.runtimeMinutes<=3000?`${movie.runtimeMinutes} minutes`:'';
 const trusted=movie.creditsSource==='tmdb',persons=values=>Array.isArray(values)?values.filter(p=>Number.isSafeInteger(p?.id)&&p.id>0&&typeof p.name==='string'&&p.name.trim()).slice(0,8):[];
 const directors=trusted?persons(movie.directors):[],cast=trusted?persons(movie.cast):[];
 const row=(label,value)=>`<dt>${label}</dt><dd>${value}</dd>`;
 const details=[release?row('Release date',`<time datetime="${escapeHtml(release)}">${escapeHtml(release)}</time>`):'',genreNames.length?row('Genres',escapeHtml(genreNames.join(' · '))):'',runtime?row('Runtime',escapeHtml(runtime)):'',directors.length?row('Director',directors.map(x=>`<a href="/person/${x.id}">${escapeHtml(x.name)}</a>`).join(', ')):'',cast.length?row('Cast',cast.map(x=>`<a href="/person/${x.id}">${escapeHtml(x.name)}</a>`).join(', ')):''].join('');
 const canonical=`${origin}/watch/${id}`;
 let videoMarkup='';
 if(videoMeta){
  const object={'@context':'https://schema.org','@type':'VideoObject',name:videoMeta.name,description:`${movie.previewType==='Teaser'?'Teaser':'Trailer'} for ${title}. ${description}`,uploadDate:videoMeta.uploadDate,thumbnailUrl:videoMeta.thumbnailUrl,embedUrl:`https://www.youtube.com/embed/${movie.trailer}`};
  if(Number.isSafeInteger(movie.duration)&&movie.duration>0)object.duration=`PT${movie.duration}S`;
  const json=JSON.stringify(object).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
  videoMarkup=`<script type="application/ld+json" data-video-path="/watch/${id}">${json}</script>`;
 }
 const socialImage=typeof movie.cover==='string'&&/^https:\/\/image\.tmdb\.org\//.test(movie.cover)?movie.cover:(typeof movie.poster==='string'&&/^https:\/\/image\.tmdb\.org\//.test(movie.poster)?movie.poster:'');
 const social=`<meta property="og:title" content="${escapeHtml(title)} - TrailerTube"/><meta property="og:description" content="${escapeHtml(description)}"/><meta property="og:type" content="video.movie"/><meta property="og:url" content="${canonical}"/>${socialImage?`<meta property="og:image" content="${escapeHtml(socialImage)}"/>`:''}<meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escapeHtml(title)} - TrailerTube"/><meta name="twitter:description" content="${escapeHtml(description)}"/>${socialImage?`<meta name="twitter:image" content="${escapeHtml(socialImage)}"/>`:''}`;
 return templateHtml
  .replace(/<title>[^<]*<\/title>/,`<title>${escapeHtml(title)} - TrailerTube</title>`)
  .replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${escapeHtml(description)}"/><link rel="canonical" href="${canonical}"/>${social}${videoMarkup}`)
  .replace('<div id="root"></div>',`<div id="root"><main><h1>${escapeHtml(title)}</h1><p>${synopsis?escapeHtml(movie.description):'Synopsis not available.'}</p>${details?`<dl>${details}</dl>`:''}${genreLinks.length?`<p>Explore more: ${genreLinks.join(' · ')}</p>`:''}<p><a href="${escapeHtml(youtube)}">Watch trailer on YouTube</a></p></main></div>`);
}
const response=(status,message,method)=>new Response(method==='HEAD'?null:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${message} - TrailerTube</title><meta name="robots" content="noindex"></head><body><main><h1>${message}</h1><p><a href="/">Return to TrailerTube</a></p></main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store',...(status===503?{'retry-after':'60'}:{})}});
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
let templateCache=null;
async function loadAppTemplate(url,env,version){
 if(templateCache&&templateCache.version===version)return templateCache.text;
 const asset=await env.ASSETS.fetch(new Request(new URL('/index.html',url),{method:'GET'}));
 if(!asset.ok||!asset.headers.get('content-type')?.includes('text/html'))throw Error('App template unavailable');
 const text=await asset.text();templateCache={version,text};return text;
}
export function createWatchHandler(config){
 const prerendered=new Set(Array.isArray(config.prerenderedIds)?config.prerenderedIds:[]);
 const genres=Array.isArray(config.genres)?config.genres:[];
 const renderShards=Number.isSafeInteger(config.renderShards)&&config.renderShards>0&&Array.isArray(config.renderDigests)&&config.renderDigests.length===config.renderShards?config.renderShards:0;
 const origin=typeof config.origin==='string'&&/^https:\/\/[a-z0-9.-]+$/.test(config.origin)?config.origin:'';
 const renderVersion=typeof config.renderVersion==='string'&&config.renderVersion?config.renderVersion:'';
 const edgeRender=renderShards>0&&origin&&renderVersion;
 async function renderWatchPage(id,url,env){
  const bucket=Number(id)%renderShards,asset=new URL(`/seo-data/render-${String(bucket).padStart(4,'0')}.json`,url);
  const result=await env.ASSETS.fetch(new Request(asset,{method:'GET'}));
  if(!result.ok||!result.headers.get('content-type')?.includes('application/json'))throw Error('Render index unavailable');
  const bytes=await result.arrayBuffer(),digest=hex(await crypto.subtle.digest('SHA-256',bytes));
  if(digest!==config.renderDigests[bucket])throw Error('Render index integrity failure');
  const movies=JSON.parse(new TextDecoder().decode(bytes));
  const movie=Array.isArray(movies)?movies.find(m=>String(m?.id)===id):null;
  if(!moviePageEligible(movie))return null;
  const template=await loadAppTemplate(url,env,renderVersion);
  return renderMoviePage({templateHtml:template,movie,genres,origin,videoMeta:null});
 }
 async function noindexShell(url,env,method){
  const asset=await env.ASSETS.fetch(new Request(new URL('/index.html',url),{method:'GET'}));
  if(!asset.ok||!asset.headers.get('content-type')?.includes('text/html'))throw Error('App template unavailable');
  const html=await asset.text();
  if(!html.includes('<head>'))throw Error('Unexpected app template');
  return new Response(method==='HEAD'?null:html.replace('<head>','<head><meta name="robots" content="noindex">'),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 }
 return async function(request,env,ctx){
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
   if(prerendered.has(id))return await env.ASSETS.fetch(request);
   if(!edgeRender)return await env.ASSETS.fetch(request);
   const cache=typeof caches!=='undefined'&&ctx?caches.default:null;
   const key=new Request(`${origin}/__render/${renderVersion}/watch/${id}`,{method:'GET'});
   if(cache&&method==='GET'){const hit=await cache.match(key);if(hit)return hit}
   const html=await renderWatchPage(id,url,env);
   if(html===null)return await noindexShell(url,env,method);
   const res=new Response(method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=3600'}});
   if(cache&&method==='GET')ctx.waitUntil(cache.put(key,res.clone()));
   return res;
  }catch{return response(503,'Movie lookup temporarily unavailable',method)}
 };
}
export default {fetch(request,env,ctx){return createWatchHandler(indexConfig)(request,env,ctx)}}
