export function youtubeWatchUrl(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id)?`https://www.youtube.com/watch?v=${id}`:null}
