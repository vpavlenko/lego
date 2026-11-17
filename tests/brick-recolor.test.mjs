import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const dist=new URL('../dist/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,dist),'utf8'));
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'Brick recoloring did not settle');};
test('source Whoopee Turnaround variants inherit library measure selection and recolor notes plus RN/chord labels independently',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('index.html',dist),'utf8'),{url:'http://localhost/#brick/whoopee-turnaround',pretendToBeVisual:true}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,localStorage:w.localStorage,history:w.history,innerWidth:1280,innerHeight:900,requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w),matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 globalThis.fetch=async url=>({ok:true,json:async()=>read(String(url).replace(/^\.\//,''))});let auditions=0;globalThis.SoundFontPlayback={getContext:()=>({resume:async()=>{}}),prepare:async()=>({audition(){auditions++;}}),stop(){}};
 const $=s=>w.document.querySelector(s);
 try{
  await import('../dist/app.js?brick-recolor-test');await wait(()=>[...w.document.querySelectorAll('.brick-variant')].length>1&&[...w.document.querySelectorAll('.brick-variant')].every(card=>card.querySelector('[data-note]')));
  const [first,second]=w.document.querySelectorAll('.brick-variant'),note=first.querySelector('[data-note]'),pitch=Number(note.dataset.pitch),target=first.querySelector('[data-note][data-pitch="'+pitch+'"]'),before=second.querySelector('[data-note]').dataset.degree;
  first.querySelector('.rawln-measure-number').click();await wait(()=>first.querySelector('.rawln-measure-number').getAttribute('aria-pressed')==='true');note.click();await wait(()=>target.dataset.degree==='0');assert.equal(first.querySelector('.rawln-measure-number').getAttribute('aria-pressed'),'false');assert.equal(second.querySelector('[data-note]').dataset.degree,before);assert.equal(auditions,0);
  assert.equal(first.querySelector('.rawln-chord').dataset.degree,'0');assert.ok($('#brick-view h1 .brick-degree'));assert.equal($('#tempo').value,'120');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'=',bubbles:true,cancelable:true}));assert.equal($('#tempo').value,'132');
 }finally{w.dispatchEvent(new w.Event('beforeunload'));dom.window.close();}
});
