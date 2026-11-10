import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {refreshWatchProviders} from '../scripts/refresh-watch-providers.mjs';

test('watch providers refresh writes bounded homepage availability and skips without a key',async()=>{const root=await mkdtemp(join(tmpdir(),'watch-providers-'));try{
 const dir=join(root,'data');await mkdir(dir);
 const movie={id:'354912',title:'Coco',createdAt:'2026-01-01',genreIds:[],trailer:'AAAAAAAAAAA',playable:true};
 await writeFile(join(dir,'catalog.json'),JSON.stringify({generatedAt:'v1',featured:[movie]}));
 await writeFile(join(dir,'fast-lists.json'),JSON.stringify({generatedAt:'v1',playlists:[{id:'popular-trailers',videos:[{id:'354912'}]}]}));
 const skipped=await refreshWatchProviders(root,{apiKey:''});
 assert.deepEqual(skipped,{skipped:true,reason:'no-tmdb-api-key'});
 const requested=[];
 const result=await refreshWatchProviders(root,{apiKey:'k',request:async path=>{requested.push(path);return {id:Number(path.split('/')[2]),results:{US:{link:'https://www.themoviedb.org/movie/354912/watch',flatrate:[{provider_name:'Netflix'}]}}}}});
 assert.deepEqual(result,{movies:1});
 assert.deepEqual(requested,['/movie/354912/watch/providers']);
 const written=JSON.parse(await readFile(join(dir,'watch-providers.json')));
 assert.equal(written.movies['354912'].US.flatrate[0].provider_name,'Netflix');assert.ok(written.updatedAt);
 await assert.rejects(refreshWatchProviders(root,{apiKey:'k',request:async()=>({id:'wrong'})}),/Invalid response/);
 const mismatch=await mkdtemp(join(tmpdir(),'watch-mismatch-'));try{await mkdir(join(mismatch,'data'));await writeFile(join(mismatch,'data/catalog.json'),JSON.stringify({generatedAt:'a',featured:[]}));await writeFile(join(mismatch,'data/fast-lists.json'),JSON.stringify({generatedAt:'b',playlists:[]}));await assert.rejects(refreshWatchProviders(mismatch,{apiKey:'k',request:async()=>({})}),/Mismatched snapshots/)}finally{await rm(mismatch,{recursive:true,force:true})}
}finally{await rm(root,{recursive:true,force:true})}});
