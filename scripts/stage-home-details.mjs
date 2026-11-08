// One-time, read-only TMDB backfill for the current homepage selection.
// Writes a new local candidate snapshot only; never deploys or updates a cursor.
import {access,cp,mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readSnapshot} from '../incremental/snapshot.mjs';
import {createTmdbClient} from '../incremental/tmdb-client.mjs';
import {writeCatalogSnapshot} from './write-catalog.mjs';
import {tmdbMovieMetadata} from '../src/movie-metadata.js';

export async function stageHomeDetails({source,directory,request}){
 if(!source||!directory||typeof request!=='function')throw Error('Source, new staging directory and request adapter are required');
 source=resolve(source);directory=resolve(directory);const rel=relative(source,directory);if(directory===source||(!rel.startsWith('..')&&!rel.startsWith('/')))throw Error('Staging must be outside the source snapshot');
 try{await access(directory);throw Error('Staging directory already exists')}catch(e){if(e.code!=='ENOENT')throw e}
 const ordinary=await readSnapshot(join(source,'data'),'ordinary');const fast=JSON.parse(await readFile(join(source,'site/data/fast-lists.json'),'utf8'));
 if(fast.generatedAt!==ordinary.manifest.generatedAt||!Array.isArray(ordinary.manifest.featured)||!Array.isArray(fast.playlists))throw Error('Source homepage data mismatch');
 const popular=fast.playlists.find(x=>x.id==='popular-trailers')?.videos;if(!Array.isArray(popular))throw Error('Popular list unavailable');
 const ids=[...new Set([...ordinary.manifest.featured.slice(0,48),...popular.slice(0,10)].map(x=>String(x.id)))];if(!ids.length||ids.length>58||ids.some(id=>!/^[1-9]\d*$/.test(id)||!ordinary.entries.has(id)))throw Error('Invalid homepage movie selection');
 const results=new Array(ids.length);let next=0;async function worker(){while(next<ids.length){const i=next++,id=ids[i],detail=await request('/movie/'+id,{language:'en-US',append_to_response:'credits'});if(detail!==null&&(Number(detail.id)!==Number(id)||typeof detail.adult!=='boolean'))throw Error('Invalid TMDB detail response');results[i]=detail}}
 await Promise.all(Array.from({length:Math.min(3,ids.length)},worker));
 let updated=0,withRuntime=0,withCredits=0,skipped=0;for(let i=0;i<ids.length;i++){const d=results[i],id=ids[i];if(!d||d.adult===true){skipped++;continue}const old=ordinary.entries.get(id),fields=tmdbMovieMetadata(d,old);ordinary.entries.set(id,{...old,...fields,creditsTracked:true});updated++;if(fields.runtimeMinutes>0)withRuntime++;if(fields.creditsSource==='tmdb'&&(fields.directors?.length||fields.cast?.length))withCredits++}
 await mkdir(directory,{recursive:false});await cp(join(source,'adult-data'),join(directory,'adult-data'),{recursive:true,errorOnExist:true,force:false});
 const original=ordinary.manifest,manifest=await writeCatalogSnapshot({entries:[...ordinary.entries.values()],genres:ordinary.genres,outputDir:join(directory,'data'),start:original.start,end:original.end,complete:original.complete,auditGaps:original.auditGaps||0,pendingTeasers:original.pendingTeasers||0});
 if(original.incrementalPrerenderIds!==undefined)manifest.incrementalPrerenderIds=original.incrementalPrerenderIds;
 const target=join(directory,'data/catalog.json');await writeFile(target+'.tmp',JSON.stringify(manifest));await rename(target+'.tmp',target);
 const receipt={sourceGeneratedAt:original.generatedAt,generatedAt:manifest.generatedAt,selected:ids.length,updated,withRuntime,withCredits,skipped,productionPublished:false};await writeFile(join(directory,'home-details-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.length!==4||!process.env.TMDB_API_KEY)throw Error('Usage: TMDB_API_KEY=... node scripts/stage-home-details.mjs SOURCE NEW_STAGING_DIRECTORY');const request=createTmdbClient({key:process.env.TMDB_API_KEY});console.log(JSON.stringify(await stageHomeDetails({source:process.argv[2],directory:process.argv[3],request})));}
