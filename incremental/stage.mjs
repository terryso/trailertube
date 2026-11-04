import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {writeCatalogSnapshot} from '../scripts/write-catalog.mjs';
import {mergeUpdates} from './snapshot.mjs';

// Write to a caller-owned staging directory. Source snapshots remain untouched.
export async function stageCatalogs({ordinary,adult,updates,start,end,directory}) {
 if(!directory||!ordinary?.manifest||!adult?.manifest)throw new Error('Both source catalogs and staging directory are required');
 const merged=mergeUpdates({ordinary:ordinary.entries,adult:adult.entries,updates,start,end});
 // Existing in-range movies may only disappear when TMDB explicitly supplies
 // an updated release date outside the rolling range. A 404 is not sufficient.
 const movedOutside=new Set(updates.filter(x=>typeof x.createdAt==='string'&&(x.createdAt<start||x.createdAt>end)).map(x=>String(x.id)));
 for(const entries of [ordinary.entries,adult.entries])for(const [id,movie] of entries)if(movie.createdAt>=start&&movie.createdAt<=end&&!merged.ordinary.has(id)&&!merged.adult.has(id)&&!movedOutside.has(String(id)))throw new Error(`In-range movie would be silently removed: ${id}`);
 await mkdir(directory,{recursive:true});
 const write=(catalog,entries,subdir)=>writeCatalogSnapshot({entries:[...entries.values()],genres:catalog.genres,outputDir:join(directory,subdir),start,end,complete:false,auditGaps:catalog.manifest.auditGaps||0,pendingTeasers:catalog.manifest.pendingTeasers||0});
 const normalManifest=await write(ordinary,merged.ordinary,'data');
 const adultManifest=await write(adult,merged.adult,'adult-data');
 return {directory,ordinary:normalManifest,adult:adultManifest};
}
