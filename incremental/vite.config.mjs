import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {isAbsolute} from 'node:path';

const publicDir=process.env.TRAILERTUBE_STAGE_PUBLIC,outputDir=process.env.TRAILERTUBE_STAGE_OUTPUT;
if(!publicDir||!outputDir||!isAbsolute(publicDir)||!isAbsolute(outputDir)||publicDir===outputDir)throw new Error('Distinct absolute staging paths are required');
export default defineConfig({plugins:[react()],publicDir,build:{outDir:outputDir,emptyOutDir:false}});
