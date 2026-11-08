import {useEffect,useState} from 'react';
import {UserRound} from 'lucide-react';
import {formatViews} from './format-views.js';

function releaseDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const parsed=new Date(value+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return null;
 return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(parsed);
}
function movieRuntime(minutes){if(!Number.isSafeInteger(minutes)||minutes<=0||minutes>3000)return null;const h=Math.floor(minutes/60),m=minutes%60;return [h?`${h} hr`:null,m?`${m} min`:null].filter(Boolean).join(' ')}
const people=entries=>Array.isArray(entries)?entries.filter(p=>Number.isSafeInteger(p?.id)&&p.id>0&&typeof p.name==='string'&&p.name.trim()).slice(0,8):[];
function profileUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='image.tmdb.org'&&!u.username&&!u.password&&!u.port&&/^\/t\/p\/w185\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(u.pathname)?u.href:''}catch{return ''}}
function Portrait({person}){const src=profileUrl(person.photo),[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return <span className="credit-avatar">{src&&!failed?<img src={src} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<UserRound aria-hidden="true"/>}</span>}
function CreditList({entries,showCharacter,Link,go,adult}){return <ul className="credit-list">{entries.map(person=>{const content=<><Portrait person={person}/><span className="credit-copy"><b>{person.name.trim()}</b>{showCharacter&&typeof person.character==='string'&&person.character.trim()&&<span>{person.character.trim()}</span>}</span></>;return <li key={person.id}>{Link&&go&&!adult?<Link className="credit-card" to={'/person/'+person.id} go={go}>{content}</Link>:<div className="credit-card">{content}</div>}</li>})}</ul>}
export function MovieDetails({movie,categories=[],Link,go}){
 const release=releaseDate(movie.createdAt),runtime=movieRuntime(movie.runtimeMinutes),views=formatViews(movie.views),genreNames=(Array.isArray(movie.genreIds)?movie.genreIds:[]).map(id=>categories.find(g=>String(g.id)===String(id))?.name).filter(Boolean);
 const directors=movie.creditsSource==='tmdb'?people(movie.directors):[],cast=movie.creditsSource==='tmdb'?people(movie.cast):[];
 return <section className="movie-details" aria-label="Movie details"><div className="movie-details-heading"><h2>About this film</h2>{views&&<span className="sub">Trailer · {views}</span>}</div><p className="movie-synopsis">{movie.description?.trim()||'No synopsis available.'}</p>
 {(release||genreNames.length>0||runtime)&&<dl className="movie-facts">{release&&<div><dt>Release date</dt><dd><time dateTime={movie.createdAt}>{release}</time></dd></div>}{genreNames.length>0&&<div><dt>Genres</dt><dd>{genreNames.join(' · ')}</dd></div>}{runtime&&<div><dt>Runtime</dt><dd>{runtime}</dd></div>}</dl>}
 {directors.length>0&&<div className="movie-credit"><h3>{directors.length===1?'Director':'Directors'}</h3><CreditList entries={directors} Link={Link} go={go} adult={movie.adult}/></div>}
 {cast.length>0&&<div className="movie-credit"><h3>Cast</h3><CreditList entries={cast} showCharacter Link={Link} go={go} adult={movie.adult}/></div>}
 <p className="movie-source">Movie information from <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a>.</p></section>;
}
