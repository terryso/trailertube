const DAY=86_400_000;
function parseDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid maintenance date');const n=Date.parse(`${value}T00:00:00Z`);if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw new Error('Invalid maintenance date');return Math.floor(n/DAY)}

// Stable ID buckets spread periodic refresh across days. Missed days are
// caught up from the last successfully published cursor, not wall-clock alone.
export function maintenanceIds({ordinary,adult,cursor,today,start,cycleDays=30}) {
 if(!Number.isInteger(cycleDays)||cycleDays<1||cycleDays>366)throw new Error('Invalid maintenance cycle');
 const from=parseDate(cursor),to=parseDate(today);parseDate(start);if(from>to)throw new Error('Maintenance cursor is in the future');
 const buckets=new Set();for(let day=Math.max(from+1,to-cycleDays+1);day<=to;day++)buckets.add(day%cycleDays);
 const ids=[],seen=new Set();for(const catalog of [ordinary,adult])for(const [key,movie] of catalog){const id=String(key),num=Number(id);if(!/^\d+$/.test(id)||!Number.isSafeInteger(num)||num<=0||seen.has(id))throw new Error('Invalid or duplicate maintenance ID');seen.add(id);if(movie.createdAt>=start&&movie.createdAt<=today&&buckets.has(num%cycleDays))ids.push(num)}return ids;
}
