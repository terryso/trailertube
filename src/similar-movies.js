// Recommendations use verified catalog membership and shared movie genres.
// This is a discovery aid, not a claim about personal taste.
export function recommendMovies(movie, index, categories, limit=6){
 if(!movie||!Array.isArray(movie.genreIds)||!Array.isArray(index?.movies)||!limit)return [];
 const genres=new Set(movie.genreIds.map(String)),year=Number(String(movie.createdAt||'').slice(0,4));
 if(!genres.size)return [];
 const names=new Map((categories||[]).map(g=>[String(g.id),g.name]));
 return index.movies.flatMap(candidate=>{
  if(!candidate||String(candidate.id)===String(movie.id)||candidate.adult===true||!candidate.trailer||candidate.playable===false||!Array.isArray(candidate.genreIds))return [];
  const shared=candidate.genreIds.map(String).filter(id=>genres.has(id));if(!shared.length)return [];
  const label=shared.map(id=>names.get(id)).find(Boolean);if(!label)return [];
  const otherYear=Number(String(candidate.createdAt||'').slice(0,4));
  return [{movie:candidate,reason:`Also ${label}`,shared:shared.length,distance:year&&otherYear?Math.abs(year-otherYear):Infinity}];
 }).sort((a,b)=>b.shared-a.shared||Number(b.movie.playable===true)-Number(a.movie.playable===true)||a.distance-b.distance||(Number(b.movie.popularity)||0)-(Number(a.movie.popularity)||0)||Number(b.movie.id)-Number(a.movie.id)).slice(0,limit);
}
