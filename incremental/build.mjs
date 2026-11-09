import {cp,mkdir,access} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {generateSitemap} from '../scripts/generate-sitemap.mjs';
import {generateMoviePages} from '../scripts/generate-movie-pages.mjs';
import {generateWatchIndex} from '../scripts/generate-watch-index.mjs';
import {generateFastLists} from '../scripts/generate-fast-lists.mjs';
import {generateTrailerVariantsIndex} from '../scripts/generate-trailer-variants-index.mjs';
import {generatePeopleIndex} from '../scripts/generate-people-index.mjs';
import {generateHomePage} from '../scripts/generate-home-page.mjs';
import {generateAgentApi} from '../scripts/generate-agent-api.mjs';

export async function buildStagedSite(directory) {
 const stage=resolve(directory),publicDir=join(stage,'public'),outputDir=join(stage,'site');
 // Never allow Vite to overwrite an existing output directory.
 try{await access(outputDir);throw new Error('Staging build output already exists')}catch(e){if(e.code!=='ENOENT')throw e}
 await mkdir(publicDir,{recursive:true});
 for(const name of ['data','adult-data'])await cp(join(stage,name),join(publicDir,name),{recursive:true,errorOnExist:true,force:false});
 const original=resolve('public');await cp(original,publicDir,{recursive:true,filter:path=>{const part=relative(original,path).split('/')[0];return part!=='data'&&part!=='adult-data'}});
 await new Promise((resolvePromise,reject)=>{const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build','--config','incremental/vite.config.mjs'],{stdio:'inherit',env:{...process.env,TRAILERTUBE_STAGE_PUBLIC:publicDir,TRAILERTUBE_STAGE_OUTPUT:outputDir}});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolvePromise():reject(new Error(`Staged Vite build failed: ${signal||code}`)))});
 await generateSitemap(outputDir);await generateMoviePages(outputDir);await generateWatchIndex(outputDir);await generateFastLists(outputDir);await generateTrailerVariantsIndex(outputDir);await generatePeopleIndex(outputDir);await generateHomePage(outputDir);await generateAgentApi(outputDir);return outputDir;
}
