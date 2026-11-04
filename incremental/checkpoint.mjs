import {mkdir,readFile,appendFile,truncate} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');

// Checkpoints are scoped to the exact production baseline and date window.
// An interrupted final write is discarded; any other corruption fails closed.
export async function openDetailCheckpoint({root,context}) {
 const key=hash(JSON.stringify(context));const dir=join(root,'checkpoints');await mkdir(dir,{recursive:true});const path=join(dir,`${key}.jsonl`);
 let raw;try{raw=await readFile(path,'utf8')}catch(error){if(error.code!=='ENOENT')throw error;raw=''}
 if(raw&&!raw.endsWith('\n')){const last=raw.lastIndexOf('\n');raw=last<0?'':raw.slice(0,last+1);await truncate(path,Buffer.byteLength(raw))}
 const records=new Map();for(const line of raw.split('\n')){if(!line)continue;const record=JSON.parse(line);if(!/^\d+$/.test(record.id)||record.hash!==hash(JSON.stringify(record.detail))||(record.detail!==null&&(Number(record.detail?.id)!==Number(record.id)||typeof record.detail.adult!=='boolean')))throw new Error('Invalid detail checkpoint');records.set(record.id,record.detail)}
 let writes=Promise.resolve();
 return {size:records.size,async get(id,fetch){id=String(id);if(!/^\d+$/.test(id))throw new Error('Invalid checkpoint ID');if(records.has(id))return records.get(id);const detail=await fetch();if(detail!==null&&(Number(detail?.id)!==Number(id)||typeof detail.adult!=='boolean'))throw new Error('Invalid movie details');const line=JSON.stringify({id,detail,hash:hash(JSON.stringify(detail))})+'\n';writes=writes.then(()=>appendFile(path,line,{mode:0o600}));await writes;records.set(id,detail);return detail}};
}
