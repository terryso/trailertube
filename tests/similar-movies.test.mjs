import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {recommendMovies} from '../src/similar-movies.js';
import {generateSimilarMovies} from '../scripts/generate-similar-movies.mjs';
const categories=[{id:'1',name:'Science Fiction'},{id:'2',name:'Adventure'}];
const movie=(id,genreIds,extra={})=>({id:String(id),title:'Movie '+id,createdAt:'2025-01-01',genreIds,trailer:'AAAAAAAAAAA',playable:true,popularity:5,...extra});
test('recommends matching genres, explains why, prioritizes stronger and playable matches',()=>{
 const current=movie(1,['1','2']);const index={movies:[current,movie(2,['1']),movie(3,['1','2']),movie(4,['2'],{playable:false}),movie(5,['9']),movie(6,['1','2'],{playable:null}),movie(7,['1','2'],{adult:true})]};
 const result=recommendMovies(current,index,categories);assert.deepEqual(result.map(x=>x.movie.id),['3','6','2']);assert.equal(result[0].reason,'Also Science Fiction');assert.equal(recommendMovies({...current,genreIds:[]},index,categories).length,0);assert.equal(recommendMovies(current,index,categories,1).length,1);
});
test('builds bounded versioned candidates from playable feed and rejects incomplete snapshots',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tt-similar-'));const data=join(dir,'data');await mkdir(data);const save=(name,x)=>writeFile(join(data,name),JSON.stringify(x));
 try{const movies=[movie(1,['1'],{popularity:3}),movie(2,['2'],{popularity:4})];await save('catalog.json',{generatedAt:'v1',feedShards:['feed-0000.json'],overview:{feedCount:2}});await save('feed-0000.json',movies);assert.deepEqual(await generateSimilarMovies(dir),{movies:2,genres:2});const index=JSON.parse(await readFile(join(data,'similar-movies.json'),'utf8'));assert.equal(index.generatedAt,'v1');assert.deepEqual(index.movies.map(x=>x.id),['2','1']);await save('feed-0000.json',[movies[0],movies[0]]);await assert.rejects(generateSimilarMovies(dir),/Invalid recommendation movie/);await save('feed-0000.json',[movies[0]]);await assert.rejects(generateSimilarMovies(dir),/count mismatch/)}finally{await rm(dir,{recursive:true,force:true})}
});
