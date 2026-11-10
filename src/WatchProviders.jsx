import {useEffect,useState} from 'react';
const types=[['flatrate','Subscription'],['free','Free'],['ads','With ads'],['rent','Rent'],['buy','Buy']];
// TMDB/JustWatch data carries no per-title provider links, so known providers
// link to their own site and the JustWatch title search carries the exact page.
const providerSites={
 'Netflix':'https://www.netflix.com',
 'Disney+':'https://www.disneyplus.com',
 'Prime Video':'https://www.primevideo.com',
 'Amazon Video':'https://www.primevideo.com',
 'Apple TV':'https://tv.apple.com',
 'Apple TV+':'https://tv.apple.com',
 'Apple TV Store':'https://tv.apple.com',
 'Fandango At Home':'https://athome.fandango.com',
 'Apple TV+':'https://tv.apple.com',
 'Max':'https://www.max.com',
 'HBO Max':'https://www.max.com',
 'Hulu':'https://www.hulu.com',
 'Peacock':'https://www.peacocktv.com',
 'Paramount+':'https://www.paramountplus.com',
 'Rakuten TV':'https://rakuten.tv',
 'Google Play Movies':'https://play.google.com/store/movies',
 'YouTube':'https://www.youtube.com/movies',
 'MUBI':'https://mubi.com',
 'Crave':'https://www.crave.ca',
 'NOW TV':'https://www.nowtv.com',
 'Hotstar':'https://www.hotstar.com',
 'JioHotstar':'https://www.hotstar.com'
};
export function WatchProviders({id,title}){
 const [data,setData]=useState(null),[region,setRegion]=useState(()=>{try{return localStorage.getItem('watch-region')||'US'}catch{return 'US'}});
 useEffect(()=>{let active=true;fetch('/data/watch-providers.json').then(r=>r.ok?r.json():null).then(x=>{if(active)setData(x)}).catch(()=>{});return()=>{active=false}},[]);
 const movie=data?.movies?.[id];if(!movie)return null;
 const query=typeof title==='string'&&title.trim()?title.trim():null;
 const regions=Object.keys(movie).filter(x=>/^[A-Z]{2}$/.test(x)).sort();
 const selected=movie[region];let link;try{const u=new URL(selected?.link);if(u.protocol==='https:'&&u.hostname==='www.themoviedb.org')link=u.href}catch{}
 const siteFor=name=>{if(typeof name!=='string')return null;const site=providerSites[name.trim()];if(!site)return null;try{const u=new URL(site);return u.protocol==='https:'?u.href:null}catch{return null}};
 let justWatch=null;if(query&&/^[A-Za-z]{2}$/.test(region))try{const u=new URL('https://www.justwatch.com/'+region.toLowerCase()+'/search');u.searchParams.set('q',query);justWatch=u.href}catch{}
 return <section className="watch-providers" aria-label="Where to watch"><h2>Where to watch</h2><label className="watch-region">Country or region <select value={region} onChange={e=>{setRegion(e.target.value);try{localStorage.setItem('watch-region',e.target.value)}catch{}}}>{!regions.includes(region)&&<option value={region}>{region}</option>}{regions.map(r=><option key={r} value={r}>{r}</option>)}</select></label>{types.some(([key])=>selected?.[key]?.length)?types.map(([key,label])=>Array.isArray(selected?.[key])&&selected[key].length>0?<p key={key}><b>{label}:</b> {selected[key].map(p=>{const name=typeof p?.provider_name==='string'?p.provider_name.trim():null;if(!name)return null;const href=siteFor(name);return {name,href}}).filter(Boolean).map((item,i)=><span key={i+'-'+item.name}>{i>0&&', '}{item.href?<a href={item.href} target="_blank" rel="noreferrer">{item.name}</a>:item.name}</span>)}</p>:null):<p>No viewing information available for this region.</p>}{link&&<p><a href={link} target="_blank" rel="noreferrer">View watching options on TMDB</a></p>}<p className="watch-attribution">Availability data provided by {justWatch?<a href={justWatch} target="_blank" rel="noreferrer">JustWatch</a>:'JustWatch'}. Updated {new Date(data.updatedAt).toLocaleDateString()}.</p></section>
}
