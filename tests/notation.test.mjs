import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const root=fileURLToPath(new URL('../',import.meta.url));
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'Notation did not settle');};

test('Rawl source layers numbers above flags, hides zero joins/cursor, and overlays globally switched harmony',async()=>{
 const dom=new JSDOM('<!doctype html><body><div id="a"></div><div id="b"></div><div id="core"></div></body>',{pretendToBeVisual:true,url:'http://localhost/'}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 const css=w.document.createElement('style');css.textContent=fs.readFileSync(new URL('../packages/rawl-notation/src/style.css',import.meta.url),'utf8');w.document.head.append(css);
 const result=await build({stdin:{contents:"export {mountRawlView,bindHarmonyHover} from './src/rawl-view.jsx';export {RawlNotation} from './packages/rawl-notation/src/RawlNotation.jsx';export {createElement,createRef} from 'react';export {createRoot} from 'react-dom/client';",resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
 const {mountRawlView,bindHarmonyHover,RawlNotation,createElement,createRef,createRoot}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const cleanHover=bindHarmonyHover(w.document),cleanDuplicate=bindHarmonyHover(w.document);
 const performance={beats:8,barBeats:4,rows:[{start:0,end:8}],changes:[{beat:0,tonic:0,root:'C'},{beat:2,tonic:0,root:'C',join:true,name:'Homer'},{beat:4,tonic:5,root:'F',join:true,name:'Bootstrap'}],chords:[{id:0,row:0,start:0,end:4,symbol:'CM7'},{id:1,row:0,start:4,end:8,symbol:'F7'}],notes:[{id:'c',pitch:60,start:0,duration:4,voice:0},{id:'f',pitch:65,start:4,duration:4,voice:0}]};
 const song={index:0,rows:[{startBar:0,bricks:[]}],tonic:['C','Major']},options={song,performance,brickMap:new Map(),mutedVoices:[]};
 const a=mountRawlView(w.document.querySelector('#a'),options),b=mountRawlView(w.document.querySelector('#b'),{...options,measureWidth:150,barsPerRow:1});await wait(()=>w.document.querySelectorAll('.harmony-stripe').length===3);
 assert.equal(w.document.querySelector('#a .rawln-row').style.width,'100%');assert.equal(w.document.querySelector('#b .rawln-row').style.width,'150px');assert.equal(w.document.querySelectorAll('#b .rawln-row').length,2);assert.equal(w.document.querySelector('.rawln-playhead'),null);assert.equal(w.document.querySelector('.rawln-modulation[data-beat="2"]'),null);assert.equal(w.document.querySelectorAll('.rawln-modulation[data-beat="4"]').length,2);
 assert.equal(w.document.querySelectorAll('.rawln-modulation[data-beat="0"]').length,2);
 const number=w.document.querySelector('.rawln-measure-number[data-modulation="true"]');assert.equal(number.textContent,'2');assert.equal(number.style.color,'black');assert.equal(w.getComputedStyle(number.parentElement).zIndex,'15');assert.equal(w.getComputedStyle(w.document.querySelector('.rawln-modulation-flag')).zIndex,'3');
 const note=w.document.querySelector('#a [data-note="c"]'),baseTop=parseFloat(note.style.top);a.setPosition(1);assert.equal(note.style.height,'10px');assert.equal(parseFloat(note.style.top)+10,baseTop+5);
 const stripes=[...w.document.querySelectorAll('.harmony-stripe')];for(const stripe of stripes){const chord=stripe.querySelector('.harmony-chords'),rn=stripe.querySelector('.harmony-rns');assert.equal(w.getComputedStyle(stripe).height,'20px');assert.equal(w.getComputedStyle(rn).visibility,'hidden');assert.equal(chord.children.length,rn.children.length);for(let i=0;i<chord.children.length;i++){assert.equal(chord.children[i].style.left,rn.children[i].style.left);assert.equal(chord.children[i].style.width,rn.children[i].style.width);assert.equal(w.getComputedStyle(chord.children[i]).backgroundColor,'rgba(0, 0, 0, 0)');}}
 stripes[0].dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));assert.ok(w.document.body.classList.contains('harmony-rn'));for(const stripe of stripes){assert.equal(w.getComputedStyle(stripe.querySelector('.harmony-rns')).visibility,'visible');assert.equal(w.getComputedStyle(stripe.querySelector('.harmony-chords')).visibility,'hidden');assert.equal(w.getComputedStyle(stripe).height,'20px');}
 stripes[0].dispatchEvent(new w.MouseEvent('pointerout',{bubbles:true}));assert.ok(!w.document.body.classList.contains('harmony-rn'));
 const coreRoot=createRoot(w.document.querySelector('#core')),ref=createRef();coreRoot.render(createElement(RawlNotation,{ref,notes:performance.notes,beats:8,rows:[{start:0,end:8,style:{gridColumn:'2'}}],className:'form-grid',style:{display:'grid'}}));await wait(()=>w.document.querySelector('#core .rawln-row'));assert.equal(w.document.querySelector('#core .rawln-row').style.gridColumn,'2');assert.ok(w.document.querySelector('#core .rawln.form-grid'));
 a.destroy();b.destroy();coreRoot.unmount();cleanDuplicate();cleanHover();dom.window.close();
});
