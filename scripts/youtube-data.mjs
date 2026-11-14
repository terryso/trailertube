import {readFile,appendFile,writeFile,rename} from 'node:fs/promises';

export function parseDuration(value){
 const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value||'');
 if(!m||!m.slice(1).some(x=>x!==undefined))return null;
 return Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0);
}
export function normalizeVideo(item){
 if(!item)return {available:false,duration:null,regionRestriction:null,privacyStatus:'missing',views:null};
 const status=item.status||{},privacyStatus=status.privacyStatus||'unknown',regionRestriction=item.contentDetails?.regionRestriction||null;
 const globallyBlocked=Array.isArray(regionRestriction?.allowed)&&regionRestriction.allowed.length===0;
 const count=item.statistics?.viewCount,views=typeof count==='string'&&/^\d+$/.test(count)?count:null;
 return {available:['public','unlisted'].includes(privacyStatus)&&status.embeddable===true&&!globallyBlocked,duration:parseDuration(item.contentDetails?.duration),regionRestriction,privacyStatus,views};
}
export function validPublishedAt(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)||!Number.isFinite(Date.parse(value)))return null;return new Date(value).toISOString()}
async function readSetting(name){
 if(process.env[name])return process.env[name].trim();
 try {const line=(await readFile('.env','utf8')).split(/\r?\n/).find(x=>new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=').test(x));return line?.slice(line.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')||''} catch(e){if(e.code==='ENOENT')return '';throw e}
}
export const readYouTubeKey=()=>readSetting('YOUTUBE_API_KEY');
export const readYouTubeOAuthFile=()=>readSetting('YOUTUBE_OAUTH_TOKEN_FILE');
export async function enrichYouTube(ids,{key,getToken,cachePath='.cache/youtube.jsonl',fetcher=fetch,now=Date.now(),requirePublishedAt=false}={}){
 const latest=new Map();let rows=0;try {for(const line of (await readFile(cachePath,'utf8')).split('\n'))if(line){const x=JSON.parse(line);latest.set(x.id,x);rows++}}catch(e){if(e.code!=='ENOENT')throw e}
 const cache=new Map([...latest].filter(([,x])=>{const checked=Date.parse(x.checkedAt);return Number.isFinite(checked)&&checked<=now&&now-checked<27*86400000}));
 if(cache.size!==rows){const temp=cachePath+'.tmp';await writeFile(temp,[...cache.values()].map(x=>JSON.stringify(x)).join('\n')+(cache.size?'\n':''));await rename(temp,cachePath)}
 if(!key&&!getToken)return cache;
 const pending=[...new Set(ids)].filter(id=>{const previous=cache.get(id);return /^[\w-]{11}$/.test(id)&&(!previous||!Object.hasOwn(previous,'views')||(requirePublishedAt&&!Object.hasOwn(previous,'publishedAt'))||(previous.available===false&&!Object.hasOwn(previous,'privacyStatus'))) });
 for(let i=0;i<pending.length;i+=50){
  const batch=pending.slice(i,i+50),url=new URL('https://www.googleapis.com/youtube/v3/videos');url.search=new URLSearchParams({...key?{key}:{},part:'contentDetails,status,statistics,snippet',id:batch.join(',')});const token=getToken?await getToken():null;
  let response;
  for(let attempt=0;attempt<5;attempt++){
   try{response=await fetcher(url,{signal:AbortSignal.timeout(30000),...(token?{headers:{Authorization:`Bearer ${token}`}}:{})});if(response.status===429||response.status>=500){await new Promise(r=>setTimeout(r,Math.min(15000,1000*2**attempt)));continue}break}catch(error){if(attempt===4)throw new Error('YouTube metadata request failed');await new Promise(r=>setTimeout(r,1000*2**attempt))}
  }
  if(!response?.ok)throw new Error(`YouTube metadata request failed: HTTP ${response?.status||'unavailable'}`);
  const data=await response.json(),byId=new Map((data.items||[]).map(item=>[item.id,item]));const records=batch.map(id=>({id,...normalizeVideo(byId.get(id)),publishedAt:validPublishedAt(byId.get(id)?.snippet?.publishedAt),checkedAt:new Date(now).toISOString()}));
  await appendFile(cachePath,records.map(x=>JSON.stringify(x)).join('\n')+'\n');for(const x of records)cache.set(x.id,x);
 }
 return cache;
}

export async function fetchVideoSnippets(ids,{key,getToken,fetcher=fetch}={}){
 const out=new Map();
 for(let i=0;i<ids.length;i+=50){
  const batch=ids.slice(i,i+50),url=new URL('https://www.googleapis.com/youtube/v3/videos');url.search=new URLSearchParams({...key?{key}:{},part:'snippet',id:batch.join(',')});const token=getToken?await getToken():null;
  let response;
  for(let attempt=0;attempt<5;attempt++){
   try{response=await fetcher(url,{signal:AbortSignal.timeout(30000),...(token?{headers:{Authorization:`Bearer ${token}`}}:{})});if(response.status===429||response.status>=500){await new Promise(r=>setTimeout(r,Math.min(15000,1000*2**attempt)));continue}break}catch(error){if(attempt===4)throw new Error('YouTube snippet request failed');await new Promise(r=>setTimeout(r,1000*2**attempt))}
  }
  if(!response?.ok)throw new Error(`YouTube snippet request failed: HTTP ${response?.status||'unavailable'}`);
  const data=await response.json();
  for(const item of data.items||[]){const snippet=item.snippet||{};if(typeof snippet.title==='string'&&snippet.title.trim()&&typeof snippet.publishedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(snippet.publishedAt))out.set(item.id,{name:snippet.title.trim(),publishedAt:snippet.publishedAt.replace(/(\.\d+)?Z$/,'Z')})}
 }
 return out;
}
export function googleOAuthTokenProvider(file,fetcher=fetch){
 let token='',expiresAt=0;
 return async()=>{
  if(token&&Date.now()<expiresAt-60000)return token;
  const data=JSON.parse(await readFile(file,'utf8'));const tokenUrl=new URL(data.token_uri||'https://oauth2.googleapis.com/token');
  if(tokenUrl.protocol!=='https:'||!['accounts.google.com','oauth2.googleapis.com'].includes(tokenUrl.hostname))throw new Error('Unsupported Google OAuth token endpoint');
  const body=new URLSearchParams({client_id:data.client_id,client_secret:data.client_secret,refresh_token:data.refresh_token,grant_type:'refresh_token'});
  let response=await fetcher(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Google OAuth refresh failed: HTTP ${response.status}`);
  const result=await response.json();if(!result.access_token)throw new Error('Google OAuth refresh returned no access token');
  token=result.access_token;expiresAt=Date.now()+Number(result.expires_in||3600)*1000;return token;
 };
}
