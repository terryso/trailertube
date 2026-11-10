import {useEffect,useState} from 'react';
const types=[['flatrate','Subscription'],['free','Free'],['ads','With ads'],['rent','Rent'],['buy','Buy']];
// TMDB/JustWatch data carries no per-title provider links, so known providers
// link to their own site (lowercase keys, "… with Ads" tiers stripped) and any
// other provider falls back to the TMDB watch page for that title and region,
// which carries the exact per-provider links.
const providerSites={
 'netflix':'https://www.netflix.com',
 'disney+':'https://www.disneyplus.com',
 'disney plus':'https://www.disneyplus.com',
 'prime video':'https://www.primevideo.com',
 'amazon prime video':'https://www.primevideo.com',
 'amazon video':'https://www.primevideo.com',
 'apple tv':'https://tv.apple.com',
 'apple tv+':'https://tv.apple.com',
 'apple tv store':'https://tv.apple.com',
 'fandango at home':'https://athome.fandango.com',
 'max':'https://www.max.com',
 'hbo max':'https://www.max.com',
 'hulu':'https://www.hulu.com',
 'peacock':'https://www.peacocktv.com',
 'paramount+':'https://www.paramountplus.com',
 'rakuten tv':'https://rakuten.tv',
 'google play movies':'https://play.google.com/store/movies',
 'youtube':'https://www.youtube.com/movies',
 'mubi':'https://mubi.com',
 'crave':'https://www.crave.ca',
 'now tv':'https://www.nowtv.com',
 'hotstar':'https://www.hotstar.com',
 'jiohotstar':'https://www.hotstar.com',
 'fubotv':'https://www.fubo.tv',
 'mgm+':'https://www.mgmplus.com',
 'mgm plus':'https://www.mgmplus.com',
 'philo':'https://www.philo.com',
 'viaplay':'https://viaplay.com',
 'osn+':'https://www.osnplus.com',
 'chili':'https://www.chili.com',
 'pathé thuis':'https://www.pathe-thuis.nl',
 'sf anytime':'https://www.sfanytime.com'
};
export function providerHref(name,tmdbWatchLink){
 if(typeof name!=='string'||!name.trim())return null;
 const site=providerSites[name.trim().toLowerCase().replace(/\s+with ads$/,'')];
 if(site)try{const u=new URL(site);if(u.protocol==='https:')return u.href}catch{}
 if(typeof tmdbWatchLink==='string')try{const u=new URL(tmdbWatchLink);if(u.protocol==='https:'&&u.hostname==='www.themoviedb.org')return u.href}catch{}
 return null;
}
export function WatchProviders({id,title}){
 const [data,setData]=useState(null),[region,setRegion]=useState(()=>{try{return localStorage.getItem('watch-region')||'US'}catch{return 'US'}});
 useEffect(()=>{let active=true;fetch('/data/watch-providers.json').then(r=>r.ok?r.json():null).then(x=>{if(active)setData(x)}).catch(()=>{});return()=>{active=false}},[]);
 const movie=data?.movies?.[id];if(!movie)return null;
 const query=typeof title==='string'&&title.trim()?title.trim():null;
 const regions=Object.keys(movie).filter(x=>/^[A-Z]{2}$/.test(x)).sort();
 const selected=movie[region];let link;try{const u=new URL(selected?.link);if(u.protocol==='https:'&&u.hostname==='www.themoviedb.org')link=u.href}catch{}
 const siteFor=name=>providerHref(name,selected?.link);
 let justWatch=null;if(query&&/^[A-Za-z]{2}$/.test(region))try{const u=new URL('https://www.justwatch.com/'+region.toLowerCase()+'/search');u.searchParams.set('q',query);justWatch=u.href}catch{}
 return <section className="watch-providers" aria-label="Where to watch"><h2>Where to watch</h2><label className="watch-region">Country or region <select value={region} onChange={e=>{setRegion(e.target.value);try{localStorage.setItem('watch-region',e.target.value)}catch{}}}>{!regions.includes(region)&&<option value={region}>{region}</option>}{regions.map(r=><option key={r} value={r}>{r}</option>)}</select></label>{types.some(([key])=>selected?.[key]?.length)?types.map(([key,label])=>Array.isArray(selected?.[key])&&selected[key].length>0?<p key={key}><b>{label}:</b> {selected[key].map(p=>{const name=typeof p?.provider_name==='string'?p.provider_name.trim():null;if(!name)return null;const href=siteFor(name);return {name,href}}).filter(Boolean).map((item,i)=><span key={i+'-'+item.name}>{i>0&&', '}{item.href?<a href={item.href} target="_blank" rel="noreferrer">{item.name}</a>:item.name}</span>)}</p>:null):<p>No viewing information available for this region.</p>}{link&&<p><a href={link} target="_blank" rel="noreferrer">View watching options on TMDB</a></p>}<p className="watch-attribution">Availability data provided by {justWatch?<a href={justWatch} target="_blank" rel="noreferrer">JustWatch</a>:'JustWatch'}. Updated {new Date(data.updatedAt).toLocaleDateString()}.</p></section>
}
