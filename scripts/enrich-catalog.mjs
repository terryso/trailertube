import {readFile,writeFile,rename} from 'node:fs/promises';
import {enrichYouTube,googleOAuthTokenProvider,readYouTubeKey,readYouTubeOAuthFile} from './youtube-data.mjs';
const key=await readYouTubeKey();const file=await readYouTubeOAuthFile();
if(!key&&!file)throw new Error('Set YOUTUBE_API_KEY or YOUTUBE_OAUTH_TOKEN_FILE.');
const path='public/data/catalog.json',catalog=JSON.parse(await readFile(path,'utf8'));
if(catalog.shards)throw new Error('Use the collector to enrich a sharded catalog.');
const ids=catalog.movies.map(m=>m.trailer).filter(Boolean);const data=await enrichYouTube(ids,{key,getToken:file?googleOAuthTokenProvider(file):undefined});
for(const movie of catalog.movies){const video=data.get(movie.trailer);if(video){movie.duration=video.duration;movie.views=video.views??null;movie.playable=video.available;movie.regionRestriction=video.regionRestriction;}}
catalog.youtubeChecked=catalog.movies.filter(x=>typeof x.playable==='boolean').length;
catalog.durationCount=catalog.movies.filter(x=>typeof x.duration==='number'&&x.playable!==false).length;
await writeFile(path+'.tmp',JSON.stringify(catalog));await rename(path+'.tmp',path);
console.log(JSON.stringify({movies:catalog.movies.length,youtubeChecked:catalog.youtubeChecked,durationCount:catalog.durationCount,available:catalog.movies.filter(m=>m.playable===true).length}));
