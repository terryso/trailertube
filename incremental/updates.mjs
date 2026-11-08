import {previewCandidates} from '../scripts/trailer-selection.mjs';
import {prepareMovieUpdate} from './movie-update.mjs';
const languages='en,ko,fr,es,de,ja,zh,hi,pt,it,ru,ar,tr,pl,nl,sv,id,th,uk,vi,da,fi,no,he,el,ro,hu,cs,fa,ta,te,ml,bn,mr,ur,ms,ca,et,lv,lt,null';

// The change list includes films outside the rolling window, and records whose
// release date is not known. Only remove an existing film after a real 404.
export async function fetchMovieUpdates({ids,ordinary,adult,request,verifyVideos,start,end,concurrency=4,onProgress=()=>{},checkpoint}) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw new Error('Invalid concurrency');
  const details=new Array(ids.length);let index=0,done=0;const progress=()=>{done++;if(done%500===0||done===ids.length)onProgress({phase:'movie-details',done,total:ids.length})};
  async function worker(){while(index<ids.length){const slot=index++,id=String(ids[slot]);if(!/^\d+$/.test(id))throw new Error('Invalid movie ID');const old=ordinary.get(id)||adult.get(id),trackCredits=!old||old.creditsTracked===true||old.creditsSource==='tmdb';const fetch=()=>request(`/movie/${id}`,{language:'en-US',append_to_response:trackCredits?'videos,credits':'videos',include_video_language:languages});const detail=checkpoint?await checkpoint.get(id,fetch):await fetch();if(detail===null){details[slot]=old?{id,adult:old.adult===true,deferred:true,reason:'source-not-found'}:{id,adult:false,ignored:true};progress();continue}if(Number(detail.id)!==Number(id)||typeof detail.adult!=='boolean')throw new Error('Invalid movie details');
    if(!detail.release_date){details[slot]={id,adult:detail.adult,deferred:true,reason:'missing-release-date'};progress();continue}
    if(detail.release_date<start||detail.release_date>end){details[slot]={id,adult:detail.adult,title:detail.title||detail.original_title||`TMDB ${id}`,createdAt:detail.release_date};progress();continue}
    details[slot]={id,detail,old,trackCredits};progress();}}
  await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},worker));
  const videoIds=new Set();for(const item of details)if(item.detail){for(const v of previewCandidates(item.detail.videos?.results))videoIds.add(v.key);if(item.old?.trailer)videoIds.add(item.old.trailer)}
  onProgress({phase:'youtube-validation',total:videoIds.size});const verified=videoIds.size?await verifyVideos([...videoIds]):new Map();
  return Promise.all(details.map(item=>item.detail?prepareMovieUpdate(item.detail,item.old,async()=>verified,{trackCredits:item.trackCredits}):item));
}
