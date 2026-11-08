import test from 'node:test';import assert from 'node:assert/strict';import {assertPublishedBaseline} from '../../incremental/baseline.mjs';
const manifest={generatedAt:'2026-11-03T15:00:00Z',count:10,checked:10,withTrailer:3,auditGaps:1,complete:false};
test('requires both current production catalogs to match local baseline',async()=>{let n=0;const options={ordinary:{manifest},adult:{manifest},fetcher:async()=>{n++;return {ok:true,json:async()=>manifest}}};await assertPublishedBaseline(options);assert.equal(n,2);await assert.rejects(assertPublishedBaseline({...options,fetcher:async()=>({ok:true,json:async()=>({...manifest,count:11})})}),/differs/)});
test('cannot silently proceed when production is unreachable',async()=>{await assert.rejects(assertPublishedBaseline({ordinary:{manifest},adult:{manifest},retries:0,fetcher:async()=>{throw new Error('network')}}),/network/)});
test('retries transient network errors without accepting mismatched data',async()=>{let count=0;await assertPublishedBaseline({ordinary:{manifest},adult:{manifest},wait:async()=>{},fetcher:async()=>{if(++count===1)throw new Error('temporary');return {ok:true,json:async()=>manifest}}});assert.equal(count,3)});

test('rejects an ordinary snapshot whose incremental page candidates differ',async()=>{
 const manifest={generatedAt:'2026-11-04T00:00:00Z',count:1,checked:1,withTrailer:1,auditGaps:0,complete:false,incrementalPrerenderIds:['12']};
 await assert.rejects(assertPublishedBaseline({ordinary:{manifest},adult:{manifest},retries:0,fetcher:async()=>({ok:true,json:async()=>({...manifest,incrementalPrerenderIds:['13']})})}),/incrementalPrerenderIds/);
});

test('rejects a baseline with a different movie details schema version',async()=>{const manifest={generatedAt:'v1',count:1,checked:1,withTrailer:1,auditGaps:0,complete:false,movieDetailsVersion:1};await assert.rejects(assertPublishedBaseline({ordinary:{manifest},adult:{manifest},retries:0,fetcher:async()=>({ok:true,json:async()=>({...manifest,movieDetailsVersion:undefined})})}),/movieDetailsVersion/)});
