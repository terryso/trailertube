import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWatchHandler} from '../edge/watch-status.mjs';
import {generateWatchIndex} from '../scripts/generate-watch-index.mjs';

const digest=s=>createHash('sha256').update(s).digest('hex');
const template='<html><head><meta name="description" content="Home"/><title>Home</title></head><body><div id="root"></div></body></html>';
const eligibleMovie=id=>({id:String(id),title:'Edge Film',description:'SSR synopsis.',createdAt:'2026-02-03',genreIds:['28'],cover:'https://image.tmdb.org/t/p/w780/x.jpg',trailer:'abcdefghijk',trailerChecked:true,playable:true});

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
 try{
  await mkdir(join(dir,'data'));const shards=Array.from({length:64},(_,i)=>`catalog-${String(i).padStart(4,'0')}.json`);
  for(let i=0;i<64;i++)await writeFile(join(dir,'data',shards[i]),JSON.stringify(i===0?[{id:'64'}]:[]));
  await writeFile(join(dir,'data/catalog.json'),JSON.stringify({shardBy:'id-modulo-v2',shards,count:1}));
  const details=Array.from({length:64},(_,i)=>`feed-details-${String(i).padStart(4,'0')}.json`);
  for(let i=0;i<64;i++)await writeFile(join(dir,'data',details[i]),JSON.stringify(i===0?[eligibleMovie(64)]:[]));
  await writeFile(join(dir,'data/feed-details-manifest.json'),JSON.stringify({version:1,shards:details,count:1}));
  await writeFile(join(dir,'data/genres.json'),JSON.stringify([{id:'28',name:'Action'}]));
  await writeFile(join(dir,'index.html'),template);
  assert.deepEqual(await generateWatchIndex(dir),{movies:1,shards:64,renderShards:256,rendered:1,prerendered:0});
  assert.equal(JSON.parse(await readFile(join(dir,'seo-data/movie-ids-0000.json'),'utf8'))[0],'64');
  assert.equal(JSON.parse(await readFile(join(dir,'seo-data/render-0064.json'),'utf8'))[0].id,'64');
  const worker=await readFile(join(dir,'_worker.js'),'utf8');
  assert.match(worker,/"digests"/);assert.match(worker,/"renderShards":256/);assert.match(worker,/"renderVersion":"/);assert.match(worker,/"prerenderedIds":\[\]/);
  await mkdir(join(dir,'watch'));await writeFile(join(dir,'watch/64.html'),template);
  assert.deepEqual(await generateWatchIndex(dir),{movies:1,shards:64,renderShards:256,rendered:1,prerendered:1});
  assert.match(await readFile(join(dir,'_worker.js'),'utf8'),/"prerenderedIds":\["64"\]/);
  const manifest=JSON.parse(await readFile(join(dir,'data/catalog.json'),'utf8'));manifest.count=2;await writeFile(join(dir,'data/catalog.json'),JSON.stringify(manifest));
  await assert.rejects(generateWatchIndex(dir),/count/);
  manifest.count=1;await writeFile(join(dir,'data/catalog.json'),JSON.stringify(manifest));
  await writeFile(join(dir,'data',shards[0]),JSON.stringify([{id:'65'}]));
  await assert.rejects(generateWatchIndex(dir),/Invalid movie ID/);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('root serves the prerendered home without altering other SPA paths',async()=>{
 const handler=createWatchHandler({digests:Array(64).fill('unused')});const paths=[];const env={ASSETS:{fetch:async request=>{paths.push({path:new URL(request.url).pathname,method:request.method});return new Response(request.method==='HEAD'?null:'ok')}}};
 await handler(new Request('https://example.com/?source=test'),env);await handler(new Request('https://example.com/',{method:'HEAD'}),env);await handler(new Request('https://example.com/categories'),env);assert.deepEqual(paths,[{path:'/home-prerender',method:'GET'},{path:'/home-prerender',method:'HEAD'},{path:'/categories',method:'GET'}]);
});

test('edge rendering serves verified movies, keeps static pages fast and noindexes the rest',async()=>{
 const index=JSON.stringify(['123','124','200']),renderShard=JSON.stringify([eligibleMovie(123)]),emptyShard=JSON.stringify([]);
 const renderDigests=Array(256).fill('0'.repeat(64));renderDigests[123]=digest(renderShard);renderDigests[124]=digest(emptyShard);
 const config={digests:Array(64).fill(digest(index)),renderShards:256,renderDigests,prerenderedIds:['200'],genres:[{id:'28',name:'Action'}],origin:'https://trailer.terryso.dev',renderVersion:'v1'};
 const seen=[];
 const env={ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;seen.push(path);
  if(path.startsWith('/seo-data/movie-ids-'))return new Response(index,{headers:{'content-type':'application/json'}});
  if(path==='/seo-data/render-0124.json')return new Response(emptyShard,{headers:{'content-type':'application/json'}});
  if(path==='/seo-data/render-0123.json')return new Response(renderShard,{headers:{'content-type':'application/json'}});
  if(path==='/index.html')return new Response(template,{headers:{'content-type':'text/html'}});
  if(path==='/watch/200')return new Response('<title>Static page</title>',{headers:{'content-type':'text/html'}});
  return new Response('missing',{status:404});
 }}};
 const handler=createWatchHandler(config);
 let r=await handler(new Request('https://example.com/watch/123'),env);
 assert.equal(r.status,200);assert.match(r.headers.get('cache-control')||'',/public, max-age=3600/);
 const html=await r.text();
 assert.match(html,/<title>Edge Film - TrailerTube<\/title>/);
 assert.match(html,/<link rel="canonical" href="https:\/\/trailer\.terryso\.dev\/watch\/123"/);
 assert.match(html,/property="og:url" content="https:\/\/trailer\.terryso\.dev\/watch\/123"/);
 assert.match(html,/Explore more: <a href="\/browse\?category=28">Action trailers<\/a>/);
 assert.doesNotMatch(html,/VideoObject/);
 r=await handler(new Request('https://example.com/watch/123',{method:'HEAD'}),env);assert.equal(r.status,200);assert.equal(await r.text(),'');
 r=await handler(new Request('https://example.com/watch/200'),env);assert.equal(r.status,200);assert.match(await r.text(),/Static page/);
 r=await handler(new Request('https://example.com/watch/124'),env);assert.equal(r.status,200);assert.match(await r.text(),/<meta name="robots" content="noindex">/);assert.match(r.headers.get('cache-control')||'',/no-store/);
 const badRender=createWatchHandler({...config,renderDigests:Array(256).fill('0'.repeat(64))});
 r=await badRender(new Request('https://example.com/watch/123'),env);assert.equal(r.status,503);
 assert.ok(seen.includes('/index.html'));
});

