// Discover records omitted by include_adult=false, without publishing them.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
const key=process.env.TMDB_API_KEY;if(!key)throw new Error('TMDB_API_KEY is required');
const start=process.env.COLLECT_START,end=process.env.COLLECT_END;if(!start||!end)throw new Error('Explicit COLLECT_START and COLLECT_END are required');
const cache='.cache';await mkdir(cache,{recursive:true});
async function read(path){try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function write(path,data){await writeFile(path+'.tmp',JSON.stringify(data));await rename(path+'.tmp',path)}
let nextStart=0;
async function request(params){
 for(let attempt=0;attempt<7;attempt++){
  const now=Date.now(),at=Math.max(now,nextStart);nextStart=at+85;if(at>now)await new Promise(r=>setTimeout(r,at-now));
  const u=new URL('https://api.themoviedb.org/3/discover/movie');u.search=new URLSearchParams({...params,api_key:key});
  try{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(r.status===429||r.status>=500){await new Promise(resolve=>setTimeout(resolve,Math.min(30000,1000*2**attempt)));continue}if(!r.ok)throw new Error(`TMDB HTTP ${r.status}`);return await r.json()}catch(e){if(attempt===6)throw new Error(`TMDB request failed: ${e.name}`);await new Promise(resolve=>setTimeout(resolve,1000*2**attempt))}
 }throw new Error('TMDB retries exceeded');
}
async function discover(date){
 const file=`${cache}/adult-day-${date}.json`,cached=await read(file);if(cached?.audited&&cached.schemaVersion===2)return cached;
 const base=await read(`${cache}/day-${date}.json`);if(!base)throw new Error(`Missing baseline for ${date}`);
 const baseline=new Map(base.items.map(m=>[m.id,m]));const found=new Map(baseline);for(const movie of cached?.items||[])found.set(movie.id,movie);let expected=0;
 for(const sort of ['popularity.desc','popularity.asc','vote_count.desc']){
  const params={'primary_release_date.gte':date,'primary_release_date.lte':date,include_adult:'true',include_video:'false',language:'en-US',sort_by:sort};
  const first=await request({...params,page:1});expected=Math.max(expected,first.total_results);if(first.total_pages>500)throw new Error(`Date exceeds API pagination limit: ${date}`);
  for(const m of first.results)found.set(m.id,m);
  let page=2;async function pageWorker(){while(page<=first.total_pages){const n=page++,result=await request({...params,page:n});for(const m of result.results)found.set(m.id,m)}}await Promise.all(Array.from({length:4},pageWorker));
  if(found.size>=expected)break;
 }
 const extra=[...found.values()].filter(m=>!baseline.has(m.id)||(m.adult===true&&baseline.get(m.id)?.adult!==true));const result={schemaVersion:2,date,expected,observed:found.size,baseCount:baseline.size,audited:found.size>=expected,items:extra};await write(file,result);return result;
}
const dates=[];let at=new Date(start+'T00:00:00Z');while(at.toISOString().slice(0,10)<=end){dates.push(at.toISOString().slice(0,10));at=new Date(at.getTime()+86400000)}
let next=0,done=0,additional=0,gaps=0;async function worker(){while(next<dates.length){const result=await discover(dates[next++]);done++;additional+=result.items.length;if(!result.audited)gaps++;if(done%100===0)console.log(`adult-scope days ${done}/${dates.length}; additional ${additional}; gaps ${gaps}`)}}
await Promise.all(Array.from({length:4},worker));await write(`${cache}/adult-audit.json`,{start,end,days:dates.length,additional,gaps});console.log(JSON.stringify({done:dates.length,additional,gaps}));
