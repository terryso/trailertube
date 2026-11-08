import test from 'node:test';import assert from 'node:assert/strict';import {makeCuratedPlaylists} from '../src/curated-playlists.js';
test('genre playlists contain actual available matching movies in popularity order',()=>{
 const movies=[{id:'1',title:'Action',trailer:'AAAAAAAAAAA',playable:true,popularity:3,genreIds:['28']},{id:'2',title:'Sci-fi',trailer:'BBBBBBBBBBB',playable:true,popularity:8,genreIds:['878']},{id:'3',title:'Unavailable',trailer:'CCCCCCCCCCC',playable:false,popularity:20,genreIds:['28']},{id:'4',title:'No trailer',popularity:100,genreIds:['28']}];
 const lists=makeCuratedPlaylists(movies),popular=lists.find(x=>x.id==='popular-trailers'),action=lists.find(x=>x.id==='action-adventure');assert.deepEqual(popular.videos.map(x=>x.id),['2','1']);assert.deepEqual(action.videos.map(x=>x.id),['1']);assert.ok(!lists.some(x=>x.id==='documentary'));
});
test('recently released playlist orders available trailers by movie release date',()=>{
 const movies=[{id:'1',createdAt:'2025-01-01',trailer:'AAAAAAAAAAA',playable:true,popularity:100,genreIds:[]},{id:'2',createdAt:'2026-10-01',trailer:'BBBBBBBBBBB',playable:true,popularity:1,genreIds:[]},{id:'3',createdAt:'2026-11-01',trailer:'CCCCCCCCCCC',playable:false,popularity:500,genreIds:[]}];
 const lists=makeCuratedPlaylists(movies);assert.deepEqual(lists[0].videos.map(x=>x.id),['2','1']);assert.equal(lists[0].id,'recently-released');assert.deepEqual(lists.find(x=>x.id==='popular-trailers').videos.map(x=>x.id),['1','2']);
});
