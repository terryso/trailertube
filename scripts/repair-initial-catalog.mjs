import {readFile,writeFile,appendFile,rename} from 'node:fs/promises';
import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from './youtube-data.mjs';
import {repairUnavailableTrailers} from './trailer-selection.mjs';
const path='public/data/catalog.json',catalog=JSON.parse(await readFile(path,'utf8'));
if(!catalog.movies)throw new Error('The initial catalog must be inline.');
const tmdbKey=process.env.TMDB_API_KEY,key=await readYouTubeKey(),file=await readYouTubeOAuthFile();
if(!tmdbKey||(!key&&!file))throw new Error('TMDB and YouTube credentials are required.');
const options={key,getToken:file?googleOAuthTokenProvider(file):undefined},records=new Map();
for(const line of (await readFile('.cache/trailers.jsonl','utf8')).split('\n'))if(line){const record=JSON.parse(line);records.set(record.id,record)}
let youtube=await enrichYouTube([],options);
const languages='en,ko,fr,es,de,ja,zh,hi,pt,it,ru,ar,tr,pl,nl,sv,id,th,uk,vi,da,fi,no,he,el,ro,hu,cs,fa,ta,te,ml,bn,mr,ur,ms,ca,et,lv,lt,null';
const repaired=await repairUnavailableTrailers(catalog.movies,records,youtube,{fetchCandidates:async m=>{const u=new URL(`https://api.themoviedb.org/3/movie/${m.id}/videos`);u.search=new URLSearchParams({api_key:tmdbKey,include_video_language:languages});const r=await fetch(u);if(!r.ok)throw new Error('TMDB request failed');return r.json()},enrich:ids=>enrichYouTube(ids,options),saveRecord:record=>appendFile('.cache/trailers.jsonl',JSON.stringify(record)+'\n')});
if(repaired.failures)throw new Error(`Fallback verification failed for ${repaired.failures} entries`);
youtube=repaired.metadata;
for(const movie of catalog.movies){const record=records.get(Number(movie.id)),video=youtube.get(record?.trailer);if(record)movie.trailer=record.trailer;if(video){movie.duration=video.duration;movie.views=video.views??null;movie.playable=video.available;movie.regionRestriction=video.regionRestriction}}
catalog.youtubeChecked=catalog.movies.filter(x=>typeof x.playable==='boolean').length;catalog.durationCount=catalog.movies.filter(x=>typeof x.duration==='number'&&x.playable!==false).length;
await writeFile(path+'.tmp',JSON.stringify(catalog));await rename(path+'.tmp',path);
console.log(JSON.stringify({replaced:repaired.replaced,movies:catalog.movies.length,youtubeChecked:catalog.youtubeChecked,playable:catalog.movies.filter(m=>m.playable===true).length}));
