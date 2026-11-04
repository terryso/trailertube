// Compare full catalogs rather than the trailer feed. Callers can inspect the
// result before deciding whether a candidate snapshot is safe to publish.
export function compareCatalogs({beforeOrdinary,beforeAdult,afterOrdinary,afterAdult,start,end}) {
 const before=combine(beforeOrdinary,beforeAdult),after=combine(afterOrdinary,afterAdult);
 const result={before:before.size,after:after.size,added:0,expired:0,missingInRange:[],becameAdult:0,becameOrdinary:0,trailerRemoved:0,trailerAdded:0};
 for(const [id,old] of before){const now=after.get(id);if(!now){if(old.createdAt<start||old.createdAt>end)result.expired++;else result.missingInRange.push(id);continue}if(!old.adult&&now.adult)result.becameAdult++;if(old.adult&&!now.adult)result.becameOrdinary++;if(old.trailer&&!now.trailer)result.trailerRemoved++;if(!old.trailer&&now.trailer)result.trailerAdded++}
 for(const id of after.keys())if(!before.has(id))result.added++;
 return result;
}
function combine(ordinary,adult){const map=new Map();for(const [items,adultExpected] of [[ordinary,false],[adult,true]]){if(!(items instanceof Map))throw new Error('Catalog map required');for(const [key,value] of items){const id=String(key);if(map.has(id)||(adultExpected?value.adult!==true:value.adult===true))throw new Error('Duplicate or misclassified movie');map.set(id,value)}}return map}
