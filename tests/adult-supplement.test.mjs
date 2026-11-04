import test from 'node:test';import assert from 'node:assert/strict';import {partitionSupplement} from '../scripts/adult-supplement.mjs';
test('supplemental records are separated by explicit source flag without exposing unknowns',()=>{
 const a={id:1,adult:true},b={id:2,adult:false},unknown={id:3};const result=partitionSupplement([a,b,unknown]);assert.deepEqual(result.adult,[a]);assert.deepEqual(result.ordinary,[b]);assert.deepEqual(result.unknown,[unknown]);
});
test('later adult classification removes a movie from the ordinary catalog',async()=>{
 const {mergeOrdinarySupplement}=await import('../scripts/adult-supplement.mjs');const movies=new Map([[1,{id:1,adult:false}],[2,{id:2,adult:false}]]),supplement={adult:[{id:1,adult:true}],ordinary:[{id:1,adult:false},{id:3,adult:false}]};const result=mergeOrdinarySupplement(movies,supplement);assert.deepEqual(result.removed,[1]);assert.deepEqual(result.added.map(x=>x.id),[3]);assert.deepEqual([...movies.keys()],[2,3]);
});
test('a source count gap is resolved only when distinct ordinary records fill it',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {reconcileOrdinaryGaps}=await import('../scripts/adult-supplement.mjs');const dir=await mkdtemp(path.join(os.tmpdir(),'catalog-gaps-'));
 try{await writeFile(path.join(dir,'day-2025-01-01.json'),JSON.stringify({items:[{id:1},{id:2}]}));const gaps=[{date:'2025-01-01',expected:3,actual:2}],extra=[{id:3,adult:false,release_date:'2025-01-01'}];let result=await reconcileOrdinaryGaps(dir,gaps,extra,new Map([[1,{}],[2,{}],[3,{}]]));assert.equal(result.remaining.length,0);assert.equal(result.resolved[0].additionalOrdinary,1);result=await reconcileOrdinaryGaps(dir,gaps,extra,new Map([[1,{}],[2,{}]]));assert.equal(result.remaining.length,1);assert.equal(result.resolved.length,0)}finally{await rm(dir,{recursive:true,force:true})}
});
