import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {notationRows} from '../src/music/notation-rows.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(predicate(),'Pickup notation did not settle');};
function fixture(offset=1){
 const rows=Array.from({length:4},(_,i)=>({startBar:i*2,bars:2,keys:[{start:0,end:2,root:'C',mode:'Major'}],joins:[],bricks:[{start:0,end:2,name:'Fixture'}],chords:[{start:0,end:2,symbol:'C'}]}));
 const song={index:4,title:'Fixture',tonic:['C','Major'],meter:[4,4],bars:8,columns:8,rows};
 const sections=rows.map((row,i)=>({start:row.startBar,end:row.startBar+2,bars:2,label:i===2?'B':'A',layoutRow:i===0?0:i===3?2:1,layoutColumn:i===2?2:0}));
 const notes=rows.map((row,i)=>({id:'chord-'+i,pitch:60,start:row.startBar*4+offset,duration:8,voice:0}));
 if(offset)notes.push({id:'pickup',pitch:72,start:0,duration:offset,voice:1});
 notes.push({id:'head',pitch:74,start:offset,duration:1,voice:1});
 const performance={song:4,title:'Fixture',tempo:120,meter:[4,4],barBeats:4,beats:32+offset,clockOffset:offset,tonic:0,changes:[{beat:0,tonic:0,root:'C'}],notes,chords:rows.map((row,i)=>({id:i,symbol:'C',start:row.startBar*4+offset,end:(row.startBar+2)*4+offset})),rows:rows.map(row=>({start:row.startBar*4+offset,end:(row.startBar+2)*4+offset})),measureMap:[...(offset?[{start:0,duration:offset,sourceNumber:'0'}]:[]),...Array.from({length:8},(_,i)=>({start:i*4+offset,duration:4,sourceNumber:String(i+1)}))]};
 return {song,performance,form:{aligned:true,columns:4,sections,phraseStarts:[0,8,16,24,32]}};
}
function percent(value){
 if(value.startsWith('calc('))return [...value.matchAll(/([\d.]+)%/g)].reduce((n,m)=>n+Number(m[1]),0);
 return Number.parseFloat(value);
}

test('pickup width is reserved once while every repeated form section keeps its original pixel measure scale',()=>{
 for(const offset of [.5,1,3]){
  const data=fixture(offset),rows=notationRows(data),before=JSON.stringify(data);
  assert.deepEqual(rows.map(row=>[row.start,row.end]),[[0,8+offset],[8+offset,16+offset],[16+offset,24+offset],[24+offset,32+offset]]);
  assert.deepEqual(rows.map(row=>[row.style.gridRow,row.style.gridColumn]),[[1,'1 / span 2'],[2,'1 / span 2'],[2,'3 / span 2'],[3,'1 / span 2']]);
  // A 4-column grid with 100px per PDF bar gives each section 200px.
  // Pickup space is therefore offset/4*100px, independent of section size.
  const boxes=rows.map(row=>({row,width:percent(row.style.width)*2,left:(Number.parseInt(row.style.gridColumn)-1)*100+(row.style.marginLeft?percent(row.style.marginLeft)*2:0)}));
  const x=(box,beat)=>box.left+(beat-box.row.start)/(box.row.end-box.row.start)*box.width;
  const prefix=offset/4*100;
  near(x(boxes[0],offset),prefix);near(x(boxes[1],8+offset),prefix);near(x(boxes[3],24+offset),prefix);
  near(percent(rows[0].style['--pickup-label-offset'])/100*boxes[0].width,prefix);
  assert.ok(rows.slice(1).every(row=>!('--pickup-label-offset' in row.style)));
  for(const box of boxes)near(box.width/(box.row.end-box.row.start),25);
  near(boxes[1].left+boxes[1].width,boxes[2].left);
  near(x(boxes[0],offset+4),x(boxes[1],8+offset+4));
  assert.equal(JSON.stringify(data),before);
 }
});

