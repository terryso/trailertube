// Compact, snapshot-bound movie search data. All content stays on the client;
// the user's query is not sent as a URL parameter to the static data files.
// Punctuation runs fold to spaces so "spider man" matches "Spider-Man" and
// "Brand New Day" matches "Brand-New Day"; scripts (Han etc.) are letters.
export const normalizeSearch=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const prefixes=[['https://image.tmdb.org/t/p/w780/','~7/'],['https://image.tmdb.org/t/p/w500/','~5/']];
function compactImage(value){if(typeof value!=='string')return '';for(const [full,short] of prefixes)if(value.startsWith(full))return short+value.slice(full.length);return value}
function expandImage(value){if(typeof value!=='string')return '';for(const [full,short] of prefixes)if(value.startsWith(short))return full+value.slice(short.length);return value}
// v2 drops description and poster from the 16-field v1 record: they dominated
// the ~26MB index while search cards render fine from title, cover and stats.
// Version 1 data no longer decodes; the catalog client falls back to feed
// shards until the regenerated v2 index is deployed.
export const SEARCH_RECORD_VERSION=2;
export function encodeSearchMovie(m){return [m.id,m.title,m.originalTitle||'',m.createdAt||'',m.genreIds||[],compactImage(m.cover),m.trailer||null,m.previewType||null,m.duration??null,m.views??null,m.playable??null,m.regionRestriction??null,m.trailerChecked===true,Number(m.popularity)||0]}
export function decodeSearchMovie(v){if(!Array.isArray(v)||v.length!==14||typeof v[0]!=='string'||!/^[1-9]\d*$/.test(v[0])||!Number.isSafeInteger(Number(v[0]))||typeof v[1]!=='string'||!Array.isArray(v[4]))throw Error('Invalid search record');return {id:v[0],title:v[1],originalTitle:typeof v[2]==='string'?v[2]:'',description:'',createdAt:typeof v[3]==='string'?v[3]:'',genreIds:v[4],cover:expandImage(v[5]),poster:'',trailer:v[6],previewType:v[7],duration:v[8],views:v[9],playable:v[10],regionRestriction:v[11],trailerChecked:v[12]===true,popularity:Number(v[13])||0}}
export function movieSearchRank(movie,query){const q=normalizeSearch(query),title=normalizeSearch(movie.title),original=normalizeSearch(movie.originalTitle);if(!q)return -1;if(title===q)return 0;if(original&&original===q)return 1;const prefix=(text)=>text.startsWith(q)&&(!text[q.length]||!/\p{L}|\p{N}/u.test(text[q.length]));if(prefix(title))return 2;if(original&&prefix(original))return 3;if(title.includes(q))return 4;if(original&&original.includes(q))return 5;if(normalizeSearch(movie.description).includes(q))return 6;return -1}
export function shouldSuggest(query){const s=String(query||'').trim();return [...s].length>=2||(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(s)&&[...s].length>=1)}
export function rankSuggestions(records,query,limit=6){const q=normalizeSearch(query);if(!q)return [];const buckets=[[],[],[],[]];for(const row of records){const title=row.searchTitle??normalizeSearch(row.title),original=row.searchOriginal??normalizeSearch(row.originalTitle);let rank=title===q?0:original&&original===q?1:title.startsWith(q)?2:original&&original.startsWith(q)?3:-1;if(rank>=0)buckets[rank].push(row)}return buckets.flat().slice(0,limit)}
export function rankPeople(records,query,limit=24){const q=normalizeSearch(query);if(!q)return [];const buckets=[[],[],[]];for(const person of records){const name=normalizeSearch(person.name);const rank=name===q?0:name.startsWith(q)?1:name.includes(q)?2:-1;if(rank>=0)buckets[rank].push(person)}return buckets.flat().slice(0,limit)}
