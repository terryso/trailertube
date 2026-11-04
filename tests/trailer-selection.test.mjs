import test from 'node:test';import assert from 'node:assert/strict';
import {trailerCandidates,repairUnavailableTrailers} from '../scripts/trailer-selection.mjs';
test('unavailable primary trailer can be replaced by a verified embeddable alternative',async()=>{
 const bad='AAAAAAAAAAA',good='BBBBBBBBBBB',unverified='CCCCCCCCCCC',movies=[{id:'42'}],records=new Map([[42,{id:42,trailer:bad}]]),metadata=new Map([[bad,{available:false}]]),saved=[];
 const result=await repairUnavailableTrailers(movies,records,metadata,{fetchCandidates:async()=>({results:[{key:unverified,site:'YouTube',type:'Trailer',official:true,iso_639_1:'en'},{key:good,site:'YouTube',type:'Trailer',official:true,iso_639_1:'en'}]}),enrich:async()=>new Map([[bad,{available:false}],[unverified,{available:false}],[good,{available:true}]]),saveRecord:async x=>saved.push(x)});
 assert.equal(result.replaced,1);assert.equal(result.failures,0);assert.equal(records.get(42).trailer,good);assert.equal(records.get(42).previousTrailer,bad);assert.equal(saved.length,2);
});
test('candidate sorting excludes non-trailers and deduplicates IDs',()=>{
 const x='AAAAAAAAAAA',y='BBBBBBBBBBB';const result=trailerCandidates([{key:x,site:'YouTube',type:'Trailer',official:false},{key:y,site:'YouTube',type:'Trailer',official:true},{key:y,site:'YouTube',type:'Trailer',official:true},{key:'CCCCCCCCCCC',site:'YouTube',type:'Clip'}]);assert.deepEqual(result,[y,x]);
});
test('a labelled teaser is used only after trailer candidates',async()=>{
 const {previewCandidates}=await import('../scripts/trailer-selection.mjs'),trailer='AAAAAAAAAAA',teaser='BBBBBBBBBBB';const list=previewCandidates([{key:teaser,site:'YouTube',type:'Teaser',official:true,iso_639_1:'en'},{key:trailer,site:'YouTube',type:'Trailer',official:false,iso_639_1:'fr'}]);assert.deepEqual(list,[{key:trailer,type:'Trailer'},{key:teaser,type:'Teaser'}]);
 const records=new Map([[1,{id:1,trailer,alternates:[trailer,teaser],candidateTypes:{[trailer]:'Trailer',[teaser]:'Teaser'}}]]),meta=new Map([[trailer,{available:false}],[teaser,{available:true}]]);const result=await repairUnavailableTrailers([{id:1}],records,meta,{fetchCandidates:async()=>{throw Error('not needed')},enrich:async()=>meta,saveRecord:async()=>{}});assert.equal(result.replaced,1);assert.equal(records.get(1).trailer,teaser);assert.equal(records.get(1).previewType,'Teaser');
});
test('legacy trailer checks remain counted while teaser backfill is pending',async()=>{const {previewChecked,needsPreviewCheck,needsTeaserBackfill}=await import('../scripts/trailer-selection.mjs');const legacy={trailer:null,originalChecked:true};assert.equal(previewChecked(legacy),true);assert.equal(needsPreviewCheck(legacy),true);assert.equal(needsTeaserBackfill(legacy),true);assert.equal(needsPreviewCheck({...legacy,previewVersion:2}),false);assert.equal(needsPreviewCheck({trailer:'AAAAAAAAAAA'}),false)});