test('nonform pickup rows do not consume a full-measure slot and use one common inset for full and short rows',()=>{
 const {song,performance}=fixture(1);song.columns=8;
 // One long source row verifies splitting into full-bar groups rather than
 // counting the pickup as one of those bars.
 performance.rows=[{start:1,end:33}];
 for(const mobile of [false,true]){
  const rows=notationRows({song,performance,mobile}),capacity=mobile?4:8;
  assert.equal(rows[0].start,0);assert.equal(rows.at(-1).end,33);
  assert.equal(rows[0].end,capacity*4+1);
  for(let i=1;i<rows.length;i++){assert.equal(rows[i].start,rows[i-1].end);near(percent(rows[i].style.marginLeft),1/(capacity*4)*100);}
  const parentWidth=capacity*100;
  for(const row of rows)near(percent(row.style.width)/100*parentWidth/(row.end-row.start),25);
 }
 const fixed=notationRows({song,performance,barsPerRow:4,measureWidth:100});
 assert.equal(fixed[0].style.width,425);assert.equal(fixed[1].style.width,400);assert.equal(fixed[1].style.marginLeft,25);
 // Accept a performance row that already includes the prefix without
 // counting its measure-zero entry twice.
 performance.rows=[{start:0,end:33}];assert.deepEqual(notationRows({song,performance,barsPerRow:4,measureWidth:100}),fixed);
});

test('zero-offset form and continuous brick geometry are unchanged',()=>{
 const {song,performance,form}=fixture(0),rows=notationRows({song,performance,form});
 assert.deepEqual(rows.map(row=>row.style),[{gridRow:1,gridColumn:'1 / span 2'},{gridRow:2,gridColumn:'1 / span 2'},{gridRow:2,gridColumn:'3 / span 2'},{gridRow:3,gridColumn:'1 / span 2'}]);
 assert.deepEqual(notationRows({song,performance,continuous:true,measureWidth:100}),[{start:0,end:32,style:{width:800}}]);
 const pickup=fixture(1);assert.deepEqual(notationRows({...pickup,continuous:true,measureWidth:100}),[{start:0,end:33,style:{width:825}}]);
});

test('pickup rendering shifts PDF brick and phrase times, preserves measure numbering and keeps brick links in PDF coordinates',async()=>{
 const dom=new JSDOM('<!doctype html><body><div id="score"></div></body>',{pretendToBeVisual:true,url:'http://localhost/'}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,right:800,top:0,bottom:200,width:800,height:200});
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/rawl-view.jsx',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
 const {mountRawlView}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const {song,performance,form}=fixture(1),brickMap=new Map([['Fixture',{name:'Fixture',slug:'fixture'}]]),selections=[];
 const host=mountRawlView(w.document.querySelector('#score'),{song,performance,form,brickMap,onMeasureSelect:beat=>selections.push(beat)});
 try{
  await wait(()=>w.document.querySelectorAll('.rawln-row').length===4&&w.document.querySelector('[data-note="pickup"]'));
  const rows=[...w.document.querySelectorAll('.rawln-row')];
  assert.deepEqual(rows.map(row=>[Number(row.dataset.start),Number(row.dataset.end)]),[[0,9],[9,17],[17,25],[25,33]]);
  const first=rows[0],annotation=first.querySelector('.rawln-annotation');
  near(Number.parseFloat(first.style.getPropertyValue('--pickup-label-offset')),100/9);
  assert.equal(annotation.dataset.brickStart,'1');assert.equal(annotation.dataset.brickEnd,'9');assert.equal(annotation.getAttribute('href'),'#brick/fixture?song=4&beat=0');
  near(Number.parseFloat(annotation.style.left),100/9);near(Number.parseFloat(first.querySelector('.harmony-cell').style.left),100/9);
  assert.equal(first.querySelector('.rawln-measure-number[data-beat="1"]').textContent,'1');assert.equal(rows[1].querySelector('.rawln-measure-number[data-beat="9"]').textContent,'3');
  for(const beat of [1,9,17,25,33])assert.ok(w.document.querySelector(`.rawln-phrase-bar[data-beat="${beat}"]`),'shifted phrase '+beat);
  assert.equal(w.document.querySelector('.rawln-phrase-bar[data-beat="0"]'),null);
  assert.ok(w.document.querySelector('[data-note="pickup"]'));assert.equal(first.querySelector('[data-note="pickup"]').style.left,'0%');
  first.querySelector('.rawln-measure-number[data-beat="1"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.deepEqual(selections,[1]);
 }finally{host.destroy();dom.window.close();}
});
