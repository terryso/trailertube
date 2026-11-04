import {access,mkdir,readFile,writeFile} from 'node:fs/promises';import {isAbsolute,join} from 'node:path';import {makeLaunchAgent} from './launch-agent.mjs';

// Prepare reviewable local files only. Installing/loading the agent is separate.
export async function prepareScheduler({projectRoot,nodePath,tmdbEnvFile,youtubeOAuthFile,proxy}) {
 for(const path of [projectRoot,nodePath,tmdbEnvFile,youtubeOAuthFile])if(!isAbsolute(path||''))throw new Error('Absolute scheduler paths are required');
 await Promise.all([access(nodePath),access(tmdbEnvFile),access(youtubeOAuthFile)]);
 const contents=await readFile(tmdbEnvFile,'utf8');if(!contents.split(/\r?\n/).some(line=>/^\s*(?:export\s+)?TMDB_API_KEY\s*=\s*\S/.test(line)))throw new Error('TMDB credential missing');
 const root=join(projectRoot,'.cache/incremental');await mkdir(root,{recursive:true});
 const config=join(root,'scheduler.json'),plist=join(root,'launch-agent.plist');
 await writeFile(config,JSON.stringify({tmdbEnvFile,youtubeOAuthFile,proxy})+'\n',{flag:'wx',mode:0o600});
 await writeFile(plist,makeLaunchAgent({projectRoot,nodePath}),{flag:'wx',mode:0o600});
 return {config,plist};
}
