import test from 'node:test';import assert from 'node:assert/strict';
import {recolorModulation,recolorBoundary} from '../src/music/recolor.mjs';
const changes=[{beat:0,tonic:0,root:'C'},{beat:16,tonic:5,root:'F',join:true,name:'Bootstrap'},{beat:32,tonic:7,root:'G'}];
test('Rawl tonic choice replaces one boundary until the next, retaining times and source input',()=>{const before=structuredClone(changes),next=recolorModulation(changes,16,62);assert.deepEqual(next.map(c=>[c.beat,c.tonic,c.root]),[[0,0,'C'],[16,2,'D'],[32,7,'G']]);assert.equal(next[1].name,'Bootstrap');assert.deepEqual(changes,before);});
test('Rawl removes consecutive equal tonic regions and supports a newly selected measure',()=>{assert.deepEqual(recolorModulation(changes,16,60).map(c=>[c.beat,c.tonic]),[[0,0],[32,7]]);assert.deepEqual(recolorModulation(changes,8,68).map(c=>[c.beat,c.tonic]),[[0,0],[8,8],[16,5],[32,7]]);assert.deepEqual(recolorModulation(changes,16,67).map(c=>[c.beat,c.tonic]),[[0,0],[16,7]]);});

import fs from 'node:fs';import {JSDOM} from 'jsdom';
const dist=new URL('../dist/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,dist),'utf8'));
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'Recolor did not settle');};
test('measure selection previews tonic on hover, restores on leave/Escape, and note click commits without seeking or auditioning',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('index.html',dist),'utf8'),{url:'http://localhost/#074',pretendToBeVisual:true}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,localStorage:w.localStorage,history:w.history,innerWidth:1280,innerHeight:900,requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w),matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 globalThis.fetch=async url=>({ok:true,json:async()=>read(String(url).replace(/^\.\//,''))});let auditions=0,plays=0;globalThis.SoundFontPlayback={getContext:()=>({resume:async()=>{}}),prepare:async()=>({audition(){auditions++;},play(){plays++;}}),stop(){}};
 const $=s=>w.document.querySelector(s),p=read('data/performances/074.json');
 try{
  await import('../dist/app.js?recolor-test');await wait(()=>$('#rawl-view .rawln-measure-number[data-modulation="true"]')&&!$('#play').disabled);
  const label=$('#rawl-view .rawln-measure-number[data-modulation="true"]'),beat=Number(label.dataset.beat),region=p.changes.find(c=>c.beat===beat),next=p.changes.find(c=>c.beat>beat&&c.tonic!==region.tonic)?.beat??p.beats;
  const target=p.notes.find(n=>n.start+n.duration/2>beat&&n.start+n.duration/2<=next),choice=p.notes.find(n=>n.pitch%12!==region.tonic),targetEl=()=>w.document.querySelector(`[data-note="${target.id}"]`),choiceEl=()=>w.document.querySelector(`[data-note="${choice.id}"]`),old=targetEl().dataset.degree,expected=String((target.pitch-choice.pitch+120)%12),selector=`.rawln-measure-number[data-beat="${beat}"]`;
  label.click();await wait(()=>$(selector).getAttribute('aria-pressed')==='true');choiceEl().dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));await wait(()=>targetEl().dataset.degree===expected);assert.equal($('#stop').disabled,true);assert.equal(plays,0);
  choiceEl().dispatchEvent(new w.MouseEvent('mouseout',{bubbles:true,relatedTarget:w.document.body}));await wait(()=>targetEl().dataset.degree===old);
  choiceEl().dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));await wait(()=>targetEl().dataset.degree===expected);w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));await wait(()=>targetEl().dataset.degree===old);assert.equal($(selector).getAttribute('aria-pressed'),'false');
  $(selector).click();await wait(()=>$(selector).getAttribute('aria-pressed')==='true');choiceEl().click();await wait(()=>targetEl().dataset.degree===expected);assert.equal($(selector).getAttribute('aria-pressed'),'false');assert.equal(auditions,0);assert.equal($('#stop').disabled,true);assert.equal(plays,0);
  assert.deepEqual([...w.document.querySelectorAll('#rawl-view [data-note]')].map(el=>[el.dataset.note,el.dataset.pitch]),p.notes.map(n=>[n.id,String(n.pitch)]));
 }finally{w.dispatchEvent(new w.Event('beforeunload'));dom.window.close();}
});

test('editing a measure uses its saved mid-measure modulation onset',()=>{const changes=[{beat:0,tonic:0,root:'C'},{beat:63,tonic:5,root:'F'},{beat:80,tonic:7,root:'G'}],beat=recolorBoundary(changes,60,4);assert.equal(beat,63);assert.deepEqual(recolorModulation(changes,beat,62).map(c=>[c.beat,c.tonic]),[[0,0],[63,2],[80,7]]);assert.equal(recolorBoundary(changes,64,4),64);});
