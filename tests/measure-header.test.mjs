import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {measureHeaderLayout,modulationLabelOffset} from '../packages/rawl-notation/src/geometry.mjs';

// Rawl HEAD 73fe6ab0667353284fb9b8635123bcc98e0525cd:
// AnalysisGrid.Measure uses x−1 full-height bars; labels x+6/top−4 with
// a 12px sans-serif inner span. NewTonicSymbol uses 80×12 flags, z3;
// label top−2/12px/700/z100 and offsets initial digits*8+10, later30.
const row={start:0,end:32};
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(fn(),'Header did not settle');};

test('regular four-bar phrase marks are bright bars, including exact terminal boundaries without a label',()=>{
 const layout=measureHeaderLayout({row,width:800});
 assert.deepEqual(layout.measures.filter(m=>m.isPhraseStart).map(m=>m.beat),[0,16,32]);
 assert.equal(layout.measures.at(-1).terminal,true);assert.equal(layout.measures.at(-1).number,9);
 assert.equal(layout.measures.filter(m=>!m.terminal).length,8);
 assert.equal(measureHeaderLayout({row:{start:0,end:24}}).measures.some(m=>m.beat===24),false);
});

test('supplied hypermeter boundaries replace the default grid without inventing brackets',()=>{
 const layout=measureHeaderLayout({row:{start:0,end:44},barBeats:4,phraseStarts:[0,12,28,44]});
 assert.deepEqual(layout.measures.filter(m=>m.isPhraseStart).map(m=>m.beat),[0,12,28,44]);
 assert.ok(!layout.measures.find(m=>m.beat===16).isPhraseStart);assert.equal(layout.measures.at(-1).terminal,true);
 assert.deepEqual(measureHeaderLayout({row,phraseStarts:[]}).measures.filter(m=>m.isPhraseStart),[]);
 const triple=measureHeaderLayout({row:{start:0,end:24},barBeats:3});assert.deepEqual(triple.measures.filter(m=>m.isPhraseStart).map(m=>m.beat),[0,12,24]);
});

test('natural, onset-shifted and carried flags follow Rawl placement and zero joins stay hidden',()=>{
 const changes=[{beat:0,tonic:0},{beat:4,tonic:5},{beat:8,tonic:5,join:true},{beat:12,tonic:7,onsetOverride:true},{beat:15,tonic:9}],layout=measureHeaderLayout({row,width:800,changes});
 assert.deepEqual(layout.markers.map(m=>[m.beat,m.pixelOffset,m.labelOffset]),[[0,-1,18],[4,-1,30],[12,0,0],[15,0,0]]);
 const carried=measureHeaderLayout({row:{start:16,end:32},width:400,changes}).markers;
 assert.equal(carried.length,1);assert.equal(carried[0].beat,16);assert.equal(carried[0].originBeat,15);assert.equal(carried[0].delta,null);assert.equal(carried[0].previousTonic,null);assert.equal(carried[0].continued,true);assert.equal(carried[0].left,0);assert.equal(carried[0].pixelOffset,-1);assert.equal(carried[0].labelOffset,18);
 assert.deepEqual(measureHeaderLayout({row:{start:20,end:36},width:400,changes}).markers,[]);
 assert.equal(modulationLabelOffset(396,4,{initial:true}),34);
});

test('selected phrase neighbors use Rawl colors and semantic modulation markers survive selection',()=>{
 const layout=measureHeaderLayout({row,changes:[{beat:0,tonic:0},{beat:16,tonic:5}],selectedMeasure:16});
 assert.equal(layout.measures.find(m=>m.beat===16).color,'red');assert.equal(layout.measures.find(m=>m.beat===16).hasModulation,true);
 assert.equal(layout.measures.find(m=>m.beat===4).color,'orange');
 const ordinary=measureHeaderLayout({row,selectedMeasure:4});assert.equal(ordinary.measures.find(m=>m.beat===8).color,'#666');
 const unselected=measureHeaderLayout({row,changes:[{beat:0,tonic:0},{beat:16,tonic:5}]});assert.equal(unselected.measures.find(m=>m.beat===16).color,'black');
});

test('beat lines retain Rawl dashed-grid density threshold independently of phrase marks',()=>{
 const wide=measureHeaderLayout({row,width:800}),narrow=measureHeaderLayout({row,width:80});
 assert.ok(wide.beats.includes(1));assert.ok(!wide.beats.includes(4));assert.deepEqual(narrow.beats,[]);
 assert.deepEqual(wide.measures,narrow.measures);
 const eighth=measureHeaderLayout({row:{start:0,end:6},barBeats:1.5,beatBeats:.5,width:600});assert.ok(eighth.beats.includes(.5));assert.ok(!eighth.beats.includes(1.5));
});

