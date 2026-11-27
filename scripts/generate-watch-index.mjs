import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {moviePageEligible} from '../edge/watch-status.mjs';

const origin='https://trailer.terryso.dev';
const renderShardCount=256;
const renderFields=['id','title','description','createdAt','genreIds','cover','poster','runtimeMinutes','adult','directors','cast','creditsSource','trailer','previewType','duration','playable','trailerChecked'];

export async function generateWatchIndex(outputDir){
 const dataDir=join(outputDir,'data'),manifest=JSON.parse(await readFile(join(dataDir,'catalog.json'),'utf8'));
 if(manifest.shardBy!=='id-modulo-v2'||!Array.isArray(manifest.shards)||manifest.shards.length!==64||!Number.isSafeInteger(manifest.count))throw Error('Unsupported movie catalog');
 const indexDir=join(outputDir,'seo-data');await mkdir(indexDir,{recursive:true});const seen=new Set(),digests=[];
 for(let i=0;i<manifest.shards.length;i++){
  const name=manifest.shards[i];if(!/^catalog-\d{4}\.json$/.test(name))throw Error('Invalid catalog shard name');
  const movies=JSON.parse(await readFile(join(dataDir,name),'utf8'));if(!Array.isArray(movies))throw Error('Invalid catalog shard');
  const ids=[];for(const movie of movies){const id=String(movie.id),n=Number(id);if(!/^\d+$/.test(id)||!Number.isSafeInteger(n)||String(n)!==id||n%manifest.shards.length!==i||seen.has(id))throw Error('Invalid movie ID index');seen.add(id);ids.push(id)}
  const bytes=JSON.stringify(ids);await writeFile(join(indexDir,`movie-ids-${String(i).padStart(4,'0')}.json`),bytes);digests.push(createHash('sha256').update(bytes).digest('hex'));
 }
 if(seen.size!==manifest.count)throw Error('Movie index count does not match catalog');
 // Edge rendering shards: the verified feed-details records projected down to
 // the fields the shared renderer needs, bucketed much finer (id modulo 256)
 // so a worker can parse one shard well inside its CPU budget.
 const details=JSON.parse(await readFile(join(dataDir,'feed-details-manifest.json'),'utf8'));
 if(details.version!==1||!Array.isArray(details.shards)||details.shards.length!==64||!Number.isSafeInteger(details.count)||details.count<0)throw Error('Unsupported feed details manifest');
 const buckets=Array.from({length:renderShardCount},()=>[]);const renderedSeen=new Set();let rendered=0;const picksPool=[];
 for(let i=0;i<details.shards.length;i++){
  const name=details.shards[i];if(name!==`feed-details-${String(i).padStart(4,'0')}.json`)throw Error('Invalid feed details shard');
  const movies=JSON.parse(await readFile(join(dataDir,name),'utf8'));if(!Array.isArray(movies))throw Error('Invalid feed details shard');
  for(const movie of movies){
   const id=String(movie.id),n=Number(id);
   if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(n)||n%64!==i)throw Error('Invalid feed details movie');
   if(renderedSeen.has(id))throw Error('Duplicate feed details movie');renderedSeen.add(id);
   if(!moviePageEligible(movie))continue;
   const record={};for(const field of renderFields)if(movie[field]!==undefined)record[field]=movie[field];
   buckets[n%renderShardCount].push(record);rendered++;
   picksPool.push({id:String(movie.id),title:String(movie.title||''),createdAt:typeof movie.createdAt==='string'?movie.createdAt:'',popularity:Number(movie.popularity)||0,genreIds:Array.isArray(movie.genreIds)?movie.genreIds:[]});
  }
 }
 if(renderedSeen.size!==details.count)throw Error('Render shard count does not match feed details');
 // The worker renders /browse?category= pages server-side; bake the top
 // picks per genre (popularity-ranked) into the config so those pages have
 // real content instead of the SPA shell that attracted duplicate verdicts
 // for /person/*.
 picksPool.sort((a,b)=>b.popularity-a.popularity||Number(b.id)-Number(a.id));
 const genrePicks=new Map();
 for(const movie of picksPool){
  for(const gid of movie.genreIds){
   if(!genrePicks.has(gid))genrePicks.set(gid,[]);
   const list=genrePicks.get(gid);
   if(list.length<12)list.push({id:movie.id,title:movie.title,createdAt:movie.createdAt});
  }
 }
 const browsePicks={};
 for(const [gid,list] of genrePicks)if(list.length)browsePicks[gid]=list;
 const renderDigests=[];
 for(let i=0;i<renderShardCount;i++){const bytes=JSON.stringify(buckets[i]);await writeFile(join(indexDir,`render-${String(i).padStart(4,'0')}.json`),bytes);renderDigests.push(createHash('sha256').update(bytes).digest('hex'))}
 // Static prerendered pages stay the fast path; the worker only renders IDs
 // that have no file, so the baked set must match the deployed watch/ dir.
 const prerenderedIds=[];
 try{for(const name of await readdir(join(outputDir,'watch'))){const id=/^(\d+)\.html$/.exec(name)?.[1];if(!id)throw Error('Invalid prerendered watch page');if(prerenderedIds.includes(id))throw Error('Duplicate prerendered watch page');prerenderedIds.push(id)}}catch(e){if(e.code!=='ENOENT')throw e}
 prerenderedIds.sort((a,b)=>Number(a)-Number(b));
 let genres=[];try{genres=JSON.parse(await readFile(join(dataDir,'genres.json'),'utf8'));if(!Array.isArray(genres)||genres.some(g=>!/^\d+$/.test(String(g?.id))||typeof g?.name!=='string'||!g.name.trim()))throw Error('Invalid genre list')}catch(e){if(e.code!=='ENOENT')throw e}
 const template=await readFile(join(outputDir,'index.html'),'utf8');
 if(!template.includes('<div id="root"></div>'))throw Error('Unexpected app template');
 const templateDigest=createHash('sha256').update(template).digest('hex');
 const renderVersion=createHash('sha256').update(renderDigests.join('')).update(templateDigest).update(prerenderedIds.join(',')).update(JSON.stringify(genres)).update(JSON.stringify(browsePicks)).update(origin).digest('hex').slice(0,16);
 const workerTemplate=await readFile(new URL('../edge/watch-status.mjs',import.meta.url),'utf8');if(!workerTemplate.includes('"__MOVIE_INDEX_CONFIG__"'))throw Error('Missing worker configuration placeholder');
 await writeFile(join(outputDir,'_worker.js'),workerTemplate.replace('"__MOVIE_INDEX_CONFIG__"',JSON.stringify({digests,renderShards:renderShardCount,renderDigests,prerenderedIds,genres,browsePicks,origin,renderVersion})));
 await writeFile(join(outputDir,'_routes.json'),JSON.stringify({version:1,include:['/','/browse','/watch/*','/person/*'],exclude:[]})+'\n');
 return {movies:seen.size,shards:digests.length,renderShards:renderShardCount,rendered,prerendered:prerenderedIds.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await generateWatchIndex(process.argv[2]||'dist');console.log(`Generated watch index for ${result.movies} movies in ${result.shards} shards (${result.rendered} edge-renderable in ${result.renderShards} shards, ${result.prerendered} static pages)`)}
