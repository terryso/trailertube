import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {youtubeWatchUrl} from '../src/youtube-link.js';
import {readYouTubeKey,readYouTubeOAuthFile,googleOAuthTokenProvider,fetchVideoSnippets} from './youtube-data.mjs';

const origin='https://trailer.terryso.dev';
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const movieDescription=movie=>String(movie.description||'').trim().replace(/\s+/g,' ').slice(0,155);

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
  const movie=movies.get(id),title=String(movie?.title||'').trim(),synopsis=movieDescription(movie||{}),description=synopsis||`Watch the trailer for ${title} on TrailerTube.`,youtube=youtubeWatchUrl(movie?.trailer);
  if(!movie||movie.adult===true||movie.playable!==true||movie.trailerChecked!==true||!title||!youtube)continue;
  const genreNames=(Array.isArray(movie.genreIds)?movie.genreIds:[]).map(g=>genres.find(x=>String(x.id)===String(g))?.name).filter(x=>typeof x==='string'&&x.trim());
  const release=typeof movie.createdAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(movie.createdAt)&&!Number.isNaN(Date.parse(movie.createdAt+'T00:00:00Z'))&&new Date(movie.createdAt+'T00:00:00Z').toISOString().slice(0,10)===movie.createdAt?movie.createdAt:'';
  const runtime=Number.isSafeInteger(movie.runtimeMinutes)&&movie.runtimeMinutes>0&&movie.runtimeMinutes<=3000?`${movie.runtimeMinutes} minutes`:'';
  const trusted=movie.creditsSource==='tmdb',persons=values=>Array.isArray(values)?values.filter(p=>Number.isSafeInteger(p?.id)&&p.id>0&&typeof p.name==='string'&&p.name.trim()).slice(0,8):[];
  const directors=trusted?persons(movie.directors):[],cast=trusted?persons(movie.cast):[];
  const row=(label,value)=>`<dt>${label}</dt><dd>${value}</dd>`;
  const details=[release?row('Release date',`<time datetime="${escapeHtml(release)}">${escapeHtml(release)}</time>`):'',genreNames.length?row('Genres',escapeHtml(genreNames.join(' · '))):'',runtime?row('Runtime',escapeHtml(runtime)):'',directors.length?row('Director',directors.map(x=>`<a href="/person/${x.id}">${escapeHtml(x.name)}</a>`).join(', ')):'',cast.length?row('Cast',cast.map(x=>`<a href="/person/${x.id}">${escapeHtml(x.name)}</a>`).join(', ')):''].join('');
  const canonical=`${origin}/watch/${id}`,video=metadata[movie.trailer],snippet=snippets[movie.trailer];let videoObject=null;
  if(video&&typeof video.name==='string'&&video.name.trim()&&typeof video.uploadDate==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(video.uploadDate)&&Number.isFinite(Date.parse(video.uploadDate))&&typeof video.thumbnailUrl==='string'&&new RegExp(`^https://i\\.ytimg\\.com/vi/${movie.trailer}/`).test(video.thumbnailUrl))videoObject={name:video.name,uploadDate:video.uploadDate,thumbnailUrl:video.thumbnailUrl};
  else if(snippet&&typeof snippet.name==='string'&&snippet.name.trim()&&typeof snippet.publishedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(snippet.publishedAt)&&Number.isFinite(Date.parse(snippet.publishedAt)))videoObject={name:snippet.name,uploadDate:snippet.publishedAt,thumbnailUrl:`https://i.ytimg.com/vi/${movie.trailer}/hqdefault.jpg`};
  let videoMarkup='';
  if(videoObject){
   const object={'@context':'https://schema.org','@type':'VideoObject',name:videoObject.name,description:`${movie.previewType==='Teaser'?'Teaser':'Trailer'} for ${title}. ${description}`,uploadDate:videoObject.uploadDate,thumbnailUrl:videoObject.thumbnailUrl,embedUrl:`https://www.youtube.com/embed/${movie.trailer}`};
   if(Number.isSafeInteger(movie.duration)&&movie.duration>0)object.duration=`PT${movie.duration}S`;
   const json=JSON.stringify(object).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
   videoMarkup=`<script type="application/ld+json" data-video-path="/watch/${id}">${json}</script>`;markedUp++;
  }
  const socialImage=typeof movie.cover==='string'&&/^https:\/\/image\.tmdb\.org\//.test(movie.cover)?movie.cover:(typeof movie.poster==='string'&&/^https:\/\/image\.tmdb\.org\//.test(movie.poster)?movie.poster:'');
  const social=`<meta property="og:title" content="${escapeHtml(title)} - TrailerTube"/><meta property="og:description" content="${escapeHtml(description)}"/><meta property="og:type" content="video.movie"/><meta property="og:url" content="${canonical}"/>${socialImage?`<meta property="og:image" content="${escapeHtml(socialImage)}"/>`:''}<meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escapeHtml(title)} - TrailerTube"/><meta name="twitter:description" content="${escapeHtml(description)}"/>${socialImage?`<meta name="twitter:image" content="${escapeHtml(socialImage)}"/>`:''}`;
  const html=template
   .replace(/<title>[^<]*<\/title>/,`<title>${escapeHtml(title)} - TrailerTube</title>`)
   .replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${escapeHtml(description)}"/><link rel="canonical" href="${canonical}"/>${social}${videoMarkup}`)
   .replace('<div id="root"></div>',`<div id="root"><main><h1>${escapeHtml(title)}</h1><p>${synopsis?escapeHtml(movie.description):'Synopsis not available.'}</p>${details?`<dl>${details}</dl>`:''}<p><a href="${escapeHtml(youtube)}">Watch trailer on YouTube</a></p></main></div>`);
  await writeFile(join(outputDir,'watch',`${id}.html`),html);written++;
 }
 return {selected:ids.length,written,skipped:ids.length-written,markedUp};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await generateMoviePages(process.argv[2]||'dist');console.log(`Generated ${result.written}/${result.selected} pilot movie pages (${result.skipped} no longer eligible)`)}
