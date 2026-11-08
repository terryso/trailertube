let pending;
export function loadYouTubeIframeAPI(){
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(pending)return pending;
 pending=new Promise((resolve,reject)=>{
  const previous=window.onYouTubeIframeAPIReady;let script=document.querySelector('script[data-trailertube-youtube-api]'),timer;
  const cleanup=()=>{clearTimeout(timer);script?.removeEventListener('error',fail);if(window.onYouTubeIframeAPIReady===ready)window.onYouTubeIframeAPIReady=previous};
  const fail=()=>{cleanup();script?.remove();pending=null;reject(new Error('YouTube player could not be loaded.'))};
  const ready=()=>{try{previous?.()}finally{cleanup();window.YT?.Player?resolve(window.YT):fail()}};
  window.onYouTubeIframeAPIReady=ready;
  if(!script){script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.dataset.trailertubeYoutubeApi='true';document.head.appendChild(script)}
  script.addEventListener('error',fail,{once:true});timer=setTimeout(fail,15000);
 });
 return pending;
}
