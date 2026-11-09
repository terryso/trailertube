import {access, lstat, readdir, readFile, rm, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {readCursor, withRunLock} from './state.mjs';

// Only old, recognized directories are candidates. Keep a small history as
// well as the live cursor and the adult snapshot selected by latest.json.
export async function cleanRetention({projectRoot, now=Date.now(), minAgeMs=24*60*60*1000, keep=3}={}) {
 const root=resolve(projectRoot, '.cache/incremental');
 return withRunLock(root, async()=>{
  try { await access(join(root,'promotion-pending.json')); return {skipped:'promotion-pending'}; }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const state=await readCursor(root);
  if(!/^run-[a-zA-Z0-9]+$/.test(state?.snapshotVersion||'')) throw new Error('A valid current snapshot is required for retention');
  const current=join(root,'runs',state.snapshotVersion);
  for(const part of ['data/catalog.json','adult-data/catalog.json']) await access(join(current,part));
  const removed=[];
  async function prune(parent, pattern, protectedNames=[]) {
   let entries; try { entries=await readdir(parent,{withFileTypes:true}); } catch(e) { if(e.code==='ENOENT') return; throw e; }
   const candidates=[];
   for(const entry of entries) if(entry.isDirectory() && pattern.test(entry.name)) {
    const path=join(parent,entry.name), info=await lstat(path);
    if(info.isDirectory()&&!info.isSymbolicLink()) candidates.push({name:entry.name,path,mtime:info.mtimeMs});
   }
   candidates.sort((a,b)=>b.mtime-a.mtime||a.name.localeCompare(b.name));
   const protectedSet=new Set([...protectedNames,...candidates.slice(0,keep).map(x=>x.name)]);
   for(const item of candidates) if(!protectedSet.has(item.name)&&now-item.mtime>=minAgeMs) {
    await rm(item.path,{recursive:true}); removed.push(item.path);
   }
  }
  await prune(join(root,'runs'),/^run-[a-zA-Z0-9]+$/,[state.snapshotVersion]);
  await prune(join(root,'ui-releases'),/^[a-zA-Z0-9][a-zA-Z0-9-]*-[a-zA-Z0-9]{6}$/);
  const adult=resolve(projectRoot,'.cache/adult-snapshots'), pointer=join(adult,'latest.json');
  try {
   const info=await stat(pointer), latest=JSON.parse(await readFile(pointer,'utf8'));
   if(!/^v\d+-\d+-\d+$/.test(latest.version||'')) throw new Error('Invalid adult snapshot pointer');
   await access(join(adult,latest.version,'catalog.json'));
   // Avoid racing an active collector or a consumer of its previous pointer.
   if(now-info.mtimeMs>=minAgeMs) await prune(adult,/^v\d+-\d+-\d+$/,[latest.version]);
  } catch(e) { if(e.code!=='ENOENT') throw e; }
  return {removed};
 });
}
