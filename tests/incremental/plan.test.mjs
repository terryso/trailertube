import test from 'node:test';
import assert from 'node:assert/strict';
import {planRefresh, changeWindows} from '../../incremental/plan.mjs';

test('refresh queues preserve adult scope and retry missing or stale data', () => {
 const now=Date.parse('2026-11-03T00:00:00Z');
 const movies=[{id:1},{id:2,adult:true},{id:3},{id:4}];
 const records=new Map([['1',{trailer:null,checkedAt:'2026-10-20T00:00:00Z'}],['2',{trailer:'abc',checkedAt:'2026-11-02T00:00:00Z'}],['3',{trailer:'abc',checkedAt:'bad'}]]);
 const result=planRefresh({movies,records,videos:new Map([['abc',{checkedAt:'2026-10-01T00:00:00Z'}]]),now});
 assert.deepEqual(result,{ordinary:['1','3','4'],adult:[],videoIds:['abc']});
});
test('date windows overlap previous success and split without gaps',()=>{
 assert.deepEqual(changeWindows({lastSuccessfulDate:'2026-10-30',today:'2026-11-03',overlapDays:2,maxDays:3}),[{start:'2026-10-28',end:'2026-10-30'},{start:'2026-10-31',end:'2026-11-02'},{start:'2026-11-03',end:'2026-11-03'}]);
 assert.throws(()=>changeWindows({lastSuccessfulDate:'2026-02-30',today:'2026-11-03'}));
});
test('duplicate IDs fail rather than silently losing updates',()=>assert.throws(()=>planRefresh({movies:[{id:1},{id:1,adult:true}],records:new Map(),videos:new Map()})));
