import {fetchChangedMovies} from './changes.mjs';
import {fetchMovieUpdates} from './updates.mjs';
import {stageCatalogs} from './stage.mjs';
import {runTransaction} from './transaction.mjs';
import {discoverReleases} from './discover.mjs';
import {maintenanceIds} from './maintenance.mjs';

// All externally visible writes are adapters: a staged snapshot is audited and
// a deployment independently verified before either local state or cursor move.
export async function syncIncremental({cursor,today,start,ordinary,adult,directory,request,verifyVideos,audit,deploy,verify,commit,prepare,onProgress=()=>{},deferredIds=[],checkpoint}) {
 if(!ordinary?.entries||!adult?.entries||!directory)throw new Error('Catalog snapshots and staging directory are required');
 return runTransaction({cursor,today,
   fetchChanges:async args=>{onProgress({phase:'changes-start'});const now=Date.parse(`${today}T00:00:00Z`);if(!Number.isFinite(now)||new Date(now).toISOString().slice(0,10)!==today)throw new Error('Invalid current date');const settled=new Date(now-86_400_000).toISOString().slice(0,10);const batch=await fetchChangedMovies({lastSuccessfulDate:args.lastSuccessfulDate>settled?settled:args.lastSuccessfulDate,today:settled,request});onProgress({phase:'changes-complete',total:batch.ids.length});const released=await discoverReleases({from:batch.windows[0].start,to:settled,request});const maintenance=maintenanceIds({ordinary:ordinary.entries,adult:adult.entries,cursor,today,start});const ids=[...new Set([...batch.ids,...released,...maintenance,...deferredIds.map(Number)])];onProgress({phase:'queue-ready',changed:batch.ids.length,released:released.length,maintenance:maintenance.length,deferred:deferredIds.length,total:ids.length});return {...batch,nextCursor:today,ids};},
   fetchUpdates:ids=>fetchMovieUpdates({ids,ordinary:ordinary.entries,adult:adult.entries,request,verifyVideos,start,end:today,onProgress,checkpoint}),
   stage:updates=>stageCatalogs({ordinary,adult,updates,start,end:today,directory}),
   audit,deploy,verify,commit,prepare,
 });
}
