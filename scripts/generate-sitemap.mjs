import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCuratedPlaylists} from '../src/curated-playlists.js';

const origin='https://trailer.terryso.dev';
const maxUrls=20000;
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
// Google's video extension so trailer pages can surface in video search.
// Required tags only: thumbnail, title and player location; the upload date
// is unknown for most trailers and stays on the prerendered VideoObject.
const videoMarkup=movie=>{
 const trailer=typeof movie.trailer==='string'&&/^[A-Za-z0-9_-]{11}$/.test(movie.trailer)?movie.trailer:null;
 const title=String(movie.title||'').trim();
 if(!trailer||!title)return '';
 let block=`<video:video><video:thumbnail_loc>https://i.ytimg.com/vi/${trailer}/hqdefault.jpg</video:thumbnail_loc><video:title>${xml(title)}</video:title><video:player_loc>https://www.youtube.com/embed/${trailer}</video:player_loc>`;
 if(Number.isSafeInteger(movie.duration)&&movie.duration>0)block+=`<video:duration>${movie.duration}</video:duration>`;
 return block+'</video:video>';
};

export async function generateSitemap(outputDir){
 const dataDir=join(outputDir,'data');
 const manifest=await readJson(join(dataDir,'catalog.json'));
 if(!Array.isArray(manifest.feedShards)||!Number.isSafeInteger(manifest.overview?.feedCount))throw new Error('Catalog does not contain a verifiable trailer feed');
 const movies=[],ids=new Set();
 // lastmod tells Google which sitemap entries changed with this snapshot so
 // incremental pipeline additions get re-read sooner.
 const lastmod=typeof manifest.generatedAt==='string'&&/^\d{4}-\d{2}-\d{2}/.exec(manifest.generatedAt)?.[0]||new Date().toISOString().slice(0,10);
 for(const name of manifest.feedShards){
  if(!/^feed-\d{4,}\.json$/.test(name))throw new Error('Invalid feed shard name');
  const shard=await readJson(join(dataDir,name));
  if(!Array.isArray(shard))throw new Error('Invalid feed shard');
  for(const movie of shard){
   if(!/^\d+$/.test(String(movie.id))||ids.has(String(movie.id))||!movie.trailer||movie.playable===false||movie.adult===true||!Array.isArray(movie.genreIds))throw new Error('Invalid or duplicate movie in trailer feed');
   ids.add(String(movie.id));movies.push(movie);
  }
 }
 if(movies.length!==manifest.overview.feedCount)throw new Error('Trailer feed count does not match its manifest');
 const urls=[{path:'/'},{path:'/categories'},{path:'/playlists'},{path:'/about'},...makeCuratedPlaylists(movies).map(p=>({path:'/p/'+encodeURIComponent(p.id)})),...movies.map(m=>({path:'/watch/'+encodeURIComponent(m.id),movie:m}))].map(entry=>({...entry,url:origin+entry.path}));
 const maps=[];
 for(let i=0;i<urls.length;i+=maxUrls){
  const name=`sitemap-${String(maps.length+1).padStart(4,'0')}.xml`;
  const body=urls.slice(i,i+maxUrls).map(entry=>`  <url><loc>${xml(entry.url)}</loc>${lastmod?`<lastmod>${lastmod}</lastmod>`:''}${entry.movie?videoMarkup(entry.movie):''}</url>`).join('\n');
  await writeFile(join(outputDir,name),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${body}\n</urlset>\n`);
  maps.push(name);
 }
 await writeFile(join(outputDir,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map(name=>`  <sitemap><loc>${origin}/${name}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`);
 await writeFile(join(outputDir,'robots.txt'),`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
 return {urls:urls.length,maps:maps.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await generateSitemap(process.argv[2]||'dist');
 console.log(`Generated ${result.maps} sitemap files containing ${result.urls} URLs`);
}
