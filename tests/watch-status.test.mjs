import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWatchHandler} from '../edge/watch-status.mjs';
import {generateWatchIndex} from '../scripts/generate-watch-index.mjs';

const digest=s=>createHash('sha256').update(s).digest('hex');
test('movie status requires a verified index and preserves existing static pages',async()=>{
 const index='["123"]',handler=createWatchHandler({digests:Array(64).fill(digest(index))});
 const env={ASSETS:{fetch:async input=>new URL(input.url).pathname.startsWith('/seo-data/')?new Response(index,{headers:{'content-type':'application/json'}}):new Response('<title>Movie</title>',{status:200,headers:{'content-type':'text/html'}})}};
 let r=await handler(new Request('https://example.com/watch/123'),env);assert.equal(r.status,200);assert.match(await r.text(),/Movie/);
 r=await handler(new Request('https://example.com/watch/999999999999999'),env);assert.equal(r.status,404);assert.match(await r.text(),/Movie not found/);
 r=await handler(new Request('https://example.com/watch/999999999999999/'),env);assert.equal(r.status,404);
 r=await handler(new Request('https://example.com/watch/123.html'),env);assert.equal(r.status,200);
 r=await handler(new Request('https://example.com/watch/999',{method:'HEAD'}),env);assert.equal(r.status,404);assert.equal(await r.text(),'');
 r=await handler(new Request('https://example.com/watch/abc'),env);assert.equal(r.status,404);
 const unavailable={ASSETS:{fetch:async()=>new Response('<html>fallback</html>',{headers:{'content-type':'text/html'}})}};r=await handler(new Request('https://example.com/watch/123'),unavailable);assert.equal(r.status,503);
 const corrupt={ASSETS:{fetch:async()=>new Response('[]',{headers:{'content-type':'application/json'}})}};r=await handler(new Request('https://example.com/watch/123'),corrupt);assert.equal(r.status,503);
 const thrown={ASSETS:{fetch:async()=>{throw Error('unavailable')}}};r=await handler(new Request('https://example.com/watch/123'),thrown);assert.equal(r.status,503);
});

test('build index is bound to the full catalog and rejects incomplete or misplaced IDs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-watch-index-'));
 try{await mkdir(join(dir,'data'));const shards=Array.from({length:64},(_,i)=>`catalog-${String(i).padStart(4,'0')}.json`);for(let i=0;i<64;i++)await writeFile(join(dir,'data',shards[i]),JSON.stringify(i===0?[{id:'64'}]:[]));const manifest={shardBy:'id-modulo-v2',shards,count:1};await writeFile(join(dir,'data/catalog.json'),JSON.stringify(manifest));assert.deepEqual(await generateWatchIndex(dir),{movies:1,shards:64});assert.match(await readFile(join(dir,'_worker.js'),'utf8'),/"digests"/);assert.equal(JSON.parse(await readFile(join(dir,'seo-data/movie-ids-0000.json'),'utf8'))[0],'64');manifest.count=2;await writeFile(join(dir,'data/catalog.json'),JSON.stringify(manifest));await assert.rejects(generateWatchIndex(dir),/count/);manifest.count=1;await writeFile(join(dir,'data/catalog.json'),JSON.stringify(manifest));await writeFile(join(dir,'data',shards[0]),JSON.stringify([{id:'65'}]));await assert.rejects(generateWatchIndex(dir),/Invalid movie ID/)}finally{await rm(dir,{recursive:true,force:true})}
});

test('root serves the prerendered home without altering other SPA paths',async()=>{
 const handler=createWatchHandler({digests:Array(64).fill('unused')});const paths=[];const env={ASSETS:{fetch:async request=>{paths.push({path:new URL(request.url).pathname,method:request.method});return new Response(request.method==='HEAD'?null:'ok')}}};
 await handler(new Request('https://example.com/?source=test'),env);await handler(new Request('https://example.com/',{method:'HEAD'}),env);await handler(new Request('https://example.com/categories'),env);assert.deepEqual(paths,[{path:'/home-prerender',method:'GET'},{path:'/home-prerender',method:'HEAD'},{path:'/categories',method:'GET'}]);
});
