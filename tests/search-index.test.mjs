import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSearchMovie,decodeSearchMovie,movieSearchRank,rankSuggestions,rankPeople,shouldSuggest,normalizeSearch} from '../src/search-index.js';
import {createCatalogClient} from '../src/catalog.js';

test('search records preserve movie information and original titles',()=>{
 const movie={id:'123',title:'Spirited Away',originalTitle:'千と千尋の神隠し',createdAt:'2001-07-20',genreIds:['16'],cover:'https://image.tmdb.org/t/p/w780/pic.jpg',trailer:'AAAAAAAAAAA',duration:124,views:200,playable:true,trailerChecked:true,popularity:50};
 const result=decodeSearchMovie(encodeSearchMovie(movie));for(const key of Object.keys(movie))assert.deepEqual(result[key],movie[key]);assert.equal(result.description,'');assert.equal(result.poster,'');assert.equal(movieSearchRank(result,'千と千尋の神隠し'),1);assert.equal(movieSearchRank(result,'a unique ending'),-1,'description matching left the index in v2');assert.throws(()=>decodeSearchMovie(['invalid']));assert.throws(()=>decodeSearchMovie(Array.from({length:16},(_,i)=>String(i))),'v1-width records no longer decode');
});
test('suggestions rank titles and originals and support people and international input',()=>{
 const movies=[{title:'Other',originalTitle:'Dune'},{title:'Dune: Part Two'},{title:'Dune'}];assert.deepEqual(rankSuggestions(movies,'dune').map(x=>x.title),['Dune','Other','Dune: Part Two']);assert.equal(shouldSuggest('a'),false);assert.equal(shouldSuggest('千'),true);assert.equal(rankPeople([{name:'Denis Villeneuve'},{name:'Denise'}],'denis')[0].name,'Denis Villeneuve');assert.equal(rankPeople([{name:'Renée'}],'renee')[0].name,'Renée');
});
test('matching snapshot uses search index and stale index falls back to complete feed',async()=>{
 globalThis.location={origin:'https://example.test'};const original=globalThis.fetch;
 const movie={id:'1',title:'Spirited Away',originalTitle:'千と千尋の神隠し',description:'A magical bathhouse',createdAt:'2001-07-20',genreIds:['16'],trailer:'AAAAAAAAAAA',playable:true};
 const fixtures={'/data/catalog.json':{generatedAt:'v1',count:1,overview:{feedCount:1,categories:[],groups:[]},featured:[],feedShards:['feed.json'],shards:['full.json']},'/data/genres.json':[{id:16,name:'Animation'}],'/data/feed.json':[movie],'/data/search-manifest.json':{generatedAt:'v1',version:2,count:1,shards:['search-0000.json']},'/data/search-0000.json':{generatedAt:'v1',version:2,count:1,records:[encodeSearchMovie(movie)]}};
 const calls=[];globalThis.fetch=async url=>{calls.push(url);return {ok:Object.hasOwn(fixtures,url),json:async()=>fixtures[url]}};
 try{let api=createCatalogClient();let results=await api('/api/videos?q='+encodeURIComponent('千と千尋'));assert.equal(results.videos[0].title,movie.title);assert.equal(results.videos[0].createdAt,movie.createdAt);assert.ok(!calls.includes('/data/feed.json'));fixtures['/data/search-manifest.json'].generatedAt='old';calls.length=0;api=createCatalogClient();results=await api('/api/videos?q=bathhouse');assert.equal(results.videos[0].id,'1');assert.ok(calls.includes('/data/feed.json'));fixtures['/data/search-manifest.json'].generatedAt='v1';fixtures['/data/search-0000.json']={generatedAt:'v1',version:2,count:1,records:[]};calls.length=0;api=createCatalogClient();results=await api('/api/videos?q=bathhouse');assert.equal(results.videos[0].id,'1');assert.ok(calls.includes('/data/feed.json'))}finally{globalThis.fetch=original}
});
test('hyphenated titles match space-separated queries and vice versa',()=>{
 const movie={title:'Spider-Man: Brand New Day',originalTitle:'スパイダーマン',description:''};
 assert.equal(movieSearchRank(movie,'spider man'),2,'prefix rank after punctuation folding');
 assert.equal(movieSearchRank(movie,'Spider-Man'),2);
 assert.ok(movieSearchRank(movie,'spider man brand')>=0);
 assert.equal(normalizeSearch('Spider-Man: Brand-New Day'),'spider man brand new day');
 assert.equal(normalizeSearch('千と千尋の神隠し'),'千と千尋の神隠し');
 assert.equal(rankSuggestions([{title:'Spider-Man: Brand New Day',originalTitle:''}],'spider man').length,1);
});
