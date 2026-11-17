import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {brickType} from '../src/music/brick-groups.mjs';
const root=new URL('../dist/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'Atlas did not settle');};
test('atlas covers every canonical brick exactly once and retains source types and unresolved modifiers',()=>{
 const data=read('data/atlas.json'),index=read('data/bricks.json'),items=data.groups.flatMap(g=>g.bricks),types=JSON.parse(fs.readFileSync(new URL('../src/music/brick-types.json',import.meta.url)));
 assert.equal(items.length,index.bricks.length);assert.equal(new Set(items.map(b=>b.slug)).size,index.bricks.length);assert.deepEqual(items.map(b=>b.slug).sort(),index.bricks.map(b=>b.slug).sort());
 for(const item of items){assert.deepEqual(item.performance,read('data/brick-performances/'+item.slug+'.json'));assert.ok(item.performance.notes.length);}
 assert.equal(brickType('Straight Cadence',types).type,'Cadence');assert.equal(brickType('Minor Dropback',types).type,'Dropback');assert.equal(brickType('POT',types).type,'Turnaround');assert.equal(brickType('Straight Launcher',types).type,'Approach');
 assert.equal(brickType('Minor Dropback +...',types).type,'Unclassified');assert.equal(brickType('Straight...',types).type,'Unclassified');
});
test('catalogue renders all continuous previews with shared navigation and shares one playback transport',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('bricks.html',root),'utf8'),{url:'http://localhost:5187/bricks.html',pretendToBeVisual:true}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,innerWidth:1400,innerHeight:900,requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w),matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
 Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});w.HTMLElement.prototype.scrollIntoView=function(){};
 globalThis.fetch=async url=>({ok:true,json:async()=>read(String(url).replace(/^\.\//,''))});
 let plays=0;const context={state:'running',destination:{},currentTime:0,resume:async()=>{},createGain:()=>({gain:{value:1,setTargetAtTime(){}},connect(){},disconnect(){}})},engine={play(){plays++;return 0;},createClock:()=>({position:()=>1,beat:()=>1}),audition(){}};
 globalThis.SoundFontPlayback={getContext:()=>context,prepare:async()=>engine,stop(){}};
 const expected=read('data/bricks.json').bricks.length;const {ready}=await import('../dist/atlas.js?atlas-test'),atlas=await ready;assert.equal(atlas.cards.size,expected);
 await wait(()=>w.document.querySelectorAll('.atlas-preview .rawln').length===expected);
 assert.equal(w.document.querySelector('h1').firstChild.textContent,'Bricks');assert.equal(w.document.querySelectorAll('aside,#sidebar').length,0);assert.equal(w.document.querySelectorAll('.atlas-card').length,expected);assert.equal(w.document.querySelector('#bricks-nav').getAttribute('aria-current'),'page');assert.equal(w.document.querySelector('#songs-nav').getAttribute('href'),'./index.html#000');assert.equal(w.document.querySelector('.atlas-preview .rawln-modulation[data-beat="0"]'),null);assert.equal(w.document.querySelectorAll('.atlas-group').length,read('data/atlas.json').groups.length);
 for(const el of w.document.querySelectorAll('.atlas-card')){assert.ok(el.querySelector('[data-note]'));assert.equal(el.querySelectorAll('.rawln-row').length,1);const row=el.querySelector('.rawln-row');assert.equal(parseFloat(row.style.width),(Number(row.dataset.end)-Number(row.dataset.start))/atlas.cards.get(el.dataset.brick).item.performance.barBeats*100);assert.ok(el.querySelector('.rawln-rn'));assert.ok(el.querySelector('h3 a').getAttribute('href').startsWith('./index.html#brick/'));}
 const buttons=[...w.document.querySelectorAll('.atlas-play')];buttons[0].click();await wait(()=>plays===1&&buttons[0].getAttribute('aria-label')==='Pause');buttons[1].click();await wait(()=>plays===2&&buttons[1].getAttribute('aria-label')==='Pause');assert.equal(buttons[0].getAttribute('aria-label'),'Play');assert.equal(w.document.querySelectorAll('.atlas-play[aria-label="Pause"]').length,1);
 buttons[1].click();assert.equal(buttons[1].getAttribute('aria-label'),'Play');atlas.player.stop();assert.equal(w.document.querySelectorAll('.rawln-sounding').length,0);
 w.dispatchEvent(new w.Event('beforeunload'));dom.window.close();
});
