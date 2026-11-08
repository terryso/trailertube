import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

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
 const template=await readFile(new URL('../edge/watch-status.mjs',import.meta.url),'utf8');if(!template.includes('"__MOVIE_INDEX_CONFIG__"'))throw Error('Missing worker configuration placeholder');
 await writeFile(join(outputDir,'_worker.js'),template.replace('"__MOVIE_INDEX_CONFIG__"',JSON.stringify({digests})));
 await writeFile(join(outputDir,'_routes.json'),JSON.stringify({version:1,include:['/watch/*'],exclude:[]})+'\n');
 return {movies:seen.size,shards:digests.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await generateWatchIndex(process.argv[2]||'dist');console.log(`Generated watch index for ${result.movies} movies in ${result.shards} shards`)}
