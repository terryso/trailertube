import {GENRE_GROUPS} from './genre-groups.js';
export const playableTrailer = movie => Boolean(movie.trailer)&&movie.playable!==false;
export function newestFirst(a,b){return a.createdAt===b.createdAt?Number(b.id)-Number(a.id):a.createdAt<b.createdAt?1:-1}
export function buildCatalogOverview(movies,genres){
 const counts=new Map(),groupCounts=new Map();let feedCount=0,durationCount=0,youtubeChecked=0,playableCount=0;
 for(const m of movies){
  if(typeof m.playable==='boolean')youtubeChecked++;
  if(m.playable===true)playableCount++;
  if(!playableTrailer(m))continue;
  feedCount++;if(typeof m.duration==='number')durationCount++;
  if(!m.genreIds.length)counts.set('uncategorized',(counts.get('uncategorized')||0)+1);
  for(const id of m.genreIds)counts.set(id,(counts.get(id)||0)+1);
  for(const group of GENRE_GROUPS)if(group.ids.some(id=>m.genreIds.includes(id)))groupCounts.set(group.name,(groupCounts.get(group.name)||0)+1);
 }
 const categories=[...genres.map(g=>({id:String(g.id),name:g.name,parentId:'0',count:counts.get(String(g.id))||0})),{id:'uncategorized',name:'Uncategorized',parentId:'0',count:counts.get('uncategorized')||0}];
 const used=new Set(GENRE_GROUPS.flatMap(g=>g.ids));
 const groups=GENRE_GROUPS.map(g=>({...g,id:g.ids.join(','),count:groupCounts.get(g.name)||0,children:g.ids.map(id=>categories.find(c=>c.id===id)).filter(Boolean)})).filter(g=>g.children.length);
 const other=categories.filter(c=>!used.has(c.id));
 if(other.length)groups.push({name:'More genres',id:other.map(c=>c.id).join(','),count:movies.filter(m=>playableTrailer(m)&&(!m.genreIds.length||m.genreIds.some(id=>!used.has(id)))).length,children:other});
 return {categories,groups,feedCount,durationCount,youtubeChecked,playableCount};
}
