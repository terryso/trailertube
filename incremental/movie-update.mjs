import {movieTitle} from '../src/movie-title.js';
import {tmdbMovieMetadata} from '../src/movie-metadata.js';
import {previewCandidates} from '../scripts/trailer-selection.mjs';

/** Convert TMDB detail data and verified YouTube status into one catalog update. */
export async function prepareMovieUpdate(detail, oldEntry, verifyVideos, {trackCredits=false}={}) {
  if(!Number.isSafeInteger(detail?.id)||detail.id<1||typeof detail.adult!=='boolean'||!Array.isArray(detail.genres)||typeof verifyVideos!=='function')throw new Error('Incomplete TMDB movie details');
  const date=detail.release_date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Missing movie release date');
  const title=movieTitle(detail);if(typeof title!=='string'||!title.trim())throw new Error('Missing movie title');
  const candidates=previewCandidates(detail.videos?.results);const ids=[...new Set([...candidates.map(x=>x.key),...(oldEntry?.trailer?[oldEntry.trailer]:[])])];
  const verified=ids.length?await verifyVideos(ids):new Map();
  for(const id of ids)if(typeof verified.get(id)?.available!=='boolean')throw new Error('Incomplete YouTube verification');
  const selected=candidates.find(x=>verified.get(x.key).available)||(oldEntry?.trailer&&verified.get(oldEntry.trailer).available?{key:oldEntry.trailer,type:oldEntry.previewType||'Trailer'}:null);
  const video=selected?verified.get(selected.key):null;
  return {...tmdbMovieMetadata(detail,oldEntry||{}),...(trackCredits?{creditsTracked:true}:{}),id:String(detail.id),adult:detail.adult,title,description:detail.overview||'',createdAt:date,genreIds:detail.genres.map(x=>String(x.id)),popularity:detail.popularity||0,rating:detail.vote_average||0,cover:detail.backdrop_path?`https://image.tmdb.org/t/p/w780${detail.backdrop_path}`:detail.poster_path?`https://image.tmdb.org/t/p/w500${detail.poster_path}`:'',poster:detail.poster_path?`https://image.tmdb.org/t/p/w500${detail.poster_path}`:'',trailer:selected?.key||null,previewType:selected?.type||null,duration:video?.duration??null,views:video?.views??null,playable:video?.available??null,regionRestriction:video?.regionRestriction??null,trailerChecked:true};
}
