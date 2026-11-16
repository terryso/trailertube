import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateStaticPages} from '../scripts/generate-static-pages.mjs';

test('static hub pages carry unique metadata, canonicals and crawlable links',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-static-pages-'));
 try{
  await mkdir(join(dir,'data'));
  await writeFile(join(dir,'index.html'),'<!doctype html><html><head><meta name="description" content="Home"/><title>Home</title><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  await writeFile(join(dir,'data/catalog.json'),JSON.stringify({feedShards:['feed-0000.json'],overview:{feedCount:2}}));
  await writeFile(join(dir,'data/feed-0000.json'),JSON.stringify([
   {id:'1',title:'Action film',trailer:'abcdefghijk',playable:true,genreIds:['28'],popularity:9,createdAt:'2026-01-01'},
   {id:'2',title:'Comedy film',trailer:'klmnopqrstu',playable:true,genreIds:['35'],popularity:8,createdAt:'2026-02-01'}
  ]));
  await writeFile(join(dir,'data/genres.json'),JSON.stringify([{id:'28',name:'Action'},{id:'35',name:'Comedy'}]));
  const result=await generateStaticPages(dir);
  assert.deepEqual(result,{pages:7,playlistPages:4,playlists:4,genres:2});
  const popular=await readFile(join(dir,'p','popular-trailers.html'),'utf8');
  assert.match(popular,/<title>Popular movie trailers \| TrailerTube<\/title>/);
  assert.match(popular,/<link rel="canonical" href="https:\/\/trailer\.terryso\.dev\/p\/popular-trailers"/);
  assert.match(popular,/<a href="\/watch\/1">Action film<\/a> \(2026\)/);
  const categories=await readFile(join(dir,'categories.html'),'utf8');
  assert.match(categories,/<title>Movie Trailer Categories \| TrailerTube<\/title>/);
  assert.match(categories,/<link rel="canonical" href="https:\/\/trailer\.terryso\.dev\/categories"/);
  assert.match(categories,/<h1>Movie trailer categories<\/h1>/);
  assert.match(categories,/<a href="\/browse\?category=28">Action trailers<\/a>/);
  assert.match(categories,/src="\/assets\/app\.js"/);
  const playlists=await readFile(join(dir,'playlists.html'),'utf8');
  assert.match(playlists,/<title>Curated Movie Trailer Playlists \| TrailerTube<\/title>/);
  assert.match(playlists,/<link rel="canonical" href="https:\/\/trailer\.terryso\.dev\/playlists"/);
  assert.match(playlists,/<a href="\/p\/recently-released">Recently released movie trailers<\/a>/);
  const about=await readFile(join(dir,'about.html'),'utf8');
  assert.match(about,/<title>About TrailerTube<\/title>/);
  assert.match(about,/<link rel="canonical" href="https:\/\/trailer\.terryso\.dev\/about"/);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('generation requires a verifiable feed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trailertube-static-pages-'));
 try{await mkdir(join(dir,'data'));await writeFile(join(dir,'index.html'),'<html><head><meta name="description" content="Home"/><title>Home</title></head><body><div id="root"></div></body></html>');await writeFile(join(dir,'data/catalog.json'),JSON.stringify({feedShards:['feed-0000.json'],overview:{feedCount:2}}));await writeFile(join(dir,'data/feed-0000.json'),JSON.stringify([{id:'1',title:'Only one',trailer:'abcdefghijk',playable:true,genreIds:['28']}]));await assert.rejects(generateStaticPages(dir),/does not match/)}finally{await rm(dir,{recursive:true,force:true})}
});
