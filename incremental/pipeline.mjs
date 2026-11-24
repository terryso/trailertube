import {fetchChangedMovies} from './changes.mjs';
import {fetchMovieUpdates} from './updates.mjs';
import {stageCatalogs} from './stage.mjs';
import {runTransaction} from './transaction.mjs';
import {discoverReleases} from './discover.mjs';
import {maintenanceIds} from './maintenance.mjs';

// All externally visible writes are adapters: a staged snapshot is audited and
// a deployment independently verified before either local state or cursor move.
export async function syncIncremental({cursor,today,start,ordinary,adult,directory,request,verifyVideos,audit,deploy,verify,commit,prepare,onProgress=()=>{},deferredIds=[],pendingGaps=[],checkpoint}) {
 if(!ordinary?.entries||!adult?.entries||!directory)throw new Error('Catalog snapshots and staging directory are required');
 return runTransaction({cursor,today,
   fetchChanges:async args=>{
    onProgress({phase:'changes-start'});const now=Date.parse(`${today}T00:00:00Z`);if(!Number.isFinite(now)||new Date(now).toISOString().slice(0,10)!==today)throw new Error('Invalid current date');
    const settled=new Date(now-86_400_000).toISOString().slice(0,10), gaps=[];
    if(!Array.isArray(pendingGaps)||pendingGaps.some(g=>!['changes','releases'].includes(g.type)||!/^\d{4}-\d{2}-\d{2}$/.test(g.date)||!Number.isFinite(Date.parse(g.date+'T00:00:00Z'))||new Date(g.date+'T00:00:00Z').toISOString().slice(0,10)!==g.date||g.date>settled))throw Error('Invalid pending gaps');
    const batch=await fetchChangedMovies({lastSuccessfulDate:args.lastSuccessfulDate>settled?settled:args.lastSuccessfulDate,today:settled,request,allowIncomplete:true});gaps.push(...batch.gaps);onProgress({phase:'changes-complete',total:batch.ids.length});
    const released=await discoverReleases({from:batch.windows[0].start,to:settled,request,allowIncomplete:true,gaps});const extra=[];
    for(const gap of pendingGaps){if(gap.type==='changes'&&Date.parse(settled+'T00:00:00Z')-Date.parse(gap.date+'T00:00:00Z')>13*86_400_000){gaps.push(gap);continue}const checked=[];if(gap.type==='changes'){let b=await fetchChangedMovies({lastSuccessfulDate:gap.date,today:gap.date,overlapDays:0,request,allowIncomplete:true});extra.push(...b.ids);checked.push(...b.gaps)}else extra.push(...await discoverReleases({from:gap.date,to:gap.date,request,allowIncomplete:true,gaps:checked}));for(let i=gaps.length-1;i>=0;i--)if(gaps[i].type===gap.type&&gaps[i].date===gap.date)gaps.splice(i,1);gaps.push(...checked);}
    const dedup=[...new Map(gaps.map(g=>[g.type+':'+g.date,g])).values()];const maintenance=maintenanceIds({ordinary:ordinary.entries,adult:adult.entries,cursor,today,start});const ids=[...new Set([...batch.ids,...released,...extra,...maintenance,...deferredIds.map(Number)])];onProgress({phase:'queue-ready',changed:batch.ids.length,released:released.length,maintenance:maintenance.length,deferred:deferredIds.length,pendingGaps:dedup.length,total:ids.length});return {...batch,nextCursor:today,ids,pendingGaps:dedup};},
   fetchUpdates:async ids=>{const updates=await fetchMovieUpdates({ids,ordinary:ordinary.entries,adult:adult.entries,request,verifyVideos,start,end:today,onProgress,checkpoint});for(let i=0;i<updates.length;i++){const u=updates[i],old=ordinary.entries.get(String(u.id))||adult.entries.get(String(u.id));if(old&&old.createdAt>=start&&old.createdAt<=today&&typeof u.createdAt==='string'&&(u.createdAt<start||u.createdAt>today)){const [fresh]=await fetchMovieUpdates({ids:[String(u.id)],ordinary:ordinary.entries,adult:adult.entries,request,verifyVideos,start,end:today});updates[i]=fresh}}return updates},
   stage:(updates,pendingGaps)=>stageCatalogs({ordinary,adult,updates,start,end:today,directory,pendingGaps}),
   audit,deploy,verify,commit,prepare,
 });
}
