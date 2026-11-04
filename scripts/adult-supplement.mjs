import {readdir,readFile} from 'node:fs/promises';
export function partitionSupplement(items){const adult=[],ordinary=[],unknown=[];for(const movie of items){if(movie.adult===true)adult.push(movie);else if(movie.adult===false)ordinary.push(movie);else unknown.push(movie)}return {adult,ordinary,unknown}}
export async function readSupplement(cache,start,end){
 const files=(await readdir(cache)).filter(f=>/^adult-day-\d{4}-\d\d-\d\d\.json$/.test(f)).sort(),adult=new Map(),ordinary=new Map();let days=0,gaps=0,unknown=0;
 for(const file of files){const day=JSON.parse(await readFile(`${cache}/${file}`,'utf8'));if(day.date<start||day.date>end)continue;days++;if(!day.audited)gaps++;const parts=partitionSupplement(day.items);unknown+=parts.unknown.length;for(const m of parts.adult)adult.set(m.id,m);for(const m of parts.ordinary)ordinary.set(m.id,m)}
 return {adult:[...adult.values()],ordinary:[...ordinary.values()],days,gaps,unknown};
}
// An explicit adult classification always wins if a later source snapshot disagrees.
export function mergeOrdinarySupplement(movies,supplement){
 const adultIds=new Set(supplement.adult.map(m=>m.id)),added=[],removed=[];
 for(const id of adultIds)if(movies.delete(id))removed.push(id);
 for(const movie of supplement.ordinary)if(!adultIds.has(movie.id)&&!movies.has(movie.id)){movies.set(movie.id,movie);added.push(movie)}
 return {added,removed};
}
export async function reconcileOrdinaryGaps(cache,gaps,ordinary,movies){
 const byDate=new Map();for(const movie of ordinary){if(!byDate.has(movie.release_date))byDate.set(movie.release_date,[]);byDate.get(movie.release_date).push(movie)}
 const remaining=[],resolved=[];
 for(const gap of gaps){const day=JSON.parse(await readFile(`${cache}/day-${gap.date}.json`,'utf8'));const ids=new Set(day.items.filter(m=>movies.has(m.id)).map(m=>m.id));let additions=0;for(const movie of byDate.get(gap.date)||[])if(movies.has(movie.id)&&!ids.has(movie.id)){ids.add(movie.id);additions++}const evidence={...gap,actual:ids.size,additionalOrdinary:additions};if(ids.size>=gap.expected)resolved.push(evidence);else remaining.push(evidence)}
 return {remaining,resolved};
}