test('edge-rendered pages are stored in and served from the versioned edge cache',async()=>{
 const index=JSON.stringify(['123']),renderShard=JSON.stringify([eligibleMovie(123)]);
 const renderDigests=Array(256).fill('0'.repeat(64));renderDigests[123]=digest(renderShard);
 const config={digests:Array(64).fill(digest(index)),renderShards:256,renderDigests,prerenderedIds:[],genres:[],origin:'https://trailer.terryso.dev',renderVersion:'cache-v1'};
 const env={ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;
  if(path.startsWith('/seo-data/movie-ids-'))return new Response(index,{headers:{'content-type':'application/json'}});
  if(path==='/seo-data/render-0123.json')return new Response(renderShard,{headers:{'content-type':'application/json'}});
  if(path==='/index.html')return new Response(template,{headers:{'content-type':'text/html'}});
  return new Response('missing',{status:404});
 }}};
 const stored=new Map();let put=0;
 globalThis.caches={default:{match:async key=>stored.get(String(new URL(key.url).pathname)),put:async(key,response)=>{put++;stored.set(String(new URL(key.url).pathname),response)}}};
 try{
  const handler=createWatchHandler(config);const ctx={waitUntil:p=>p.catch(()=>{})};
  const first=await handler(new Request('https://example.com/watch/123'),env,ctx);
  assert.equal(first.status,200);assert.equal(put,1);
  assert.equal([...stored.keys()][0],'/__render/cache-v1/watch/123');
  const second=await handler(new Request('https://example.com/watch/123'),env,ctx);
  assert.equal(second.status,200);assert.match(await second.text(),/Edge Film/);assert.equal(put,1);
 }finally{delete globalThis.caches}
});
