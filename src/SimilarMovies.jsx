import {useEffect,useState} from 'react';
import {recommendMovies} from './similar-movies.js';
let cachedVersion='',cachedPromise;
function loadSimilar(version){
 if(cachedVersion===version&&cachedPromise)return cachedPromise;
 cachedVersion=version;cachedPromise=fetch('/data/similar-movies.json').then(async r=>{if(!r.ok)throw Error('Recommendations unavailable');const index=await r.json();if(index.version!==1||index.generatedAt!==version||!Array.isArray(index.movies))throw Error('Recommendations do not match catalog');return index}).catch(e=>{cachedPromise=null;throw e});return cachedPromise;
}
export function SimilarMovies({movie,version,categories,renderCard}){
 const [state,setState]=useState({id:'',items:[]});
 useEffect(()=>{let active=true;setState({id:String(movie.id),items:[]});if(!version||!movie.genreIds?.length)return()=>{active=false};loadSimilar(version).then(index=>{if(active)setState({id:String(movie.id),items:recommendMovies(movie,index,categories)})}).catch(()=>{});return()=>{active=false}},[movie.id,movie.createdAt,movie.genreIds,version,categories]);
 const items=state.id===String(movie.id)?state.items:[];if(!items.length)return null;
 const names=new Map(categories.map(category=>[String(category.id),category.name]));const videos=items.map(({movie})=>({...movie,categoryId:movie.genreIds[0]||'',uploader:movie.genreIds.map(id=>names.get(String(id))).filter(Boolean).join(' · ')}));
 return <section className="similar-movies" aria-label="More like this"><h2>More like this</h2><p className="similar-subtitle">Explore more trailers with similar genres</p><div className="similar-grid">{items.map((item,index)=><div className="similar-item" key={item.movie.id}>{renderCard(videos[index],videos)}<p className="similar-reason">{item.reason}</p></div>)}</div></section>;
}
