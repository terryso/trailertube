import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {submitIndexNow} from '../scripts/submit-indexnow.mjs';

test('submits hub, playlist and watch URLs with the site key',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-indexnow-'));
 try{
  await writeFile(join(dir,'1b75934a1d5ca36c98a59a0468fa6ed6.txt'),'1b75934a1d5ca36c98a59a0468fa6ed6');
  await mkdir(join(dir,'p'));await writeFile(join(dir,'p','popular-trailers.html'),'<html></html>');
  await mkdir(join(dir,'watch'));await writeFile(join(dir,'watch','123.html'),'<html></html>');await writeFile(join(dir,'watch','skip.txt'),'x');
  let payload=null;
  const result=await submitIndexNow(dir,{fetcher:async(url,init)=>{payload=JSON.parse(init.body);return new Response(null,{status:202})}});
  assert.deepEqual(result,{submitted:6,status:202});
  assert.equal(payload.key,'1b75934a1d5ca36c98a59a0468fa6ed6');
  assert.equal(payload.keyLocation,'https://trailer.terryso.dev/1b75934a1d5ca36c98a59a0468fa6ed6.txt');
  assert.ok(payload.urlList.includes('https://trailer.terryso.dev/p/popular-trailers'));
  assert.ok(payload.urlList.includes('https://trailer.terryso.dev/watch/123'));
  assert.ok(!payload.urlList.some(u=>u.endsWith('/skip')));
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('rejects a missing key file or a non-accepting endpoint',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-indexnow-'));
 try{await assert.rejects(submitIndexNow(dir,{fetcher:async()=>new Response(null,{status:200})}),/key file/)}finally{await rm(dir,{recursive:true,force:true})}
 const dir2=await mkdtemp(join(tmpdir(),'trailertube-indexnow-'));
 try{
  await writeFile(join(dir2,'1b75934a1d5ca36c98a59a0468fa6ed6.txt'),'1b75934a1d5ca36c98a59a0468fa6ed6');
  await assert.rejects(submitIndexNow(dir2,{fetcher:async()=>new Response('nope',{status:422})}),/422/);
 }finally{await rm(dir2,{recursive:true,force:true})}
});
