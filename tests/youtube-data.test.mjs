import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {parseDuration,normalizeVideo,enrichYouTube} from '../scripts/youtube-data.mjs';
test('YouTube duration and embed status use official response fields',()=>{
 assert.equal(parseDuration('PT2M39S'),159);assert.equal(parseDuration('P1DT2H'),93600);assert.equal(parseDuration('nonsense'),null);
 assert.deepEqual(normalizeVideo({status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT2M39S'}}),{available:true,duration:159,regionRestriction:null,privacyStatus:'public',views:null});
 assert.equal(normalizeVideo({status:{privacyStatus:'unlisted',embeddable:true}}).available,true);assert.equal(normalizeVideo({status:{privacyStatus:'public',embeddable:true},contentDetails:{regionRestriction:{allowed:[]}}}).available,false);assert.equal(normalizeVideo({status:{privacyStatus:'public',embeddable:true},contentDetails:{regionRestriction:{blocked:[]}}}).available,true);assert.equal(normalizeVideo({status:{privacyStatus:'private',embeddable:true}}).available,false);assert.equal(normalizeVideo(null).available,false);
});
test('YouTube metadata lookups batch, deduplicate and resume',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'trailertube-yt-')),cachePath=path.join(dir,'cache.jsonl'),ids=Array.from({length:51},(_,i)=>String(i).padStart(11,'0'));let calls=0;
 const fetcher=async url=>{calls++;let requested=new URL(url).searchParams.get('id').split(',');return {ok:true,json:async()=>({items:requested.map(id=>({id,status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT30S'}}))})}};
 try{let result=await enrichYouTube([...ids,ids[0]],{key:'test',cachePath,fetcher});assert.equal(calls,2);assert.equal(result.size,51);assert.equal(result.get(ids[0]).duration,30);await enrichYouTube(ids,{key:'test',cachePath,fetcher});assert.equal(calls,2);assert.equal((await readFile(cachePath,'utf8')).trim().split('\n').length,51)}finally{await rm(dir,{recursive:true,force:true})}
});

test('previously rejected videos are rechecked once when privacy metadata was missing',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'trailertube-privacy-')),cachePath=path.join(dir,'cache.jsonl'),id='AAAAAAAAAAA';
 await writeFile(cachePath,JSON.stringify({id,available:false,duration:45})+'\n');let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({items:[{id,status:{privacyStatus:'unlisted',embeddable:true},contentDetails:{duration:'PT45S'}}]})}};
 try{const result=await enrichYouTube([id],{key:'test',cachePath,fetcher});assert.equal(result.get(id).available,true);assert.equal(result.get(id).privacyStatus,'unlisted');await enrichYouTube([id],{key:'test',cachePath,fetcher});assert.equal(calls,1)}finally{await rm(dir,{recursive:true,force:true})}
});
test('expired YouTube metadata is discarded and refreshed instead of reused',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'trailertube-expiry-')),cachePath=path.join(dir,'cache.jsonl'),id='AAAAAAAAAAA',now=Date.parse('2026-11-03T00:00:00Z');
 await writeFile(cachePath,JSON.stringify({id,available:true,duration:30,checkedAt:'2026-10-01T00:00:00Z'})+'\n');let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({items:[{id,status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT45S'}}]})}};
 try{const result=await enrichYouTube([id],{key:'test',cachePath,fetcher,now});assert.equal(calls,1);assert.equal(result.get(id).duration,45);const content=await readFile(cachePath,'utf8');assert.ok(!content.includes('2026-10-01'));assert.ok(content.includes('2026-11-03'))}finally{await rm(dir,{recursive:true,force:true})}
});
