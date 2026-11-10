import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {generateFeedDetails} from '../scripts/generate-feed-details.mjs';

const shards=Array.from({length:64},(_,i)=>`catalog-${String(i).padStart(4,'0')}.json`),stateShards=Array.from({length:64},(_,i)=>`state-${String(i).padStart(4,'0')}.json`);
async function stage(){const root=await mkdtemp(join(tmpdir(),'feed-details-')),dir=join(root,'data');await mkdir(dir);return {root,dir,write:async(name,value)=>writeFile(join(dir,name),JSON.stringify(value))}}

test('feed details merge credit, playback and variant fields for feed movies only',async()=>{const {root,dir,write}=await stage();try{
 const variant={key:'BBBBBBBBBBB',name:'Teaser',type:'Teaser',available:true,privacyStatus:'public',verifiedAt:'2026-11-09T00:00:00Z'};
 await write('catalog.json',{generatedAt:'v1',movieDetailsVersion:1,shardBy:'id-modulo-v2',shards,stateShards,feedShards:['feed-0000.json']});
 await write('feed-0000.json',[{id:'8',title:'Credited',createdAt:'2026-01-01',genreIds:[],trailer:'AAAAAAAAAAA',previewType:'Trailer',duration:120,views:5,playable:true,regionRestriction:null,trailerChecked:true},{id:'15',title:'Variant film',createdAt:'2026-02-01',genreIds:[],trailer:'BBBBBBBBBBB',previewType:'Teaser',duration:60,views:null,playable:true,regionRestriction:null,trailerChecked:true}]);
 for(let i=0;i<64;i++){await write(shards[i],[]);await write(stateShards[i],[])}
 await writeFile(join(dir,shards[8]),JSON.stringify([{id:'8',title:'Credited',description:'Story',createdAt:'2026-01-01',genreIds:[],popularity:9,rating:7.5,cover:'',poster:'',runtimeMinutes:125,creditsSource:'tmdb',creditsTracked:true,directors:[{id:2,name:'Director'}],cast:[{id:3,name:'Actor',character:'Hero'}]}]));
 await writeFile(join(dir,shards[15]),JSON.stringify([{id:'15',title:'Variant film',description:'Tale',createdAt:'2026-02-01',genreIds:[],popularity:4,rating:0,cover:'',poster:''}]));
 await writeFile(join(dir,stateShards[15]),JSON.stringify([{id:'15',trailer:'BBBBBBBBBBB',previewType:'Teaser',duration:60,views:null,playable:true,regionRestriction:null,trailerChecked:true,trailerVariantsTracked:true,trailerVariants:[variant]}]));
 const result=await generateFeedDetails(root);
 assert.deepEqual(result,{movies:2,shards:64});
 const manifest=JSON.parse(await readFile(join(dir,'feed-details-manifest.json')));
 assert.equal(manifest.version,1);assert.equal(manifest.generatedAt,'v1');assert.equal(manifest.count,2);assert.deepEqual(manifest.shards,shards.map((_,i)=>`feed-details-${String(i).padStart(4,'0')}.json`));
 assert.deepEqual(manifest.samples,[8,15]);
 const credited=JSON.parse(await readFile(join(dir,'feed-details-0008.json')));
 assert.deepEqual(credited,[{id:'8',title:'Credited',description:'Story',createdAt:'2026-01-01',genreIds:[],popularity:9,rating:7.5,cover:'',poster:'',runtimeMinutes:125,creditsSource:'tmdb',creditsTracked:true,directors:[{id:2,name:'Director'}],cast:[{id:3,name:'Actor',character:'Hero'}],trailer:'AAAAAAAAAAA',previewType:'Trailer',duration:120,views:5,playable:true,regionRestriction:null,trailerChecked:true}]);
 const variantFilm=JSON.parse(await readFile(join(dir,'feed-details-0015.json')));
 assert.equal(variantFilm[0].trailerVariantsTracked,true);assert.deepEqual(variantFilm[0].trailerVariants,[variant]);assert.equal(Object.hasOwn(variantFilm[0],'creditsSource'),false);
 for(const i of [0,1,63])assert.deepEqual(JSON.parse(await readFile(join(dir,`feed-details-${String(i).padStart(4,'0')}.json`))),[]);
}finally{await rm(root,{recursive:true,force:true})}});

test('feed details reject incomplete snapshots and misplaced movies',async()=>{const {root,dir,write}=await stage();try{
 await write('catalog.json',{generatedAt:'v1',shardBy:'id-modulo-v2',shards,stateShards,feedShards:['feed-0000.json']});
 await write('feed-0000.json',[{id:'8',title:'Film',createdAt:'2026-01-01',genreIds:[],trailer:'AAAAAAAAAAA',playable:true,trailerChecked:true}]);
 for(let i=0;i<64;i++){await write(shards[i],[]);await write(stateShards[i],[])}
 await assert.rejects(generateFeedDetails(root),/missing from detail shards/);
 await writeFile(join(dir,shards[9]),JSON.stringify([{id:'8',title:'Film',createdAt:'2026-01-01',genreIds:[]}]));
 await assert.rejects(generateFeedDetails(root),/wrong feed details bucket/);
 await writeFile(join(dir,'feed-0000.bad'),[]);await writeFile(join(dir,'catalog.json'),JSON.stringify({generatedAt:'v1',shardBy:'id-modulo-v2',shards,stateShards,feedShards:['feed-0000.bad']}));
 await assert.rejects(generateFeedDetails(root),/Invalid feed shard/);
}finally{await rm(root,{recursive:true,force:true})}});
