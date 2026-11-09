import {mkdir,writeFile,rename} from 'node:fs/promises';
import {buildCatalogOverview,newestFirst,playableTrailer} from '../src/catalog-overview.js';
import {validTrailerVariants} from '../src/trailer-variants.js';
const byId=(a,b)=>Number(a.id)-Number(b.id);
function trailerState(entry){const {id,trailer,previewType,duration,views,playable,regionRestriction,trailerChecked,trailerVariants,trailerVariantsTracked}=entry;const state={id,trailer,previewType,duration,views,playable,regionRestriction,trailerChecked};if(trailerVariantsTracked===true){if(!Array.isArray(trailerVariants)||trailerVariants.length>10||validTrailerVariants(trailerVariants).length!==trailerVariants.length)throw Error('Invalid trailer variants');state.trailerVariantsTracked=true;state.trailerVariants=trailerVariants}else if(trailerVariants?.length)throw Error('Untracked trailer variants');return state}

async function atomic(path,data){await writeFile(path+'.tmp',JSON.stringify(data));await rename(path+'.tmp',path)}
export async function writeCatalogSnapshot({entries,genres,outputDir,start,end,complete=false,auditGaps=0,pendingTeasers=0}){
 await mkdir(outputDir,{recursive:true});
 const youtubeChecked=entries.filter(x=>typeof x.playable==='boolean').length,withTrailer=entries.filter(x=>x.trailer).length,durationCount=entries.filter(x=>typeof x.duration==='number'&&x.playable!==false).length;
 const overview=buildCatalogOverview(entries,genres),eligible=entries.filter(playableTrailer),featured=[...eligible].sort(newestFirst).slice(0,240);
 // Feed shards serve large browse/search lists; movie credits stay in detail
 // shards and the small featured set instead of being duplicated in the feed.
 const feed=eligible.map(({runtimeMinutes,directors,cast,creditsSource,creditsTracked,trailerVariants,trailerVariantsTracked,...movie})=>movie).sort(byId);
 const feedShards=[];for(let offset=0;offset<feed.length;offset+=10000){const name=`feed-${String(offset/10000).padStart(4,'0')}.json`;await atomic(`${outputDir}/${name}`,feed.slice(offset,offset+10000));feedShards.push(name)}
 const sortedMovies=[...entries].sort(newestFirst),browseShards=[],browseStateShards=[],browseShardSize=10000;
 for(let offset=0;offset<sortedMovies.length;offset+=browseShardSize){const slice=sortedMovies.slice(offset,offset+browseShardSize),suffix=String(offset/browseShardSize).padStart(4,'0'),name=`browse-${suffix}.json`,stateName=`browse-state-${suffix}.json`;const cards=slice.map(({id,title,createdAt,genreIds,cover,poster})=>({id,title,createdAt,genreIds,cover,poster}));const states=slice.filter(x=>x.trailerChecked||x.trailer||x.playable!==null).map(trailerState);await atomic(`${outputDir}/${name}`,cards);await atomic(`${outputDir}/${stateName}`,states);browseShards.push(name);browseStateShards.push(stateName)}
 const buckets=Array.from({length:64},()=>[]),stateBuckets=Array.from({length:64},()=>[]);
 for(const entry of entries){const index=Number(entry.id)%buckets.length;const {trailer,previewType,duration,views,playable,regionRestriction,trailerChecked,trailerVariants,trailerVariantsTracked,...movie}=entry;buckets[index].push(movie);if(trailerChecked||trailer||playable!==null||trailerVariantsTracked===true)stateBuckets[index].push(trailerState(entry))}
 const shards=[],stateShards=[];for(let i=0;i<buckets.length;i++){const name=`catalog-${String(i).padStart(4,'0')}.json`,stateName=`state-${String(i).padStart(4,'0')}.json`;buckets[i].sort(byId);stateBuckets[i].sort(byId);await atomic(`${outputDir}/${name}`,buckets[i]);await atomic(`${outputDir}/${stateName}`,stateBuckets[i]);shards.push(name);stateShards.push(stateName)}
 const manifest={generatedAt:new Date().toISOString(),movieDetailsVersion:1,start,end,complete,auditGaps,pendingTeasers,count:entries.length,checked:entries.filter(x=>x.trailerChecked).length,withTrailer,youtubeChecked,durationCount,shardBy:'id-modulo-v2',overview,featured,shards,stateShards,feedShards,browseShards,browseStateShards,browseShardSize};
 await atomic(`${outputDir}/genres.json`,genres);await atomic(`${outputDir}/catalog.json`,manifest);return manifest;
}
