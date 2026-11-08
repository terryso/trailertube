import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateMoviePages} from '../scripts/generate-movie-pages.mjs';

test('pilot pages carry escaped movie metadata and keep the app entry point',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-pages-'));
 try{
  await mkdir(join(dir,'data'));await writeFile(join(dir,'index.html'),'<!doctype html><html><head><meta name="description" content="Home"/><title>Home</title><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  await writeFile(join(dir,'data/catalog.json'),JSON.stringify({feedShards:['feed-0000.json']}));
  const movie={id:'123',title:'A <Film> & "Friends"',description:'A description with <script>alert(1)</script> & more.',trailer:'abcdefghijk',trailerChecked:true,playable:true};
  await writeFile(join(dir,'data/feed-0000.json'),JSON.stringify([movie,{...movie,id:'124',playable:false}]));const ids=join(dir,'ids.json'),metadata=join(dir,'metadata.json');await writeFile(ids,JSON.stringify(['123','124']));await writeFile(metadata,JSON.stringify({abcdefghijk:{name:'Trailer </script><script>alert(1)</script>',uploadDate:'2026-01-02T03:04:05Z',thumbnailUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'}}));
  assert.deepEqual(await generateMoviePages(dir,{idsFile:ids,metadataFile:metadata}),{selected:2,written:1,skipped:1,markedUp:1});
  const html=await readFile(join(dir,'watch/123.html'),'utf8');assert.match(html,/<title>A &lt;Film&gt; &amp; &quot;Friends&quot; - TrailerTube<\/title>/);assert.match(html,/<link rel="canonical" href="https:\/\/trailer\.terryso\.dev\/watch\/123"/);assert.match(html,/<h1>A &lt;Film&gt; &amp; &quot;Friends&quot;<\/h1>/);assert.doesNotMatch(html,/<script>alert/);assert.match(html,/src="\/assets\/app\.js"/);assert.match(html,/youtube\.com\/watch\?v=abcdefghijk/);const raw=html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];const ld=JSON.parse(raw);assert.equal(ld.name,'Trailer </script><script>alert(1)</script>');assert.match(ld.description,/^Trailer for A <Film>/);assert.equal(ld.uploadDate,'2026-01-02T03:04:05Z');assert.equal(ld.embedUrl,'https://www.youtube.com/embed/abcdefghijk');assert.doesNotMatch(raw,/<\/script>/);
  await assert.rejects(readFile(join(dir,'watch/124.html')),e=>e.code==='ENOENT');
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('rejects duplicate pilot IDs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-pages-'));
 try{await mkdir(join(dir,'data'));await writeFile(join(dir,'data/catalog.json'),'{}');const ids=join(dir,'ids.json'),metadata=join(dir,'metadata.json');await writeFile(ids,'["1","1"]');await writeFile(metadata,'{}');await assert.rejects(generateMoviePages(dir,{idsFile:ids,metadataFile:metadata}),/Invalid pilot/)}finally{await rm(dir,{recursive:true,force:true})}
});

test('omits video markup if verified metadata belongs to a different trailer',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-pages-'));
 try{await mkdir(join(dir,'data'));await writeFile(join(dir,'index.html'),'<html><head><meta name="description" content="Home"/><title>Home</title></head><body><div id="root"></div></body></html>');await writeFile(join(dir,'data/catalog.json'),JSON.stringify({feedShards:['feed-0000.json']}));await writeFile(join(dir,'data/feed-0000.json'),JSON.stringify([{id:'1',title:'Movie',description:'Details',trailer:'abcdefghijk',trailerChecked:true,playable:true}]));const ids=join(dir,'ids.json'),metadata=join(dir,'metadata.json');await writeFile(ids,'["1"]');await writeFile(metadata,JSON.stringify({ABCDEFGHIJK:{name:'Old trailer',uploadDate:'2026-01-02T03:04:05Z',thumbnailUrl:'https://i.ytimg.com/vi/ABCDEFGHIJK/hqdefault.jpg'}}));const result=await generateMoviePages(dir,{idsFile:ids,metadataFile:metadata});assert.equal(result.written,1);assert.equal(result.markedUp,0);assert.doesNotMatch(await readFile(join(dir,'watch/1.html'),'utf8'),/application\/ld\+json/)}finally{await rm(dir,{recursive:true,force:true})}
});

test('includes verified incremental candidates and omits unverified videos without inventing metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-incremental-pages-'));try{await mkdir(join(dir,'data'));await writeFile(join(dir,'index.html'),'<html><head><meta name="description" content="Home"/><title>Home</title></head><body><div id="root"></div></body></html>');const good={id:'12',title:'New film',description:'A real description',trailer:'abcdefghijk',trailerChecked:true,playable:true},bad={...good,id:'13',trailerChecked:false};await writeFile(join(dir,'data/catalog.json'),JSON.stringify({feedShards:['feed-0000.json'],incrementalPrerenderIds:['12','13'],count:2}));await writeFile(join(dir,'data/feed-0000.json'),JSON.stringify([good,bad]));const ids=join(dir,'ids.json'),metadata=join(dir,'metadata.json');await writeFile(ids,'["14"]');await writeFile(metadata,'{}');const result=await generateMoviePages(dir,{idsFile:ids,metadataFile:metadata});assert.deepEqual(result,{selected:3,written:1,skipped:2,markedUp:0});const html=await readFile(join(dir,'watch/12.html'),'utf8');assert.match(html,/<h1>New film<\/h1>/);assert.doesNotMatch(html,/VideoObject/);await assert.rejects(readFile(join(dir,'watch/13.html')),e=>e.code==='ENOENT')}finally{await rm(dir,{recursive:true,force:true})}
});

test('generates an honest static detail for verified films with no synopsis',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-missing-synopsis-'));try{await mkdir(join(dir,'data'));await writeFile(join(dir,'index.html'),'<html><head><meta name="description" content="Home"/><title>Home</title></head><body><div id="root"></div></body></html>');await writeFile(join(dir,'data/catalog.json'),JSON.stringify({feedShards:['feed-0000.json']}));await writeFile(join(dir,'data/feed-0000.json'),JSON.stringify([{id:'1',title:'Movie <A>',description:'',trailer:'abcdefghijk',trailerChecked:true,playable:true}]));const ids=join(dir,'ids.json'),metadata=join(dir,'metadata.json');await writeFile(ids,'["1"]');await writeFile(metadata,'{}');const result=await generateMoviePages(dir,{idsFile:ids,metadataFile:metadata});assert.equal(result.written,1);const html=await readFile(join(dir,'watch/1.html'),'utf8');assert.match(html,/<h1>Movie &lt;A&gt;<\/h1><p>Synopsis not available\.<\/p>/);assert.match(html,/content="Watch the trailer for Movie &lt;A&gt; on TrailerTube\."/);assert.doesNotMatch(html,/VideoObject/)}finally{await rm(dir,{recursive:true,force:true})}
});
