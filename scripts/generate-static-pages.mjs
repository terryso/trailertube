import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCuratedPlaylists} from '../src/curated-playlists.js';

const origin='https://trailer.terryso.dev';
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const text=value=>escapeHtml(String(value||'').trim().replace(/\s+/g,' '));

export async function generateStaticPages(outputDir){
 const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
 const dataDir=join(outputDir,'data'),manifest=await readJson(join(dataDir,'catalog.json'));
 if(!Array.isArray(manifest.feedShards)||!Number.isSafeInteger(manifest.overview?.feedCount))throw new Error('Catalog does not contain a verifiable trailer feed');
 const movies=[];
 for(const name of manifest.feedShards){
  if(!/^feed-\d{4,}\.json$/.test(name))throw new Error('Invalid feed shard name');
  for(const movie of await readJson(join(dataDir,name)))movies.push(movie);
 }
 if(movies.length!==manifest.overview.feedCount)throw new Error('Trailer feed count does not match its manifest');
 let genres=[];try{genres=await readJson(join(dataDir,'genres.json'));if(!Array.isArray(genres)||genres.some(g=>!/^\d+$/.test(String(g?.id))||typeof g?.name!=='string'||!g.name.trim()))throw Error('Invalid genre list')}catch(e){if(e.code!=='ENOENT')throw e}
 const playlists=makeCuratedPlaylists(movies);
 if(!playlists.length)throw new Error('No curated playlists are available');
 const template=await readFile(join(outputDir,'index.html'),'utf8');
 if(!template.includes('<div id="root"></div>')||!/<title>[^<]*<\/title>/.test(template)||!/<meta name="description"[^>]*\/>/.test(template))throw new Error('Unexpected HTML template');
 const page=({path,title,description,h1,body})=>template
  .replace(/<title>[^<]*<\/title>/,`<title>${escapeHtml(title)}</title>`)
  .replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${escapeHtml(description)}"/><link rel="canonical" href="${origin}${path}"/>`)
  .replace('<div id="root"></div>',`<div id="root"><main><h1>${escapeHtml(h1)}</h1>${body}</main></div>`);
 const link=(href,label)=>`<a href="${escapeHtml(href)}">${text(label)}</a>`;
 const genreLinks=genres.map(g=>link(`/browse?category=${encodeURIComponent(String(g.id))}`,`${g.name} trailers`)).join(' · ');
 const sectionOrder=['Start here','Explore genres'];
 const playlistLinks=sectionOrder.map(section=>{const lists=playlists.filter(p=>p.section===section);return lists.length?`<p>${lists.map(p=>link(`/p/${encodeURIComponent(p.id)}`,p.title)).join(' · ')}</p>`:''}).filter(Boolean).join('\n');
 const aboutBody=`<p>Discover movie trailers. TrailerTube collects trailers for recently released movies and plays them through YouTube.</p><p>Movie information and images are provided by The Movie Database (TMDB). This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>Trailer availability can change and may depend on your region.</p><p>${link('/','Latest trailers')} · ${link('/categories','Browse by genre')} · ${link('/playlists','Curated playlists')}</p>`;
 const pages=[
  {file:'categories.html',content:page({path:'/categories',title:'Movie Trailer Categories | TrailerTube',description:`Browse movie trailers by genre, from action and comedy to horror and documentary. ${genres.length} categories with verified trailers.`,h1:'Movie trailer categories',body:`<p>Explore available movie trailers by genre.</p><p>${genreLinks}</p><p>${link('/playlists','Curated playlists')} · ${link('/','Latest trailers')}</p>`})},
  {file:'playlists.html',content:page({path:'/playlists',title:'Curated Movie Trailer Playlists | TrailerTube',description:'Start with recently released and popular movie trailers, or explore curated playlists by genre.',h1:'Curated movie trailer playlists',body:`<p>Explore recently released movies and popular trailers grouped by genre.</p>${playlistLinks}<p>${link('/categories','Browse by genre')} · ${link('/','Latest trailers')}</p>`})},
  {file:'about.html',content:page({path:'/about',title:'About TrailerTube',description:'TrailerTube is a movie trailer discovery site powered by TMDB metadata with trailers played through YouTube.',h1:'About TrailerTube',body:aboutBody})},
 ];
 for(const {file,content} of pages)await writeFile(join(outputDir,file),content);
 return {pages:pages.length,playlists:playlists.length,genres:genres.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await generateStaticPages(resolve(process.argv[2]||'dist'));console.log(`Generated ${result.pages} static hub pages (${result.playlists} playlists, ${result.genres} genres)`)}
