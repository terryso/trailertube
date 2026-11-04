import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCuratedPlaylists} from '../src/curated-playlists.js';

const origin='https://trailer.terryso.dev';
const maxUrls=45000;
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));

export async function generateSitemap(outputDir){
 const dataDir=join(outputDir,'data');
 const manifest=await readJson(join(dataDir,'catalog.json'));
 if(!Array.isArray(manifest.feedShards)||!Number.isSafeInteger(manifest.overview?.feedCount))throw new Error('Catalog does not contain a verifiable trailer feed');
 const movies=[],ids=new Set();
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
 const urls=['/','/categories','/playlists','/about',...makeCuratedPlaylists(movies).map(p=>'/p/'+encodeURIComponent(p.id)),...movies.map(m=>'/watch/'+encodeURIComponent(m.id))].map(path=>origin+path);
 const maps=[];
 for(let i=0;i<urls.length;i+=maxUrls){
  const name=`sitemap-${String(maps.length+1).padStart(4,'0')}.xml`;
  const body=urls.slice(i,i+maxUrls).map(url=>`  <url><loc>${xml(url)}</loc></url>`).join('\n');
  await writeFile(join(outputDir,name),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
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