test('both shared-header hosts render source typography, geometry and layering while preserving notation interactions',async()=>{
 const dom=new JSDOM('<!doctype html><body><div id="score" data-width="800"></div><div id="analysis" data-width="800" style="position:relative"></div></body>',{pretendToBeVisual:true,url:'http://localhost/'}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 w.HTMLElement.prototype.getBoundingClientRect=function(){const width=Number(this.closest('[data-width]')?.dataset.width??800);return {width,height:100,left:0,right:width,top:0,bottom:100,x:0,y:0,toJSON(){}};};
 const style=w.document.createElement('style');style.textContent=fs.readFileSync(new URL('../packages/rawl-notation/src/style.css',import.meta.url),'utf8');w.document.head.append(style);
 const root=fileURLToPath(new URL('../',import.meta.url)),bundle=await build({stdin:{contents:"export {RawlNotation,RawlMeasureHeader} from './packages/rawl-notation/src/RawlNotation.jsx';export {createElement} from 'react';export {createRoot} from 'react-dom/client';",resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}}),{RawlNotation,RawlMeasureHeader,createElement,createRoot}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const changes=[{beat:0,tonic:0},{beat:4,tonic:5},{beat:8,tonic:5,join:true,name:'Homer'},{beat:13,tonic:7}],notes=[{id:'piano',pitch:60,start:0,duration:8,voice:0},{id:'sax',pitch:72,start:0,duration:8,voice:1}],selection=[],hover=[],audition=[],seeks=[],common={row:{start:0,end:16},tonic:0,changes,barBeats:4,phraseStarts:[0,12,16],selectedMeasure:4,onMeasureSelect:beat=>selection.push(beat)};
 const score=createRoot(w.document.querySelector('#score')),analysis=createRoot(w.document.querySelector('#analysis'));score.render(createElement(RawlNotation,{...common,rows:[common.row],notes,beats:16,onNoteHover:note=>hover.push(note?.id??null),onNote:note=>audition.push(note.id),onSeek:beat=>seeks.push(beat),position:2}));analysis.render(createElement(RawlMeasureHeader,{...common,height:91}));
 try{
  await wait(()=>w.document.querySelectorAll('.rawln-measure-grid').length===2&&w.document.querySelector('#analysis .rawln-beat-bar'));
  const measures=id=>[...w.document.querySelectorAll('#'+id+' .rawln-measure-number')].map(n=>[n.dataset.beat,n.textContent,n.style.left,n.style.color,n.dataset.modulation]);assert.deepEqual(measures('score'),measures('analysis'));
  const number=w.document.querySelector('#analysis .rawln-measure-number[data-beat="4"]'),numberStyle=w.getComputedStyle(number),innerStyle=w.getComputedStyle(number.firstElementChild);
  assert.equal(number.style.left,'calc(25% + 6px)');assert.equal(numberStyle.top,'-4px');assert.equal(numberStyle.zIndex,'15');assert.equal(innerStyle.fontSize,'12px');assert.equal(innerStyle.fontFamily,'sans-serif');assert.equal(number.dataset.modulation,'true');assert.equal(number.style.color,'red');
  const bar=w.document.querySelector('#analysis .rawln-bar[data-beat="12"]'),barStyle=w.getComputedStyle(bar);assert.equal(bar.style.left,'calc(75% - 1px)');assert.equal(barStyle.width,'1px');assert.equal(barStyle.height,'100%');assert.equal(barStyle.top,'0px');assert.equal(barStyle.backgroundColor,'rgb(187, 187, 187)');assert.equal(barStyle.zIndex,'1');
  const beat=w.document.querySelector('#analysis .rawln-beat-bar'),beatStyle=w.getComputedStyle(beat);assert.equal(beatStyle.borderLeftWidth,'0.5px');assert.equal(beatStyle.borderLeftStyle,'dashed');assert.equal(beatStyle.zIndex,'2');
  const marker=w.document.querySelector('#analysis .rawln-modulation[data-beat="4"]'),flag=marker.querySelector('.rawln-modulation-flag'),label=marker.querySelector('.rawln-modulation-label');assert.equal(marker.style.left,'calc(25% - 1px)');assert.equal(w.getComputedStyle(flag).width,'80px');assert.equal(w.getComputedStyle(flag).height,'12px');assert.equal(w.getComputedStyle(flag).zIndex,'3');assert.equal(label.style.left,'30px');assert.equal(w.getComputedStyle(label).top,'-2px');assert.equal(w.getComputedStyle(label).fontWeight,'700');assert.equal(w.getComputedStyle(label).zIndex,'100');assert.ok(label.querySelector('svg path'));
  assert.equal(w.document.querySelector('#analysis .rawln-modulation[data-beat="13"]').style.left,'81.25%');assert.equal(w.document.querySelector('#analysis .rawln-modulation[data-beat="8"]'),null);assert.equal(w.document.querySelector('#analysis .rawln-measure-number[data-beat="16"]'),null);
  assert.ok(['','auto'].includes(w.getComputedStyle(w.document.querySelector('#analysis .rawln-measure-grid')).zIndex));
  number.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));number.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.deepEqual(selection,[4,4]);assert.deepEqual(seeks,[]);
  const piano=w.document.querySelector('#score [data-note="piano"]'),sax=w.document.querySelector('#score [data-note="sax"]');assert.equal(piano.style.height,'10px');assert.equal(sax.style.height,'10px');assert.ok(Number(sax.style.zIndex)>Number(piano.style.zIndex));
  piano.dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));piano.dispatchEvent(new w.MouseEvent('mouseout',{bubbles:true}));piano.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.deepEqual(hover,['piano',null]);assert.deepEqual(audition,['piano']);assert.deepEqual(seeks,[]);
 }finally{score.unmount();analysis.unmount();dom.window.close();}
});
