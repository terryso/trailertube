import {useEffect,useState} from 'react';
const types=[['flatrate','Subscription'],['free','Free'],['ads','With ads'],['rent','Rent'],['buy','Buy']];
// Per-provider deep links change constantly and the TMDB/JustWatch data carries
// none, so platforms are listed as plain text and the two stable destinations
// are offered: TMDB's watch page (exact per-provider links, region aware) and
// a JustWatch title search for the selected region.
export function WatchProviders({id,title}){
 const [data,setData]=useState(null),[region,setRegion]=useState(()=>{try{return localStorage.getItem('watch-region')||'US'}catch{return 'US'}});
 useEffect(()=>{let active=true;fetch('/data/watch-providers.json').then(r=>r.ok?r.json():null).then(x=>{if(active)setData(x)}).catch(()=>{});return()=>{active=false}},[]);
 const movie=data?.movies?.[id];if(!movie)return null;
 const query=typeof title==='string'&&title.trim()?title.trim():null;
 const regions=Object.keys(movie).filter(x=>/^[A-Z]{2}$/.test(x)).sort();
 const selected=movie[region];let tmdb;try{const u=new URL(selected?.link);if(u.protocol==='https:'&&u.hostname==='www.themoviedb.org')tmdb=u.href}catch{}
 let justWatch=null;if(query&&/^[A-Za-z]{2}$/.test(region))try{const u=new URL('https://www.justwatch.com/'+region.toLowerCase()+'/search');u.searchParams.set('q',query);justWatch=u.href}catch{}
 return <section className="watch-providers" aria-label="Where to watch"><h2>Where to watch</h2><label className="watch-region">Country or region <select value={region} onChange={e=>{setRegion(e.target.value);try{localStorage.setItem('watch-region',e.target.value)}catch{}}}>{!regions.includes(region)&&<option value={region}>{region}</option>}{regions.map(r=><option key={r} value={r}>{r}</option>)}</select></label>{types.some(([key])=>selected?.[key]?.length)?types.map(([key,label])=>Array.isArray(selected?.[key])&&selected[key].length>0?<p key={key}><b>{label}:</b> {selected[key].map(p=>{const name=typeof p?.provider_name==='string'?p.provider_name.trim():null;return name}).filter(Boolean).map((name,i)=><span key={i+'-'+name}>{i>0&&', '}{name}</span>)}</p>:null):<p>No viewing information available for this region.</p>}{(tmdb||justWatch)&&<div className="watch-links">{tmdb&&<a className="pill" href={tmdb} target="_blank" rel="noreferrer">View watching options on TMDB</a>}{justWatch&&<a className="pill" href={justWatch} target="_blank" rel="noreferrer">Search on JustWatch</a>}</div>}<p className="watch-attribution">Availability data provided by JustWatch. Updated {new Date(data.updatedAt).toLocaleDateString()}.</p></section>
}
