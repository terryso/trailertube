import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeCatalogSnapshot} from '../../scripts/write-catalog.mjs';
import {readSnapshot,mergeUpdates} from '../../incremental/snapshot.mjs';

test('loads complete snapshot and preserves trailer through metadata update',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-snapshot-'));
 try {const entry={id:'1',adult:false,title:'Old',description:'',createdAt:'2026-01-01',genreIds:[],popularity:0,rating:0,cover:'',poster:'',trailer:'abcdefghijk',previewType:'Trailer',duration:90,views:'20',playable:true,regionRestriction:null,trailerChecked:true};
 await writeCatalogSnapshot({entries:[entry],genres:[],outputDir:dir,start:'2016-11-02',end:'2026-11-03'});
 const source=await readSnapshot(dir,'ordinary');const merged=mergeUpdates({ordinary:source.entries,adult:new Map(),updates:[{id:1,adult:false,title:'New',createdAt:'2026-01-01'}],start:'2016-11-02',end:'2026-11-03'});
 assert.equal(merged.ordinary.get('1').trailer,'abcdefghijk');assert.equal(merged.ordinary.get('1').title,'New');assert.equal(source.entries.get('1').title,'Old');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('moves reclassified titles and removes titles outside window',()=>{
 const ordinary=new Map([['1',{id:'1',title:'Title',trailer:null}],['2',{id:'2',title:'Gone'}]]);
 const merged=mergeUpdates({ordinary,adult:new Map(),updates:[{id:1,adult:true,title:'Title',createdAt:'2026-01-01'},{id:2,adult:false,title:'Gone',createdAt:'2010-01-01'}],start:'2016-11-02',end:'2026-11-03'});
 assert.equal(merged.ordinary.size,0);assert.equal(merged.adult.get('1').adult,true);assert.equal(ordinary.size,2);
});
test('rejects unclassified and duplicate updates',()=>{
 const args={ordinary:new Map(),adult:new Map(),start:'2016-11-02',end:'2026-11-03'};
 assert.throws(()=>mergeUpdates({...args,updates:[{id:1,title:'Title',createdAt:'2026-01-01'}]}));
 const update={id:1,adult:false,title:'Title',createdAt:'2026-01-01'};assert.throws(()=>mergeUpdates({...args,updates:[update,update]}));
});
test('deferred records preserve metadata and respect adult reclassification',()=>{
 const old={id:'1',adult:false,title:'Film',createdAt:'2026-01-01',trailer:'abcdefghijk'};
 const result=mergeUpdates({ordinary:new Map([['1',old]]),adult:new Map(),updates:[{id:'1',adult:true,deferred:true}],start:'2016-11-04',end:'2026-11-04'});
 assert.equal(result.ordinary.size,0);assert.equal(result.adult.get('1').trailer,old.trailer);assert.equal(result.adult.get('1').adult,true);
});
