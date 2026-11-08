// Display groups organize TMDB's original genre labels; a movie can belong to several genres.
export const GENRE_GROUPS = [
 {name:'Action, Adventure & War',ids:['28','12','53','10752','37']},
 {name:'Drama, Comedy & Romance',ids:['18','35','10749','10751']},
 {name:'Fantasy, Sci-Fi & Animation',ids:['14','878','16']},
 {name:'Crime, Mystery & Horror',ids:['80','9648','27']},
 {name:'Documentary, History & More',ids:['99','36','10402','10770']},
];
export function groupCategoryLabel(id){return GENRE_GROUPS.find(group=>group.ids.join(',')===id)?.name||''}
