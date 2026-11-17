import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {modulationLabelOffset,keyMarkers,tonicAt} from '../packages/rawl-notation/src/geometry.mjs';
import {modulationLabelOffset as analysisOffset} from '../src/music/modulations.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'Notation did not settle');};

test('modulation labels use Rawl initial, later and onset-override offsets',()=>{
 assert.equal(modulationLabelOffset(0,4),18);assert.equal(modulationLabelOffset(32,4),30);
 assert.equal(modulationLabelOffset(36,4),30);assert.equal(modulationLabelOffset(96,4),30);
 assert.equal(modulationLabelOffset(396,4),30);assert.equal(modulationLabelOffset(96,3),30);
 assert.equal(modulationLabelOffset(98,4),0);assert.equal(modulationLabelOffset(1,4),0);
 assert.equal(modulationLabelOffset(396,4,{initial:true}),34);assert.equal(modulationLabelOffset(96,4,{onsetOverride:true}),0);
 assert.equal(modulationLabelOffset(98,4,{continued:true}),30);
 assert.equal(analysisOffset,modulationLabelOffset);
});

test('compact scores hide only the initial tonic label and retain all tonal state, later flags and geometry',async()=>{
 const dom=new JSDOM('<!doctype html><body><div id="full"></div><div id="hidden"></div><div id="host"></div></body>',{pretendToBeVisual:true,url:'http://localhost/'}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 const css=w.document.createElement('style');css.textContent=fs.readFileSync(new URL('../packages/rawl-notation/src/style.css',import.meta.url),'utf8');w.document.head.append(css);
 const result=await build({stdin:{contents:"export {RawlNotation} from './packages/rawl-notation/src/RawlNotation.jsx';export {mountRawlView} from './src/rawl-view.jsx';export {createElement} from 'react';export {createRoot} from 'react-dom/client';",resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
 const {RawlNotation,mountRawlView,createElement,createRoot}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const changes=[{beat:0,tonic:0,root:'C'},{beat:2,tonic:0,root:'C',join:true,name:'Homer'},{beat:4,tonic:5,root:'F',join:true,name:'Bootstrap'},{beat:96,tonic:7,root:'G'},{beat:98,tonic:9,root:'A'},{beat:396,tonic:2,root:'D'}];
 const notes=[{id:'c',pitch:60,start:0,duration:1,voice:0},{id:'f',pitch:65,start:4,duration:1,voice:0},{id:'a',pitch:69,start:98,duration:1,voice:0}],props={notes,beats:408,rows:[{start:0,end:408}],tonic:0,changes,barBeats:4};
 const full=createRoot(w.document.querySelector('#full')),hidden=createRoot(w.document.querySelector('#hidden'));
 full.render(createElement(RawlNotation,props));hidden.render(createElement(RawlNotation,{...props,hideInitialTonic:true}));
 const performance={...props,barBeats:4,rows:props.rows,chords:[{id:0,start:0,end:408,symbol:'CM7'}]},song={index:0,columns:8,tonic:['C','Major'],rows:[{startBar:0,bricks:[]}]};
 const host=mountRawlView(w.document.querySelector('#host'),{song,performance,brickMap:new Map(),mutedVoices:[],compact:true,continuous:true,measureWidth:84,barsPerRow:2});
 try{
  await wait(()=>w.document.querySelectorAll('.rawln').length===3);
  const initial=w.document.querySelector('#full .rawln-modulation[data-beat="0"]');assert.ok(initial);assert.equal(initial.textContent,'C');
  assert.equal(w.document.querySelector('#hidden .rawln-modulation[data-beat="0"]'),null);assert.equal(w.document.querySelector('#host .rawln-modulation[data-beat="0"]'),null);
  for(const id of ['full','hidden','host']){
   assert.equal(w.document.querySelector('#'+id+' .rawln-modulation[data-beat="2"]'),null);
   for(const [beat,offset] of [[4,30],[96,30],[98,0],[396,30]])assert.equal(w.document.querySelector('#'+id+' .rawln-modulation[data-beat="'+beat+'"] .rawln-modulation-label').style.left,offset+'px');
  }
  const noteState=selector=>[...w.document.querySelectorAll(selector+' [data-note]')].map(n=>[n.dataset.note,n.dataset.degree,n.style.cssText]);
  assert.deepEqual(noteState('#full'),noteState('#hidden'));
  const tonalState=selector=>[...w.document.querySelectorAll(selector+' .rawln-grid [data-tonic]')].map(n=>[n.dataset.tonic,n.className,n.style.cssText]);
  assert.deepEqual(tonalState('#full'),tonalState('#hidden'));assert.equal(keyMarkers(0,changes)[0].tonic,0);assert.equal(tonicAt(0,changes,99),9);
  assert.equal(w.document.querySelector('#host .rawln-row').style.width,'8568px');assert.equal(w.document.querySelectorAll('#host .rawln-row').length,1);
  const measure=w.document.querySelector('#hidden .rawln-measure-number[data-modulation="true"]');assert.equal(measure.textContent,'2');assert.equal(measure.style.color,'black');assert.equal(w.getComputedStyle(measure).zIndex,'15');assert.equal(w.getComputedStyle(w.document.querySelector('#hidden .rawln-modulation-flag')).zIndex,'3');
 }finally{host.destroy();full.unmount();hidden.unmount();dom.window.close();}
});

test('favicon uses three solid Rawl 2–4–6 bands with a black background and white superscript seven',()=>{
 const svg=fs.readFileSync(new URL('../dist/icons/favicon.svg',import.meta.url),'utf8'),dom=new JSDOM(svg,{contentType:'image/svg+xml'}),document=dom.window.document;
 assert.equal(document.documentElement.getAttribute('viewBox'),'0 0 64 64');assert.equal(document.documentElement.getAttribute('aria-label'),'ii⁷');assert.equal(document.querySelector('rect').getAttribute('fill'),'black');assert.equal(document.querySelector('rect').getAttribute('width'),'64');assert.equal(document.querySelector('rect').getAttribute('height'),'64');
 assert.equal(document.querySelector('linearGradient,radialGradient,stop'),null);assert.equal(document.querySelector('g').getAttribute('clip-path'),'url(#ii)');assert.deepEqual([...document.querySelectorAll('g>path')].map(p=>p.getAttribute('fill')),['red','#9500b3','#03b9d5']);assert.deepEqual([...document.querySelectorAll('g>path')].map(p=>p.getAttribute('d')),['M0 44.5H64V64H0z','M0 21.333333H64V44.5H0z','M0 0H64V21.333333H0z']);assert.equal(document.querySelectorAll('circle').length,2);assert.equal(document.querySelector('svg>path').getAttribute('fill'),'white');assert.ok(document.querySelector('svg>path').getAttribute('d').includes('M41 0h23'));
 assert.equal(document.querySelectorAll('rect').length,1);dom.window.close();
});
