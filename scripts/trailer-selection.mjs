// Prefer a Trailer; use a Teaser only when no usable Trailer is available.
function sortedPreviewResults(results,limit=20){
 const candidates=(Array.isArray(results)?results:[]).filter(v=>v.site==='YouTube'&&['Trailer','Teaser'].includes(v.type)&&typeof v.key==='string'&&/^[\w-]{11}$/.test(v.key));
 candidates.sort((a,b)=>Number(b.type==='Trailer')-Number(a.type==='Trailer')||Number(b.official===true)-Number(a.official===true)||Number(b.iso_639_1==='en')-Number(a.iso_639_1==='en')||String(b.published_at||'').localeCompare(String(a.published_at||'')));
 const seen=new Set(),out=[];for(const v of candidates)if(!seen.has(v.key)){seen.add(v.key);out.push(v);if(out.length===limit)break}return out;
}
export function previewCandidates(results,limit=20){return sortedPreviewResults(results,limit).map(v=>({key:v.key,type:v.type}))}
export function detailedPreviewCandidates(results,limit=20){return sortedPreviewResults(results,limit).map(v=>({key:v.key,type:v.type,name:typeof v.name==='string'&&v.name.trim()?v.name.trim().replace(/\s+/g,' ').slice(0,160):v.type,language:typeof v.iso_639_1==='string'&&/^[a-z]{2}$/.test(v.iso_639_1)?v.iso_639_1:null,official:v.official===true,publishedAt:typeof v.published_at==='string'&&Number.isFinite(Date.parse(v.published_at))?v.published_at:null}))}

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

// A variant is shown only when YouTube verification explicitly returned an
// available embeddable video with a recorded check time.
export function verifiedTrailerVariants(results,verified,limit=10){
 const out=[];for(const candidate of detailedPreviewCandidates(results,20)){const status=verified.get(candidate.key);if(status?.available!==true||!['public','unlisted'].includes(status.privacyStatus)||typeof status.checkedAt!=='string'||!Number.isFinite(Date.parse(status.checkedAt)))continue;out.push({...candidate,available:true,privacyStatus:status.privacyStatus,verifiedAt:status.checkedAt,duration:Number.isSafeInteger(status.duration)&&status.duration>0?status.duration:null,regionRestriction:status.regionRestriction||null});if(out.length===limit)break}return out;
}
