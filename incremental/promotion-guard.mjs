import {compareCatalogs} from './compare.mjs';

// A structurally valid snapshot can still silently lose films or playable
// videos. Check removals against fresh upstream evidence before production.
export async function guardPromotion({beforeOrdinary,beforeAdult,afterOrdinary,afterAdult,start,end,request,verifyVideos}) {
 if(typeof request!=='function'||typeof verifyVideos!=='function')throw new Error('Promotion evidence adapters required');
 const comparison=compareCatalogs({beforeOrdinary,beforeAdult,afterOrdinary,afterAdult,start,end});
 for(const id of comparison.missingInRange){const detail=await request(`/movie/${id}`,{language:'en-US'});const date=detail?.release_date;
  if(!detail||String(detail.id)!==id||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date||(date>=start&&date<=end))throw new Error(`Unverified in-range movie removal: ${id}`);
 }
 const after=new Map([...afterOrdinary,...afterAdult]),removed=[];
 for(const source of [beforeOrdinary,beforeAdult])for(const [id,old] of source){const next=after.get(id);if(next&&old.trailer&&!next.trailer)removed.push(old.trailer)}
 const ids=[...new Set(removed)],videos=ids.length?await verifyVideos(ids):new Map();
 for(const id of ids){const status=videos.get(id);if(typeof status?.available!=='boolean')throw new Error('Missing video verification for removed trailer');if(status.available)throw new Error(`Playable trailer would disappear: ${id}`)}
 return {missingInRange:comparison.missingInRange.length,verifiedUnavailable:ids.length,expired:comparison.expired};
}
