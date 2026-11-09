const allowed=new Set(['trailer_play_started','trailer_play_completed','trailer_play_error','trailer_variant_switch','next_trailer_click','next_trailer_started','autoplay_toggle']);
// Existing analytics may be blocked or unavailable. Never collect adult titles,
// searches, user identifiers or titles through these optional events.
export function trackPlayback(event,{movieId,trailerId,adult=false,...fields}={}){
 if(adult||!allowed.has(event)||typeof window==='undefined'||window.location?.hostname!=='trailer.terryso.dev'||typeof window.gtag!=='function')return;
 const data={};if(typeof movieId==='string'&&/^[1-9]\d*$/.test(movieId))data.movie_id=movieId;if(typeof trailerId==='string'&&/^[A-Za-z0-9_-]{11}$/.test(trailerId))data.trailer_id=trailerId;
 if(typeof fields.errorCode==='number'&&Number.isInteger(fields.errorCode))data.error_code=fields.errorCode;
 if(typeof fields.enabled==='boolean')data.enabled=fields.enabled?1:0;
 if(typeof fields.automatic==='boolean')data.automatic=fields.automatic?1:0;
 try{window.gtag('event',event,data)}catch{}
}

// Distinguish a real start/completion from pauses, buffering and duplicate
// player callbacks. A replay after completion is a new viewing attempt.
export function createPlaybackTracker(emit){
 let phase='unstarted',lastError=null;
 return {state(value){if(value===0){const ended=phase==='playing'||phase==='paused';if(ended)emit('trailer_play_completed');phase='ended';return ended?'ended':null}if(value===1){if(phase==='unstarted'||phase==='ended')emit('trailer_play_started');phase='playing';return 'playing'}if(value===2&&phase==='playing')phase='paused';return null},error(code){phase='unstarted';if(lastError===code)return;lastError=code;emit('trailer_play_error',{errorCode:Number(code)})}};
}

export function createNextStartReporter(nextStart,movieId,emit){let reported=false;return ()=>{if(reported||!nextStart||nextStart.movieId!==String(movieId))return false;reported=true;emit(nextStart.automatic===true);return true}}
