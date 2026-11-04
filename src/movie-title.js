export function movieTitle(movie){
 for(const value of [movie.title,movie.original_title])if(typeof value==='string'&&value.trim())return value.trim();
 return `Untitled film (TMDB ${movie.id})`;
}
