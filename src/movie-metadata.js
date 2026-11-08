// TMDB movie runtime is in minutes; trailer duration is a separate YouTube field in seconds.
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,200):'';
const validPerson=person=>Number.isSafeInteger(person?.id)&&person.id>0&&clean(person.name);
const profile=person=>typeof person.profile_path==='string'&&/^\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(person.profile_path)?`https://image.tmdb.org/t/p/w185${person.profile_path}`:'';
export function tmdbMovieMetadata(detail,old={}){
 const metadata={};
 if(Object.hasOwn(detail,'runtime')){
  if(Number.isSafeInteger(detail.runtime)&&detail.runtime>0&&detail.runtime<=3000)metadata.runtimeMinutes=detail.runtime;
  else if(detail.runtime===0||detail.runtime===null)metadata.runtimeMinutes=null;
 }
 const credits=detail.credits,correctId=credits?.id==null||Number(credits.id)===Number(detail.id);
 if(correctId&&Array.isArray(credits?.crew)&&Array.isArray(credits?.cast)){
  const directors=[],seen=new Set();for(const person of credits.crew){if(person.job!=='Director'||!validPerson(person)||seen.has(person.id))continue;seen.add(person.id);directors.push({id:person.id,name:clean(person.name),photo:profile(person)});if(directors.length===5)break}
  const cast=[],actors=new Set();for(const person of [...credits.cast].sort((a,b)=>(Number.isSafeInteger(a?.order)?a.order:Infinity)-(Number.isSafeInteger(b?.order)?b.order:Infinity))){if(!validPerson(person)||actors.has(person.id))continue;actors.add(person.id);cast.push({id:person.id,name:clean(person.name),character:clean(person.character),photo:profile(person)});if(cast.length===8)break}
  Object.assign(metadata,{directors,cast,creditsSource:'tmdb'});
 }
 // Absent or malformed credits never replace previously verified information.
 return {...(old.runtimeMinutes!==undefined?{runtimeMinutes:old.runtimeMinutes}:{}),...(old.creditsSource==='tmdb'?{directors:old.directors,cast:old.cast,creditsSource:'tmdb'}:{}),...metadata};
}
