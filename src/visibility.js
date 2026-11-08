export function visibleMovies(movies,showAdult){return (movies||[]).filter(movie=>showAdult||!movie.adult)}
export function visiblePlaylists(playlists,showAdult){return (playlists||[]).map(playlist=>({...playlist,videos:visibleMovies(playlist.videos,showAdult)}))}
