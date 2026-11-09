import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchChangedMovies} from '../../incremental/changes.mjs';

test('collects all pages and deduplicates IDs over overlapping windows',async()=>{
 const calls=[];const request=async(path,params)=>{calls.push([path,params]);return {page:params.page,total_pages:2,total_results:2,results:params.page===1?[{id:12}]:[{id:12},{id:34}]}};
 const value=await fetchChangedMovies({lastSuccessfulDate:'2026-10-20',today:'2026-11-04',request});
 assert.deepEqual(value.ids,[12,34]);assert.equal(value.nextCursor,'2026-11-04');assert.equal(value.windows.length,2);assert.equal(calls.length,4);
});
test('failure or pagination limit rejects the entire change batch',async()=>{
 await assert.rejects(fetchChangedMovies({lastSuccessfulDate:'2026-11-03',today:'2026-11-04',request:async()=>({page:1,total_pages:501,total_results:10001,results:[]})}));
 await assert.rejects(fetchChangedMovies({lastSuccessfulDate:'2026-11-03',today:'2026-11-04',request:async(_p,{page})=>{if(page===2)throw new Error('network');return {page:1,total_pages:2,total_results:21,results:[{id:1}]}}}));
});
test('oversized date ranges split until every day is retrieved',async()=>{
 const request=async(_p,p)=>p.start_date===p.end_date?{page:1,total_pages:1,total_results:1,results:[{id:Number(p.start_date.slice(-2))}]}:{page:1,total_pages:501,total_results:50001,results:[]};
 const result=await fetchChangedMovies({lastSuccessfulDate:'2026-11-03',today:'2026-11-04',overlapDays:0,request});
 assert.deepEqual(result.ids,[3,4]);
});
test('stale page totals expand the range but never accept missing distinct IDs',async()=>{
 const request=async(_p,p)=>p.page===1?{page:1,total_pages:1,total_results:1,results:[{id:1}]}:{page:2,total_pages:2,total_results:2,results:[{id:2}]};
 let calls=0;const growing=async(path,p)=>{calls++;if(p.page===1)return {page:1,total_pages:2,total_results:1,results:[{id:1}]};return request(path,p)};
 const out=await fetchChangedMovies({lastSuccessfulDate:'2026-11-03',today:'2026-11-03',overlapDays:0,request:growing});assert.deepEqual(out.ids,[1,2]);assert.equal(calls,2);
 await assert.rejects(fetchChangedMovies({lastSuccessfulDate:'2026-11-03',today:'2026-11-03',overlapDays:0,request:async(_p,p)=>({page:p.page,total_pages:2,total_results:3,results:[{id:1}]})}),/omitted or repeated/);
});
test('reconciles incomplete multi-day pages using independently complete day windows',async()=>{
 const request=async(_p,p)=>p.start_date!==p.end_date?{page:p.page,total_pages:1,total_results:3,results:[{id:1},{id:2}]}:{page:p.page,total_pages:1,total_results:2,results:p.start_date.endsWith('03')?[{id:1},{id:3}]:[{id:2},{id:4}]};
 const result=await fetchChangedMovies({lastSuccessfulDate:'2026-11-03',today:'2026-11-04',overlapDays:0,request});assert.deepEqual(new Set(result.ids),new Set([1,2,3,4]));
});
