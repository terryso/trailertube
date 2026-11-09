import test from 'node:test';
import assert from 'node:assert/strict';
import {access, mkdir, mkdtemp, readdir, rm, utimes, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cleanRetention} from '../../incremental/retention.mjs';

test('retention protects live pointers, recent directories and unknown names', async()=>{
 const projectRoot=await mkdtemp(join(tmpdir(),'trailer-retention-'));
 try {
  const root=join(projectRoot,'.cache/incremental'), runs=join(root,'runs'), ui=join(root,'ui-releases'), adult=join(projectRoot,'.cache/adult-snapshots');
  const old=new Date('2020-01-01'), now=Date.now();
  async function dir(path,age=old){await mkdir(path,{recursive:true});await utimes(path,age,age)}
  await dir(join(runs,'run-live01','data')); await dir(join(runs,'run-live01','adult-data'));
  for(const part of ['data','adult-data']) await writeFile(join(runs,'run-live01',part,'catalog.json'),'{}');
  await utimes(join(runs,'run-live01'),old,old);
  for(const name of ['run-old001','run-old002','run-old003','run-old004']) await dir(join(runs,name));
  await dir(join(runs,'run-recent'),new Date(now)); await dir(join(runs,'do-not-delete'));
  for(const name of ['view-old001','view-old002','view-old003','view-old004']) await dir(join(ui,name));
  for(const name of ['v1-1-1','v2-1-1','v3-1-1','v4-1-1','v5-1-1']) await dir(join(adult,name));
  await writeFile(join(adult,'v1-1-1','catalog.json'),'{}'); await utimes(join(adult,'v1-1-1'),old,old);
  await writeFile(join(adult,'latest.json'),JSON.stringify({version:'v1-1-1'})); await utimes(join(adult,'latest.json'),old,old);
  await writeFile(join(root,'cursor.json'),JSON.stringify({cursor:'2026-11-09',snapshotVersion:'run-live01',deploymentUrl:'https://abcdef12.trailertube.pages.dev',verifiedAt:new Date().toISOString()}));
  const result=await cleanRetention({projectRoot,now});
  assert.ok(result.removed.length>0);
  for(const path of [join(runs,'run-live01'),join(runs,'run-recent'),join(runs,'do-not-delete'),join(adult,'v1-1-1')]) await access(path);
  assert.equal((await readdir(ui)).length,3);
 } finally {await rm(projectRoot,{recursive:true,force:true})}
});

test('pending promotion and an existing lock prevent deletion',async()=>{
 const projectRoot=await mkdtemp(join(tmpdir(),'trailer-retention-')), root=join(projectRoot,'.cache/incremental');
 try {
  await mkdir(root,{recursive:true}); await writeFile(join(root,'promotion-pending.json'),'{}');
  assert.deepEqual(await cleanRetention({projectRoot}),{skipped:'promotion-pending'});
  await mkdir(join(root,'run.lock')); await assert.rejects(cleanRetention({projectRoot}),/owns the lock/);
 } finally {await rm(projectRoot,{recursive:true,force:true})}
});
