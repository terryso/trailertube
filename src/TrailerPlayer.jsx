import {useEffect,useRef,useState} from 'react';
import {loadYouTubeIframeAPI} from './youtube-iframe.js';
import {playerErrorMessage,isPlayerMostlyVisible} from './playback-queue.js';
import {youtubeWatchUrl} from './youtube-link.js';
import {trackPlayback,createPlaybackTracker,createNextStartReporter} from './playback-analytics.js';

export function TrailerPlayer({video,Icon,autoStart=true,hasAlternatives=false,nextStart=null,onNextStarted=()=>{},onEnded=()=>{},onPlaying=()=>{},onFailure=()=>{}}){
 const [started,setStarted]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const container=useRef(null),shell=useRef(null),callbacks=useRef({});callbacks.current={onEnded,onPlaying,onFailure,onNextStarted};
 const valid=!!youtubeWatchUrl(video.trailer)&&video.playable!==false;
 useEffect(()=>{if(!autoStart||started||!valid)return;let active=true;const check=()=>{if(!active||document.visibilityState!=='visible'||!shell.current)return;if(isPlayerMostlyVisible(shell.current.getBoundingClientRect(),innerWidth,innerHeight)){active=false;setStarted(true)}};const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(check,{threshold:[0,.5,.51,1]}):null;if(shell.current)observer?.observe(shell.current);window.addEventListener('scroll',check,{passive:true});window.addEventListener('resize',check);document.addEventListener('visibilitychange',check);check();return()=>{active=false;observer?.disconnect();window.removeEventListener('scroll',check);window.removeEventListener('resize',check);document.removeEventListener('visibilitychange',check)}},[autoStart,started,valid]);
 useEffect(()=>{if(!started||!valid)return;let alive=true,instance=null,readyTimer;setError('');const tracker=createPlaybackTracker((event,fields={})=>trackPlayback(event,{movieId:String(video.id),trailerId:video.trailer,adult:video.adult===true,...fields})),reportNext=createNextStartReporter(nextStart,video.id,automatic=>{trackPlayback('next_trailer_started',{movieId:String(video.id),trailerId:video.trailer,adult:video.adult===true,automatic});callbacks.current.onNextStarted()});
  loadYouTubeIframeAPI().then(YT=>{if(!alive||!container.current)return;const mount=document.createElement('div');container.current.replaceChildren(mount);readyTimer=setTimeout(()=>{if(alive){setError('The YouTube player did not respond.');callbacks.current.onFailure()}},15000);
   instance=new YT.Player(mount,{width:'100%',height:'100%',videoId:video.trailer,playerVars:{autoplay:1,playsinline:1,origin:location.origin},events:{
    onReady:e=>{if(!alive)return;clearTimeout(readyTimer);const iframe=e.target.getIframe?.();if(iframe){iframe.title=video.title+' trailer';iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin')}},
    onStateChange:e=>{if(!alive)return;const status=tracker.state(e.data);if(status==='ended')callbacks.current.onEnded();if(status==='playing'){reportNext();callbacks.current.onPlaying()}},
    onError:e=>{if(!alive)return;clearTimeout(readyTimer);tracker.error(e.data);setError(playerErrorMessage(e.data));callbacks.current.onFailure()},
    onAutoplayBlocked:()=>{if(alive)callbacks.current.onFailure()}
   }});
  }).catch(()=>{if(alive){setError('The YouTube player could not be loaded.');callbacks.current.onFailure()}});
  return()=>{alive=false;clearTimeout(readyTimer);try{instance?.destroy()}catch{}container.current?.replaceChildren()};
 },[started,valid,video.id,video.trailer,attempt]);
 const url=youtubeWatchUrl(video.trailer);
 return <><div className="player" ref={shell}>{started&&valid?<div className="player-inner" ref={container}/>:<button className="poster" aria-label={valid?'Play '+video.title:video.trailerChecked===false?'Trailer being checked':'Trailer unavailable'} disabled={!valid} onClick={()=>setStarted(true)}>{(video.frame||video.cover)&&<img src={video.frame||video.cover} alt=""/>}{valid?<span className="play"><Icon i={15}/></span>:<span className="play-unavailable">{video.trailerChecked===false?'Trailer being checked':'Trailer unavailable'}</span>}</button>}</div>
 {error&&<div className="player-message player-error" role="alert"><p>{error}{hasAlternatives?' Choose another trailer below.':''}</p><div><button className="pill" onClick={()=>setAttempt(x=>x+1)}>Try again</button>{url&&<a className="pill" href={url} target="_blank" rel="noopener noreferrer">Open on YouTube</a>}</div></div>}
 {(Array.isArray(video.regionRestriction?.allowed)||video.regionRestriction?.blocked?.length>0)&&<p className="sub">Playback may be restricted in some regions.</p>}</>;
}
