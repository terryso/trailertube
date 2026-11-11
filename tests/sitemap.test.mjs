import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateSitemap} from '../scripts/generate-sitemap.mjs';

async function fixture(movies,expected=movies.length){
 const dir=await mkdtemp(join(tmpdir(),'trailertube-sitemap-'));
 await mkdir(join(dir,'data'));
 await writeFile(join(dir,'data/catalog.json'),JSON.stringify({feedShards:['feed-0000.json'],overview:{feedCount:expected}}));
 await writeFile(join(dir,'data/feed-0000.json'),JSON.stringify(movies));
 return dir;
}
const movie=id=>({id:String(id),title:`Film ${id}`,trailer:'abcdefghijk',playable:true,genreIds:['28'],duration:90});

test('sitemaps include public pages, playlists and video-marked movies, and split below the protocol limit',async()=>{
 const dir=await fixture(Array.from({length:45000},(_,i)=>movie(i+1)));
 try{
  const result=await generateSitemap(dir);
  assert.equal(result.maps,3);
  const index=await readFile(join(dir,'sitemap.xml'),'utf8'),first=await readFile(join(dir,'sitemap-0001.xml'),'utf8'),second=await readFile(join(dir,'sitemap-0002.xml'),'utf8'),robots=await readFile(join(dir,'robots.txt'),'utf8');
  assert.match(index,/sitemap-0001\.xml/);assert.match(index,/sitemap-0002\.xml/);assert.match(index,/sitemap-0003\.xml/);
  assert.equal((first.match(/<url>/g)||[]).length,20000);
  assert.match(first,/xmlns:video="http:\/\/www\.google\.com\/schemas\/sitemap-video\/1\.1"/);
  assert.match(first,/<loc>https:\/\/trailer\.terryso\.dev\/p\/action-adventure<\/loc>/);
  assert.match(second,/<loc>https:\/\/trailer\.terryso\.dev\/watch\/20001<\/loc>/);
  assert.match(second,/<video:video><video:thumbnail_loc>https:\/\/i\.ytimg\.com\/vi\/abcdefghijk\/hqdefault\.jpg<\/video:thumbnail_loc><video:title>Film 20001<\/video:title><video:player_loc>https:\/\/www\.youtube\.com\/embed\/abcdefghijk<\/video:player_loc><video:duration>90<\/video:duration><\/video:video>/);
  const staticUrl=first.match(/<url><loc>https:\/\/trailer\.terryso\.dev\/categories<\/loc>(.*?)<\/url>/);
  assert.ok(staticUrl);assert.doesNotMatch(staticUrl[1],/video:video/);
  assert.match(robots,/Sitemap: https:\/\/trailer\.terryso\.dev\/sitemap\.xml/);
  assert.doesNotMatch(first,/\/adult|\/search|\/history/);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('generation rejects an inconsistent or duplicate feed',async()=>{
 const dir=await fixture([movie(1),movie(1)]);
 try{await assert.rejects(generateSitemap(dir),/duplicate/)}finally{await rm(dir,{recursive:true,force:true})}
 const incomplete=await fixture([movie(1)],2);
 try{await assert.rejects(generateSitemap(incomplete),/count/)}finally{await rm(incomplete,{recursive:true,force:true})}
});
