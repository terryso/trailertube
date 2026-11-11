import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {movieDescription,moviePageEligible,movieVideoMeta,renderMoviePage} from '../edge/watch-status.mjs';
import {readYouTubeKey,readYouTubeOAuthFile,googleOAuthTokenProvider,fetchVideoSnippets} from './youtube-data.mjs';

const origin='https://trailer.terryso.dev';
export {movieDescription};

export async function generateMoviePages(outputDir,{idsFile=new URL('../seo/pilot-movie-ids.json',import.meta.url),metadataFile=new URL('../seo/pilot-video-metadata.json',import.meta.url),snippetFile=new URL('../.cache/seo-video-snippets.json',import.meta.url),enrichSnippets=true}={}){
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
 // The compact feed omits credits. Load only the detail buckets needed by
 // these pages, so their HTML can include trustworthy movie metadata.
 if(manifest.movieDetailsVersion===1){
  if(!Array.isArray(manifest.shards)||manifest.shards.length!==64)throw Error('Invalid movie details shards');
  const buckets=new Set([...movies.keys()].map(id=>Number(id)%64));for(const bucket of buckets){const name=manifest.shards[bucket],expected=`catalog-${String(bucket).padStart(4,'0')}.json`;if(name!==expected)throw Error('Invalid movie details shard');for(const entry of await readJson(join(outputDir,'data',name))){const id=String(entry.id);if(movies.has(id)){const {runtimeMinutes,directors,cast,creditsSource}=entry;movies.set(id,{...movies.get(id),runtimeMinutes,directors,cast,creditsSource})}}}
 }
 let genres=[];try{genres=await readJson(join(outputDir,'data/genres.json'));if(!Array.isArray(genres))throw Error('Invalid genre list')}catch(e){if(e.code!=='ENOENT')throw e}
 // Real trailer titles and upload dates come straight from YouTube's snippet
 // API and are cached, so structured data stays factual; without credentials
 // the cached snippets are reused and pages simply carry no video markup.
 let snippets={};try{snippets=JSON.parse(await readFile(snippetFile,'utf8'));if(!snippets||typeof snippets!=='object'||Array.isArray(snippets))snippets={}}catch(e){if(e.code!=='ENOENT')throw e}
 const missingSnippets=enrichSnippets?[...new Set([...movies.values()].map(m=>typeof m.trailer==='string'&&/^[A-Za-z0-9_-]{11}$/.test(m.trailer)?m.trailer:null).filter(Boolean))].filter(id=>!metadata[id]&&!snippets[id]):[];
 if(missingSnippets.length){
  try{
   const key=await readYouTubeKey(),oauthFile=await readYouTubeOAuthFile();
   if(key||oauthFile){
    const fetched=await fetchVideoSnippets(missingSnippets,{key,getToken:oauthFile?googleOAuthTokenProvider(oauthFile):null});
    if(fetched.size){snippets={...snippets,...Object.fromEntries(fetched)};const temp=snippetFile.pathname+'.tmp';await writeFile(temp,JSON.stringify(snippets));await rename(temp,snippetFile.pathname)}
   }
  }catch(e){console.error(`Trailer snippet enrichment skipped: ${e.message}`)}
 }
 const template=await readFile(join(outputDir,'index.html'),'utf8');
 if(!template.includes('<div id="root"></div>')||!/<title>[^<]*<\/title>/.test(template)||!/<meta name="description"[^>]*\/>/.test(template))throw new Error('Unexpected HTML template');
 await mkdir(join(outputDir,'watch'),{recursive:true});
 let written=0,markedUp=0;
 for(const id of ids){
  const movie=movies.get(id);
  if(!moviePageEligible(movie))continue;
  const videoMeta=movieVideoMeta(movie,metadata[movie.trailer],snippets[movie.trailer]);
  const html=renderMoviePage({templateHtml:template,movie,genres,origin,videoMeta});
  if(!html)continue;
  await writeFile(join(outputDir,'watch',`${id}.html`),html);written++;
  if(videoMeta)markedUp++;
 }
 return {selected:ids.length,written,skipped:ids.length-written,markedUp};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await generateMoviePages(process.argv[2]||'dist');console.log(`Generated ${result.written}/${result.selected} pilot movie pages (${result.skipped} no longer eligible)`)}
