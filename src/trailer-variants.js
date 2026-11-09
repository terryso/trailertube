import {youtubeWatchUrl} from './youtube-link.js';

// Data must be explicitly verified by the YouTube metadata check. The legacy
// primary trailer remains usable when a movie has no pilot variants.
export function validTrailerVariants(value){
 if(!Array.isArray(value))return [];const seen=new Set(),out=[];
 for(const item of value){if(!item||!youtubeWatchUrl(item.key)||seen.has(item.key)||item.available!==true||!['public','unlisted'].includes(item.privacyStatus)||!['Trailer','Teaser'].includes(item.type)||typeof item.name!=='string'||!item.name.trim()||typeof item.verifiedAt!=='string'||!Number.isFinite(Date.parse(item.verifiedAt)))continue;seen.add(item.key);out.push({...item,name:item.name.trim().slice(0,160),language:typeof item.language==='string'&&/^[a-z]{2}$/.test(item.language)?item.language:null,official:item.official===true,duration:Number.isSafeInteger(item.duration)&&item.duration>0?item.duration:null});if(out.length===10)break}return out;
}
export function trailerChoices(movie){
 const variants=validTrailerVariants(movie?.trailerVariants),primary=movie?.trailer;if(!youtubeWatchUrl(primary)||movie.playable===false)return variants;
 if(variants.some(v=>v.key===primary))return variants;
 return [{key:primary,name:'Current trailer',type:movie.previewType==='Teaser'?'Teaser':'Trailer',available:true,legacy:true},...variants];
}
