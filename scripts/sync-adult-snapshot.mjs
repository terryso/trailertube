import {readFile,mkdir,cp,rename,rm,writeFile} from 'node:fs/promises';
async function json(path){try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
export async function syncAdultSnapshot({snapshots='.cache/adult-snapshots',publicDir='public',backupDir='.cache'}={}){
 const latest=await json(`${snapshots}/latest.json`);if(!latest)return null;
 if(!/^v\d+-\d+-\d+$/.test(latest.version||''))throw new Error('Invalid adult snapshot version');
 const src=`${snapshots}/${latest.version}`,manifest=await json(`${src}/catalog.json`);if(!manifest||manifest.count!==latest.count||!Array.isArray(manifest.shards))throw new Error('Invalid adult snapshot manifest');
 let seen=0;for(const shard of manifest.shards){if(!/^catalog-\d{4}\.json$/.test(shard))throw new Error('Invalid adult shard name');const rows=await json(`${src}/${shard}`);if(!Array.isArray(rows)||rows.some(m=>m.adult!==true))throw new Error('Adult snapshot contains unclassified records');seen+=rows.length}if(seen!==manifest.count)throw new Error('Adult snapshot count mismatch');
 await mkdir(publicDir,{recursive:true});await mkdir(backupDir,{recursive:true});const target=`${publicDir}/adult-data`,stage=`${publicDir}/.adult-data-stage-${process.pid}`,backup=`${backupDir}/adult-data-backup-${process.pid}`;
 await rm(stage,{recursive:true,force:true});await rm(backup,{recursive:true,force:true});await cp(src,stage,{recursive:true});await writeFile(`${stage}/_snapshot.json`,JSON.stringify(latest));
 let moved=false;try{try{await rename(target,backup);moved=true}catch(e){if(e.code!=='ENOENT')throw e}await rename(stage,target)}catch(e){if(moved)await rename(backup,target);throw e}finally{await rm(stage,{recursive:true,force:true})}
 if(moved)await rm(backup,{recursive:true,force:true});return latest;
}
