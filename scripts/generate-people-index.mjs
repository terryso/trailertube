import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const read=async path=>JSON.parse(await readFile(path,'utf8'));
const safePerson=p=>Number.isSafeInteger(p?.id)&&p.id>0&&typeof p.name==='string'&&p.name.trim();
const safePhoto=s=>{try{const u=new URL(s);return u.protocol==='https:'&&u.hostname==='image.tmdb.org'&&/^\/t\/p\/w185\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(u.pathname)?u.href:''}catch{return ''}};
async function atomic(path,data){await writeFile(path+'.tmp',JSON.stringify(data));await rename(path+'.tmp',path)}
export async function generatePeopleIndex(site){
 const dir=join(site,'data'),manifest=await read(join(dir,'catalog.json'));
 if(manifest.shardBy!=='id-modulo-v2'||!manifest.generatedAt||!Array.isArray(manifest.shards)||manifest.shards.length!==64||!Array.isArray(manifest.stateShards)||manifest.stateShards.length!==64)throw Error('Unsupported catalog for people index');
 const people=new Map(),seenMovies=new Set();let moviesWithCredits=0;
 for(let i=0;i<64;i++){
  const suffix=String(i).padStart(4,'0');if(manifest.shards[i]!==`catalog-${suffix}.json`||manifest.stateShards[i]!==`state-${suffix}.json`)throw Error('Invalid people index shard');
  const [movies,states]=await Promise.all([read(join(dir,manifest.shards[i])),read(join(dir,manifest.stateShards[i]))]);if(!Array.isArray(movies)||!Array.isArray(states))throw Error('Invalid people source');const byId=new Map(states.map(s=>[String(s.id),s]));
  for(const movie of movies){const id=String(movie.id);if(!/^[1-9]\d*$/.test(id)||Number(id)%64!==i||seenMovies.has(id)||movie.adult===true)throw Error('Invalid movie in people source');seenMovies.add(id);if(movie.creditsSource!=='tmdb')continue;
   const directors=Array.isArray(movie.directors)?movie.directors.filter(safePerson):[],cast=Array.isArray(movie.cast)?movie.cast.filter(safePerson):[];if(!directors.length&&!cast.length)continue;moviesWithCredits++;const state=byId.get(id)||{};
   const film={id,title:typeof movie.title==='string'?movie.title:'',createdAt:typeof movie.createdAt==='string'?movie.createdAt:'',genreIds:Array.isArray(movie.genreIds)?movie.genreIds:[],cover:movie.cover||'',poster:movie.poster||'',trailer:state.trailer||null,previewType:state.previewType||null,duration:state.duration??null,playable:state.playable??null,trailerChecked:state.trailerChecked===true};
   for(const [kind,list] of [['director',directors],['cast',cast]])for(const item of list){let person=people.get(item.id);if(!person){person={id:item.id,name:item.name.trim(),photo:safePhoto(item.photo),films:new Map()};people.set(item.id,person)}else if(!person.photo)person.photo=safePhoto(item.photo);let role=person.films.get(id);if(!role){role={...film,roles:[],character:''};person.films.set(id,role)}if(!role.roles.includes(kind))role.roles.push(kind);if(kind==='cast'&&!role.character&&typeof item.character==='string')role.character=item.character.trim().slice(0,200)}
  }
 }
 if(Number.isSafeInteger(manifest.count)&&seenMovies.size!==manifest.count)throw Error('People index movie count mismatch');
 const after=await read(join(dir,'catalog.json'));if(after.generatedAt!==manifest.generatedAt)throw Error('Catalog changed while indexing people');
 const buckets=Array.from({length:64},()=>[]);for(const person of people.values()){const films=[...person.films.values()].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||Number(b.id)-Number(a.id));buckets[person.id%64].push({id:person.id,name:person.name,photo:person.photo,films})}
 const target=join(dir,'people');await mkdir(target,{recursive:true});const shards=[];for(let i=0;i<64;i++){const name=`people/person-${String(i).padStart(4,'0')}.json`;buckets[i].sort((a,b)=>a.id-b.id);await atomic(join(dir,name),{generatedAt:manifest.generatedAt,people:buckets[i]});shards.push(name)}
 const ids=[...people.keys()].sort((a,b)=>a-b),sampleIds=ids.length?[ids[0],...(ids.length>1?[ids.at(-1)]:[])]:[];await atomic(join(dir,'people-manifest.json'),{generatedAt:manifest.generatedAt,count:people.size,moviesWithCredits,shards,sampleIds});return {people:people.size,moviesWithCredits};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(await generatePeopleIndex(resolve(process.argv[2]||'dist')));
