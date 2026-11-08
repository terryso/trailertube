import {youtubeWatchUrl} from './youtube-link.js';

const validId=id=>typeof id==='string'&&/^[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id));
export function makePlaybackQueue(videos,selectedId,label){
 const items=[],seen=new Set();
 for(const video of videos||[]){const id=String(video?.id||'');if(!validId(id)||video.adult===true||!youtubeWatchUrl(video.trailer)||video.playable===false||seen.has(id))continue;seen.add(id);items.push({id,title:String(video.title||'Movie trailer'),frame:typeof video.frame==='string'?video.frame:'',cover:typeof video.cover==='string'?video.cover:'',duration:Number.isFinite(video.duration)&&video.duration>=0?video.duration:null,previewType:video.previewType==='Teaser'?'Teaser':null})}
 const index=items.findIndex(v=>v.id===String(selectedId));if(index<0)return null;
 const start=Math.max(0,index-50);return {version:1,label:String(label||'Current list').slice(0,100),items:items.slice(start,start+1000)};
}
export function readPlaybackQueue(value){
 try{const q=typeof value==='string'?JSON.parse(value):value;if(q?.version!==1||typeof q.label!=='string'||q.label.length>100||!Array.isArray(q.items)||q.items.length>1000)return null;const seen=new Set();for(const item of q.items){if(!validId(item?.id)||typeof item.title!=='string'||seen.has(item.id))return null;seen.add(item.id)}return q}catch{return null}
}
export function upcomingQueue(queue,currentId){const q=readPlaybackQueue(queue);if(!q)return null;const index=q.items.findIndex(x=>x.id===String(currentId));return index<0?null:{label:q.label,items:q.items.slice(index+1)};}
export function playerErrorMessage(code){switch(Number(code)){case 2:return 'This trailer link is invalid.';case 5:return 'The video could not be played in this player.';case 100:return 'This video is unavailable or private.';case 101:case 150:return 'The video owner does not allow embedded playback.';case 153:return 'YouTube could not verify the player request.';default:return 'This trailer could not be played.'}}

// Catalog state is re-read before advancing; network errors stop the queue.
export async function resolveNextCandidate(items,load,isCurrent=()=>true){
 let skipped=0;for(const item of items){let candidate;try{candidate=await load(item.id)}catch{return isCurrent()?{status:'error'}:{status:'cancelled'}}if(!isCurrent())return {status:'cancelled'};if(candidate&&String(candidate.id)!==item.id)return {status:'error'};if(!candidate||candidate.adult||!youtubeWatchUrl(candidate.trailer)||candidate.playable===false){skipped++;continue}return {status:'ready',video:candidate,skipped}}return isCurrent()?{status:'exhausted',skipped}:{status:'cancelled'};
}

export function isPlayerMostlyVisible(rect,width,height){
 if(!rect||width<=0||height<=0||rect.width<=0||rect.height<=0)return false;const visibleWidth=Math.max(0,Math.min(rect.right,width)-Math.max(rect.left,0)),visibleHeight=Math.max(0,Math.min(rect.bottom,height)-Math.max(rect.top,0));return visibleWidth*visibleHeight/(rect.width*rect.height)>0.5;
}
