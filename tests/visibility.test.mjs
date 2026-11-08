import test from 'node:test';import assert from 'node:assert/strict';import {visibleMovies,visiblePlaylists} from '../src/visibility.js';
test('adult titles are absent from saved collections and playlist artwork while disabled',()=>{
 const ordinary={id:'1',title:'Ordinary',adult:false,cover:'ordinary.jpg'},adult={id:'2',title:'Synthetic adult fixture',adult:true,cover:'adult.jpg'},list=[{id:'p',name:'My list',videos:[ordinary,adult]}];
 assert.deepEqual(visibleMovies([ordinary,adult],false),[ordinary]);assert.deepEqual(visiblePlaylists(list,false)[0].videos,[ordinary]);assert.equal(list[0].videos.length,2);assert.deepEqual(visiblePlaylists(list,true)[0].videos,[ordinary,adult]);
});
test('separate catalog client is lazy and marks its records as adult',async()=>{
 const original=globalThis.fetch,calls=[],fixtures={'/adult-test/catalog.json':{movies:[{id:'9',title:'Synthetic adult fixture',genreIds:[],createdAt:'2024-01-01',trailer:'AAAAAAAAAAA'}],complete:false},'/adult-test/genres.json':[]};
 globalThis.fetch=async url=>{calls.push(String(url));return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{const {createCatalogClient}=await import('../src/catalog.js?adult-lazy-test');const client=createCatalogClient('/adult-test/',{adult:true});assert.deepEqual(calls,[]);const d=await client('/api/video/9');assert.equal(d.video.title,'Synthetic adult fixture');assert.equal(d.video.adult,true);assert.ok(calls.every(x=>x.startsWith('/adult-test/')))}finally{globalThis.fetch=original}
});
