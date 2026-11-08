import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.location={origin:'https://example.test'};
globalThis.fetch=async url=>{
  const path=String(url).replace(/^https?:\/\/[^/]+/,'');
  try {const value=await fs.readFile('public'+path,'utf8');return {ok:true,json:async()=>JSON.parse(value)}}catch {return {ok:false}}
};
const {api}=await import('../src/catalog.js');
test('static catalog supports search, genre filters, details and pagination',async()=>{
  const config=await api('/api/config');assert.equal(config.configured,true);assert.ok(config.catalog.count>0);
  const genres=await api('/api/categories');const science=genres.categories.find(c=>c.name==='Science Fiction');assert.ok(science);
  const result=await api('/api/videos?q=Project%20Hail%20Mary');assert.ok(result.videos.some(m=>m.title==='Project Hail Mary'));
  const movie=await api('/api/video/687163');assert.equal(movie.video.title,'Project Hail Mary');assert.ok(movie.video.trailer);
  const filtered=await api('/api/videos?category='+science.id);assert.ok(filtered.videos.length);assert.ok(filtered.videos.every(m=>m.genreIds.includes(science.id)));
  await assert.rejects(()=>api('/api/video/does-not-exist'),/not found/i);
});
test('catalog date and oldest sorting use release dates',async()=>{
 const result=await api('/api/videos?sort=old&date=2010s');assert.ok(result.videos.length);assert.ok(result.videos.every(m=>m.createdAt.startsWith('201')));assert.ok(result.videos.every((m,i,a)=>i===0||a[i-1].createdAt<=m.createdAt));
});
test('manifest catalogs load every shard before searching',async()=>{
 const original=globalThis.fetch;
 const fixtures={
  '/data/catalog.json':{complete:false,shards:['part-a.json','part-b.json']},
  '/data/genres.json':[{id:1,name:'Drama'}],
  '/data/part-a.json':[{id:'1',title:'First',createdAt:'2020-01-01',genreIds:['1']}],
  '/data/part-b.json':[{id:'2',title:'Second',createdAt:'2021-01-01',genreIds:['1'],trailer:'U2Qp5pL3ovA'}]
 };
 globalThis.fetch=async url=>({ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]});
 try {const {api:sharded}=await import('../src/catalog.js?shards-test');const config=await sharded('/api/config');assert.equal(config.catalog.count,2);const result=await sharded('/api/videos?q=Second');assert.equal(result.videos[0].id,'2');assert.equal((await sharded('/api/categories')).categories[0].count,1)}finally{globalThis.fetch=original}
});
test('duration filters operate on known playable trailer lengths across the whole catalog',async()=>{
 const known=await api('/api/videos?dur=short');assert.ok(known.videos.length);assert.ok(known.videos.every(m=>typeof m.duration==='number'&&m.duration<240&&m.playable!==false));
 const old=await api('/api/videos?dur=medium&sort=old');assert.ok(old.videos.every(m=>m.duration>=240&&m.duration<1200));
});
test('default browsing shows trailer links and all movies can be selected',async()=>{
 const only=await api('/api/videos');assert.ok(only.videos.length);assert.ok(only.videos.every(x=>x.trailer&&x.playable!==false));
 const all=await api('/api/videos?show=all');assert.ok(all.totalPages>=only.totalPages);
});
test('category groups count unique playable movies and match any grouped genre',async()=>{
 const {categories,groups}=await api('/api/categories');const allGroupIds=groups.flatMap(g=>g.children.map(c=>c.id));assert.equal(new Set(allGroupIds).size,categories.length);
 const group=groups.find(g=>g.name==='Action, Adventure & War');assert.ok(group);const result=await api('/api/videos?category='+encodeURIComponent(group.id));assert.ok(result.videos.length);assert.ok(result.videos.every(m=>m.genreIds.some(id=>group.ids.includes(id))));assert.ok(group.count>=result.videos.length);
});
test('indexed catalogs load the home feed and details without downloading all shards',async()=>{
 const original=globalThis.fetch,calls=[];
 const a={id:'1',title:'First',createdAt:'2021-01-01',genreIds:['1'],trailer:'AAAAAAAAAAA'},b={id:'2',title:'Second',createdAt:'2020-01-01',genreIds:['1'],trailer:'BBBBBBBBBBB'},c={id:'3',title:'Other',createdAt:'2019-01-01',genreIds:['1']};
 const genres=[{id:1,name:'Drama'}];const overview={categories:[{id:'1',name:'Drama',count:2}],groups:[],feedCount:2,durationCount:0,youtubeChecked:0,playableCount:0};
 const fixtures={'/data/catalog.json':{count:3,complete:false,overview,featured:[a,b],shardBy:'id-modulo',shards:['even.json','odd.json']},'/data/genres.json':genres,'/data/even.json':[b],'/data/odd.json':[a,c]};
 globalThis.fetch=async url=>{calls.push(String(url));return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{const {api:lazy}=await import('../src/catalog.js?lazy-test');assert.equal((await lazy('/api/config')).catalog.count,3);assert.equal((await lazy('/api/videos')).videos.length,2);assert.deepEqual(calls.sort(),['/data/catalog.json','/data/genres.json']);assert.equal((await lazy('/api/video/3')).video.title,'Other');assert.ok(calls.includes('/data/odd.json'));assert.ok(!calls.includes('/data/even.json'));assert.equal((await lazy('/api/videos?q=Second')).videos[0].id,'2');assert.ok(calls.includes('/data/even.json'))}finally{globalThis.fetch=original}
});
test('home pagination crosses the featured boundary without duplicates or missing movies',async()=>{
 const original=globalThis.fetch,calls=[];
 const rows=Array.from({length:260},(_,i)=>({id:String(i+1),title:'Movie '+(i+1),createdAt:'2025-01-01',genreIds:['1'],trailer:String(i).padStart(11,'0'),popularity:0})).sort((a,b)=>Number(b.id)-Number(a.id));
 const genres=[{id:1,name:'Drama'}],overview={categories:[],groups:[],feedCount:260,durationCount:0,youtubeChecked:0,playableCount:0};
 const fixtures={'/data/catalog.json':{count:260,complete:false,overview,featured:rows.slice(0,240),shardBy:'id-modulo',shards:['even.json','odd.json']},'/data/genres.json':genres,'/data/even.json':rows.filter(m=>Number(m.id)%2===0).reverse(),'/data/odd.json':rows.filter(m=>Number(m.id)%2===1).reverse()};
 globalThis.fetch=async url=>{calls.push(String(url));return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{const {api:lazy}=await import('../src/catalog.js?pagination-test');const first=[];for(let page=1;page<=5;page++)first.push(...(await lazy('/api/videos?page='+page)).videos.map(m=>m.id));assert.equal(calls.filter(x=>x.endsWith('.json')&&!x.endsWith('catalog.json')&&!x.endsWith('genres.json')).length,0);const sixth=(await lazy('/api/videos?page=6')).videos.map(m=>m.id);assert.deepEqual([...first,...sixth],rows.map(m=>m.id));assert.equal(new Set([...first,...sixth]).size,260)}finally{globalThis.fetch=original}
});
test('trailer searches avoid the full movie catalog and details merge their own state shard',async()=>{
 const original=globalThis.fetch,calls=[];
 const a={id:'1',title:'First',createdAt:'2021-01-01',genreIds:['1'],trailer:'AAAAAAAAAAA',duration:45,playable:true},b={id:'2',title:'Second',createdAt:'2020-01-01',genreIds:['1'],trailer:'BBBBBBBBBBB',duration:60,playable:true},c={id:'3',title:'Other',createdAt:'2019-01-01',genreIds:['1']};
 const staticMovie=({trailer,duration,playable,...movie})=>movie;
 const overview={categories:[{id:'1',name:'Drama',count:2}],groups:[],feedCount:2,durationCount:2,youtubeChecked:2,playableCount:2};
 const fixtures={'/data/catalog.json':{count:3,complete:false,overview,featured:[a],shardBy:'id-modulo-v2',shards:['even.json','odd.json'],stateShards:['even-state.json','odd-state.json'],feedShards:['feed.json']},'/data/genres.json':[{id:1,name:'Drama'}],'/data/even.json':[staticMovie(b)],'/data/odd.json':[staticMovie(a),c],'/data/even-state.json':[{id:'2',trailer:b.trailer,duration:60,playable:true,trailerChecked:true}],'/data/odd-state.json':[{id:'1',trailer:a.trailer,duration:45,playable:true,trailerChecked:true}],'/data/feed.json':[a,b]};
 globalThis.fetch=async url=>{calls.push(String(url));return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{const {api:lazy}=await import('../src/catalog.js?feed-index-test');assert.equal((await lazy('/api/videos?q=Second')).videos[0].id,'2');assert.ok(calls.includes('/data/feed.json'));assert.ok(!calls.includes('/data/even.json'));assert.equal((await lazy('/api/video/3')).video.trailerChecked,false);assert.ok(calls.includes('/data/odd.json')&&calls.includes('/data/odd-state.json'));const all=await lazy('/api/videos?show=all');assert.equal(all.videos.length,3);assert.equal(all.videos.find(m=>m.id==='2').duration,60)}finally{globalThis.fetch=original}
});
test('transient shard errors retry rather than fail the entire catalog',async()=>{
 const original=globalThis.fetch;let attempts=0;
 const movie={id:'1',title:'Retry',createdAt:'2020-01-01',genreIds:[],trailer:'AAAAAAAAAAA'};
 const fixtures={'/data/catalog.json':{complete:false,shards:['part.json']},'/data/genres.json':[],'/data/part.json':[movie]};
 globalThis.fetch=async url=>{if(url==='/data/part.json'&&++attempts<3)return {ok:false,status:500};return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{const {api:lazy}=await import('../src/catalog.js?retry-test');assert.equal((await lazy('/api/videos?q=Retry')).videos[0].id,'1');assert.equal(attempts,3)}finally{globalThis.fetch=original}
});
test('all-movie browsing loads only required ordered card and state shards',async()=>{
 const original=globalThis.fetch,calls=[];const rows=Array.from({length:60},(_,i)=>({id:String(60-i),title:'Movie '+(60-i),createdAt:'2025-01-01',genreIds:['1'],cover:''}));
 const overview={categories:[],groups:[],feedCount:0,durationCount:0,youtubeChecked:0,playableCount:0};const fixtures={'/data/catalog.json':{count:60,complete:false,overview,featured:[],shardBy:'id-modulo-v2',shards:['full.json'],stateShards:['full-state.json'],feedShards:[],browseShards:['browse0.json','browse1.json','browse2.json'],browseStateShards:['browse-state0.json','browse-state1.json','browse-state2.json'],browseShardSize:25},'/data/genres.json':[{id:1,name:'Drama'}],'/data/full.json':rows,'/data/full-state.json':[]};
 for(let i=0;i<3;i++){fixtures[`/data/browse${i}.json`]=rows.slice(i*25,i*25+25);fixtures[`/data/browse-state${i}.json`]=i===0?[{id:'60',trailer:'AAAAAAAAAAA',duration:60,playable:true,trailerChecked:true}]:[]}
 globalThis.fetch=async url=>{calls.push(String(url));return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{const {api:lazy}=await import('../src/catalog.js?browse-index-test');const first=await lazy('/api/videos?show=all&page=1');assert.equal(first.videos.length,48);assert.equal(first.videos[0].id,'60');assert.equal(first.videos[0].duration,60);assert.ok(!calls.includes('/data/browse2.json'));assert.ok(!calls.includes('/data/full.json'));const second=await lazy('/api/videos?show=all&page=2');assert.deepEqual([...first.videos,...second.videos].map(x=>x.id),rows.map(x=>x.id));assert.ok(calls.includes('/data/browse2.json'))}finally{globalThis.fetch=original}
});
test('search ranks exact and prefix title matches ahead of description matches',async()=>{
 const original=globalThis.fetch;
 const movies=[{id:'1',title:'Unrelated',description:'A dune is crossed',createdAt:'2026-01-01',genreIds:[],trailer:'AAAAAAAAAAA'},{id:'2',title:'Dunes Only',description:'',createdAt:'2026-01-01',genreIds:[],trailer:'BBBBBBBBBBB'},{id:'3',title:'Dune: Part Two',description:'',createdAt:'2024-01-01',genreIds:[],trailer:'CCCCCCCCCCC'},{id:'4',title:'Dune',description:'',createdAt:'2021-01-01',genreIds:[],trailer:'DDDDDDDDDDD'}];
 const fixtures={'/data/catalog.json':{movies,complete:false},'/data/genres.json':[]};globalThis.fetch=async url=>({ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]});
 try{const {api:search}=await import('../src/catalog.js?ranking-test');const result=await search('/api/videos?q=Dune&show=all');assert.deepEqual(result.videos.map(x=>x.id),['4','3','2','1'])}finally{globalThis.fetch=original}
});
test('uncategorized videos remain filterable and use the actual trailer thumbnail when artwork is absent',async()=>{
 const original=globalThis.fetch,movie={id:'1',title:'Fixture',description:'',createdAt:'2024-01-01',genreIds:[],cover:'',poster:'',trailer:'U2Qp5pL3ovA',playable:true},fixtures={'/data/catalog.json':{movies:[movie],complete:false},'/data/genres.json':[]};globalThis.fetch=async url=>({ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]});
 try{const {api:catalog}=await import('../src/catalog.js?uncategorized-test');const cats=await catalog('/api/categories');assert.equal(cats.categories.find(c=>c.id==='uncategorized').count,1);const result=await catalog('/api/videos?category=uncategorized');assert.equal(result.videos[0].id,'1');assert.equal(result.videos[0].cover,'https://i.ytimg.com/vi/U2Qp5pL3ovA/hqdefault.jpg')}finally{globalThis.fetch=original}
});
test('saved-video refresh returns current trailer metadata without a full-catalog scan',async()=>{
 const original=globalThis.fetch,calls=[],movie={id:'1',title:'Fixture',createdAt:'2024-01-01',genreIds:[],trailer:'AAAAAAAAAAA',views:'1234'},overview={categories:[],groups:[],feedCount:1,durationCount:0,youtubeChecked:1,playableCount:1},fixtures={'/data/catalog.json':{count:1,overview,featured:[movie],feedShards:['feed.json'],shards:['full.json']},'/data/genres.json':[],'/data/feed.json':[movie],'/data/full.json':[movie]};
 globalThis.fetch=async url=>{calls.push(String(url));return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{const {api:catalog}=await import('../src/catalog.js?saved-views-test');const result=await catalog('/api/video-briefs?id=1&id=2');assert.equal(result.videos[0].views,'1234');assert.equal(result.videos.length,1);assert.ok(!calls.includes('/data/full.json'))}finally{globalThis.fetch=original}
});
