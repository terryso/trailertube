// Prefer a Trailer; use a Teaser only when no usable Trailer is available.
export function previewCandidates(results,limit=20){
 const candidates=(results||[]).filter(v=>v.site==='YouTube'&&['Trailer','Teaser'].includes(v.type)&&/^[\w-]{11}$/.test(v.key));
 candidates.sort((a,b)=>Number(b.type==='Trailer')-Number(a.type==='Trailer')||Number(b.official)-Number(a.official)||Number(b.iso_639_1==='en')-Number(a.iso_639_1==='en')||String(b.published_at||'').localeCompare(a.published_at||''));
 const seen=new Set(),out=[];for(const v of candidates)if(!seen.has(v.key)){seen.add(v.key);out.push({key:v.key,type:v.type});if(out.length===limit)break}return out;
}
export function trailerCandidates(results,limit=20){return previewCandidates(results,limit).map(v=>v.key)}
export async function repairUnavailableTrailers(movies,records,metadata,{fetchCandidates,enrich,saveRecord}){
 const blocked=movies.filter(m=>{const r=records.get(Number(m.id));return r?.trailer&&metadata.get(r.trailer)?.available===false});
 const needs=blocked.filter(m=>{const r=records.get(Number(m.id));return !Array.isArray(r.alternates)||!r.candidateTypes});let next=0,failures=0;
 async function worker(){while(next<needs.length){const m=needs[next++];try{const old=records.get(Number(m.id)),result=await fetchCandidates(m),candidates=previewCandidates(result.results);const updated={...old,alternates:candidates.map(v=>v.key),candidateTypes:Object.fromEntries(candidates.map(v=>[v.key,v.type])),previewVersion:2};await saveRecord(updated);records.set(updated.id,updated)}catch{failures++}}}
 await Promise.all(Array.from({length:4},worker));
 const alternatives=blocked.flatMap(m=>records.get(Number(m.id)).alternates||[]);
 if(alternatives.length){try{metadata=await enrich(alternatives)}catch{failures+=blocked.length;return {metadata,replaced:0,failures}}}
 let replaced=0;
 for(const m of blocked){const old=records.get(Number(m.id)),replacement=(old.alternates||[]).find(id=>id!==old.trailer&&metadata.get(id)?.available===true);if(replacement){const updated={...old,previousTrailer:old.trailer,trailer:replacement,previewType:old.candidateTypes?.[replacement]||'Trailer'};await saveRecord(updated);records.set(updated.id,updated);replaced++}}
 return {metadata,replaced,failures};
}
export function previewChecked(record){return Boolean(record?.trailer||record?.originalChecked)}
export function needsPreviewCheck(record){return !record||(!record.trailer&&record.previewVersion!==2)}
export function needsTeaserBackfill(record){return Boolean(record?.originalChecked&&!record.trailer&&record.previewVersion!==2)}
