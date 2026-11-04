import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateSitemap} from '../scripts/generate-sitemap.mjs';

async function fixture(movies,expected=movies.length){
 const dir=await mkdtemp(join(tmpdir(),'trailertube-sitemap-'));
 await mkdir(join(dir,'data'));
 await writeFile(join(dir,'data','catalog.json'),JSON.stringify({feedShards:['feed-0000.json'],overview:{feedCount:expected}}));
 await writeFile(join(dir,'data','feed-0000.json'),JSON.stringify(movies));
 return dir;
}
const movie=id=>({id:String(id),trailer:'abcdefghijk',playable:true,genreIds:['28']});

test('sitemaps include public pages, available playlists and movies, and split below the protocol limit',async()=>{
 const dir=await fixture(Array.from({length:45000},(_,i)=>movie(i+1)));
 try{
  const result=await generateSitemap(dir);
  assert.equal(result.maps,2);
  const index=await readFile(join(dir,'sitemap.xml'),'utf8'),first=await readFile(join(dir,'sitemap-0001.xml'),'utf8'),second=await readFile(join(dir,'sitemap-0002.xml'),'utf8'),robots=await readFile(join(dir,'robots.txt'),'utf8');
  assert.match(index,/sitemap-0001\.xml/);assert.match(index,/sitemap-0002\.xml/);
  assert.equal((first.match(/<url>/g)||[]).length,45000);
  assert.match(first,/<loc>https:\/\/trailer\.terryso\.dev\/p\/action-adventure<\/loc>/);
  assert.match(second,/<loc>https:\/\/trailer\.terryso\.dev\/watch\/45000<\/loc>/);
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
