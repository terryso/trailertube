import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Submit URLs to IndexNow (Bing and other participating engines) using the
// key file served from the site root. Run after a production deploy:
//   node scripts/submit-indexnow.mjs dist
// Submits hub pages, prerendered playlists and static watch pages in one
// batch (IndexNow caps at 10,000 URLs per call).
const origin='https://trailer.terryso.dev';
const key='1b75934a1d5ca36c98a59a0468fa6ed6';

export async function submitIndexNow(outputDir,{endpoint='https://api.indexnow.org/indexnow',fetcher=fetch}={}){
 let keyFile;try{keyFile=await readFile(join(outputDir,`${key}.txt`),'utf8')}catch(e){if(e.code==='ENOENT')throw new Error('IndexNow key file missing');throw e}
 if(keyFile.trim()!==key)throw new Error('IndexNow key file mismatched');
 const urls=[origin+'/',origin+'/categories',origin+'/playlists',origin+'/about'];
 try{for(const name of await readdir(join(outputDir,'p'))){const id=/^([a-z0-9-]+)\.html$/.exec(name)?.[1];if(id)urls.push(`${origin}/p/${id}`)}}catch(e){if(e.code!=='ENOENT')throw e}
 try{for(const name of await readdir(join(outputDir,'watch'))){const id=/^(\d+)\.html$/.exec(name)?.[1];if(id)urls.push(`${origin}/watch/${id}`)}}catch(e){if(e.code!=='ENOENT')throw e}
 if(urls.length>10000)throw new Error(`IndexNow batch too large: ${urls.length}`);
 const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify({host:'trailer.terryso.dev',key,keyLocation:`${origin}/${key}.txt`,urlList:urls})});
 // 200 = accepted, 202 = accepted (key not verified yet), 422 = rejected
 if(![200,202].includes(response.status))throw new Error(`IndexNow responded ${response.status}: ${await response.text().catch(()=>'')}`);
 return {submitted:urls.length,status:response.status};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await submitIndexNow(resolve(process.argv[2]||'dist'));
 console.log(`IndexNow accepted ${result.submitted} URLs (HTTP ${result.status})`);
}
