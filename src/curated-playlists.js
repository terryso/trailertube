// Lists are computed from available TMDB genre and popularity data.
const DEFINITIONS=[
 {id:'recently-released',section:'Start here',title:'Recently released movie trailers',description:'Trailers for recently released movies, ordered by movie release date.',sort:'release'},
 {id:'popular-trailers',section:'Start here',title:'Popular movie trailers',description:'A selection of available trailers, ordered by TMDB popularity.'},
 {id:'action-adventure',section:'Start here',title:'Action & adventure',description:'Popular action and adventure films, from high-stakes missions to faraway journeys.',genres:['28','12']},
 {id:'science-fiction',section:'Start here',title:'Science fiction',description:'Explore popular science-fiction films and their available trailers.',genres:['878']},
 {id:'animation',section:'Start here',title:'Animation',description:'A selection of animated films, ordered by TMDB popularity.',genres:['16']},
 {id:'crime-mystery',section:'Explore genres',title:'Crime & mystery',description:'Popular crime and mystery film trailers.',genres:['80','9648']},
 {id:'horror',section:'Explore genres',title:'Horror',description:'A selection of horror film trailers for a darker movie night.',genres:['27']},
 {id:'comedy',section:'Explore genres',title:'Comedy',description:'Popular comedy trailers from the available catalog.',genres:['35']},
 {id:'drama',section:'Explore genres',title:'Drama',description:'Explore popular drama films and their available trailers.',genres:['18']},
 {id:'fantasy',section:'Explore genres',title:'Fantasy',description:'Stories of imagined worlds, magic and myth, selected by genre.',genres:['14']},
 {id:'family',section:'Explore genres',title:'Family films',description:'A selection of popular family film trailers.',genres:['10751']},
 {id:'romance',section:'Explore genres',title:'Romance',description:'Popular romance films and their available trailers.',genres:['10749']},
 {id:'documentary',section:'Explore genres',title:'Documentary',description:'Documentary film trailers available in the catalog.',genres:['99']},
];
export function makeCuratedPlaylists(movies){
 const available=movies.filter(m=>m.trailer&&m.playable!==false).sort((a,b)=>(Number(b.popularity)||0)-(Number(a.popularity)||0)||Number(b.id)-Number(a.id));
 return DEFINITIONS.map(def=>{const matches=available.filter(m=>!def.genres||def.genres.some(id=>m.genreIds.includes(id)));if(def.sort==='release')matches.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||Number(b.id)-Number(a.id));return {...def,videos:matches.slice(0,12)}}).filter(list=>list.videos.length>0);
}
