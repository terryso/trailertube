import {Play,SkipForward} from 'lucide-react';

const time=n=>{const value=Math.floor(Number(n)||0),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),seconds=String(value%60).padStart(2,'0');return hours?`${hours}:${String(minutes).padStart(2,'0')}:${seconds}`:`${minutes}:${seconds}`};
function Artwork({movie}){const src=movie.frame||movie.cover;return <div className="queue-art">{src&&<img src={src} alt="" loading="lazy"/>}</div>}
function Meta({movie}){return <span className="queue-meta">{movie.previewType==='Teaser'?'Teaser':'Trailer'}{typeof movie.duration==='number'&&` · ${time(movie.duration)}`}</span>}

export function PlaybackQueue({video,upcoming,autoplay,setAutoplay,countdown,cancel,nextBusy,nextError,advance,Link,onGo}){
 const next=upcoming.items[0];
 return <aside className="queue-panel" aria-label="Playback queue">
  <div className="queue-heading"><div><span className="queue-heading-icon"><Play aria-hidden="true"/></span><h2>Playback queue</h2></div><span className="queue-count">{upcoming.items.length+1} videos</span></div>
  <p className="queue-source">From: {upcoming.label}</p>
  <div className="queue-current" aria-label={'Current trailer: '+video.title}><Artwork movie={video}/><div className="queue-copy"><span className="queue-overline">CURRENT TRAILER</span><strong>{video.title}</strong><Meta movie={video}/></div><span className="queue-current-dot" aria-hidden="true"/></div>
  <div className="queue-options"><span>Autoplay next</span><label className="switch"><input type="checkbox" aria-label="Autoplay next trailer" checked={autoplay} onChange={e=>setAutoplay(e.target.checked)}/><span className="knob"/></label></div>
  {countdown!==null&&next&&<div className="queue-countdown" role="status"><div className="queue-countdown-heading"><div><span className="queue-overline">PLAYING NEXT</span><strong>{next.title}</strong></div><span className="queue-timer" aria-label={`${countdown} seconds`}>{countdown}</span></div><div className="queue-countdown-actions"><button className="queue-primary" disabled={nextBusy} onClick={()=>advance(false)}>Play now</button><button className="queue-cancel" onClick={cancel}>Cancel</button></div></div>}
  {next&&countdown===null&&<button className="queue-primary queue-next-button" disabled={nextBusy} onClick={()=>advance(false)}><SkipForward aria-hidden="true"/>{nextBusy?'Loading…':'Play next trailer'}</button>}
  {nextError&&<p className="queue-error" role="alert">{nextError}</p>}
  <div className="queue-list-heading"><span>UP NEXT</span><span>{upcoming.items.length} remaining</span></div>
  {next?<nav className="queue-list" aria-label="Upcoming trailers">{upcoming.items.map((item,index)=><Link className="queue-row" key={item.id} to={'/watch/'+encodeURIComponent(item.id)} go={onGo}><Artwork movie={item}/><div className="queue-copy"><strong>{item.title}</strong><Meta movie={item}/></div><span className="queue-row-play" aria-hidden="true"><Play/></span>{index===0&&<span className="visually-hidden">Next trailer</span>}</Link>)}</nav>:<p className="queue-empty">No more trailers in this list.</p>}
 </aside>;
}
