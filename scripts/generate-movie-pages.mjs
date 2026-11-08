import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {youtubeWatchUrl} from '../src/youtube-link.js';

const origin='https://trailer.terryso.dev';
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const movieDescription=movie=>String(movie.description||'').trim().replace(/\s+/g,' ').slice(0,155);

export async function generateMoviePages(outputDir,{idsFile=new URL('../seo/pilot-movie-ids.json',import.meta.url),metadataFile=new URL('../seo/pilot-video-metadata.json',import.meta.url)}={}){
 const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
 const pilot=await readJson(idsFile),metadata=await readJson(metadataFile),manifest=await readJson(join(outputDir,'data/catalog.json'));
 if(!Array.isArray(pilot)||!pilot.length||pilot.length>500||pilot.some(id=>typeof id!=='string'||!/^\d+$/.test(id))||new Set(pilot).size!==pilot.length)throw new Error('Invalid pilot movie IDs');
 const incremental=manifest.incrementalPrerenderIds??[];
 if(!Array.isArray(incremental)||incremental.some(id=>typeof id!=='string'||!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))||new Set(incremental).size!==incremental.length||(Number.isSafeInteger(manifest.count)&&incremental.length>manifest.count))throw new Error('Invalid incremental prerender candidates');
 const ids=[...new Set([...pilot,...incremental])];
 if(!Array.isArray(manifest.feedShards))throw new Error('Missing feed shards');
 const wanted=new Set(ids),movies=new Map();
 for(const name of manifest.feedShards){
  if(!/^feed-\d{4,}\.json$/.test(name))throw new Error('Invalid feed shard name');
  for(const movie of await readJson(join(outputDir,'data',name)))if(wanted.has(String(movie.id))){if(movies.has(String(movie.id)))throw new Error('Duplicate pilot movie');movies.set(String(movie.id),movie)}
 }
 const template=await readFile(join(outputDir,'index.html'),'utf8');
 if(!template.includes('<div id="root"></div>')||!/<title>[^<]*<\/title>/.test(template)||!/<meta name="description"[^>]*\/>/.test(template))throw new Error('Unexpected HTML template');
 await mkdir(join(outputDir,'watch'),{recursive:true});
 let written=0,markedUp=0;
 for(const id of ids){
  const movie=movies.get(id),title=String(movie?.title||'').trim(),synopsis=movieDescription(movie||{}),description=synopsis||`Watch the trailer for ${title} on TrailerTube.`,youtube=youtubeWatchUrl(movie?.trailer);
  if(!movie||movie.adult===true||movie.playable!==true||movie.trailerChecked!==true||!title||!youtube)continue;
  const canonical=`${origin}/watch/${id}`,video=metadata[movie.trailer];let videoMarkup='';
  if(video&&typeof video.name==='string'&&video.name.trim()&&typeof video.uploadDate==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(video.uploadDate)&&Number.isFinite(Date.parse(video.uploadDate))&&typeof video.thumbnailUrl==='string'&&new RegExp(`^https://i\\.ytimg\\.com/vi/${movie.trailer}/`).test(video.thumbnailUrl)){
   const object={'@context':'https://schema.org','@type':'VideoObject',name:video.name,description:`${movie.previewType==='Teaser'?'Teaser':'Trailer'} for ${title}. ${description}`,uploadDate:video.uploadDate,thumbnailUrl:video.thumbnailUrl,embedUrl:`https://www.youtube.com/embed/${movie.trailer}`};
   if(Number.isSafeInteger(movie.duration)&&movie.duration>0)object.duration=`PT${movie.duration}S`;
   const json=JSON.stringify(object).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
   videoMarkup=`<script type="application/ld+json" data-video-path="/watch/${id}">${json}</script>`;markedUp++;
  }
  const html=template
   .replace(/<title>[^<]*<\/title>/,`<title>${escapeHtml(title)} - TrailerTube</title>`)
   .replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${escapeHtml(description)}"/><link rel="canonical" href="${canonical}"/>${videoMarkup}`)
   .replace('<div id="root"></div>',`<div id="root"><main><h1>${escapeHtml(title)}</h1><p>${synopsis?escapeHtml(movie.description):'Synopsis not available.'}</p><p><a href="${escapeHtml(youtube)}">Watch trailer on YouTube</a></p></main></div>`);
  await writeFile(join(outputDir,'watch',`${id}.html`),html);written++;
 }
 return {selected:ids.length,written,skipped:ids.length-written,markedUp};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await generateMoviePages(process.argv[2]||'dist');console.log(`Generated ${result.written}/${result.selected} pilot movie pages (${result.skipped} no longer eligible)`)}
