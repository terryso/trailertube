import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('the queue renders all upcoming trailers without truncating at 15',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{const {PlaybackQueue}=await server.ssrLoadModule('/src/PlaybackQueue.jsx');const items=Array.from({length:20},(_,i)=>({id:String(i+2),title:`Film ${i+2}`}));const Link=({to,go,children,...props})=>React.createElement('a',{...props,href:to},children);const html=renderToStaticMarkup(React.createElement(PlaybackQueue,{video:{id:'1',title:'Current'},upcoming:{label:'Playlist',items},autoplay:false,setAutoplay:()=>{},countdown:null,cancel:()=>{},nextBusy:false,nextError:'',advance:()=>{},Link,onGo:()=>{}}));assert.equal((html.match(/class="queue-row"/g)||[]).length,20);assert.match(html,/href="\/watch\/21"/);assert.match(html,/20 remaining/)}finally{await server.close()}
});
