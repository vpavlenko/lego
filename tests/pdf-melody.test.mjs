import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {mapPDFMelody,mergePDFMelody,withMelodyPrelude} from '../src/music/pdf-melody.mjs';
import {performedNotes} from '../src/music/performance-style.mjs';
import {playbackPlan} from '../src/music/realization.mjs';
import {encodeMidi} from '../src/music/midi.mjs';
const {parseMidi}=createRequire(import.meta.url)('midi-file');
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const pad=index=>String(index).padStart(3,'0');
const near=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(predicate(),'Notation did not settle');};
function fixture(){
 const entry={id:'fixture-head',title:'Fixture',totalBeats:2,notes:[{pitch:60,start:0,duration:.5},{pitch:62,start:.5,duration:.5},{pitch:64,start:1,duration:1}],provenance:{sha256:'pinned-source',url:'https://example.test/source'}};
 const alignment={song:4,melodyId:entry.id,sourceSha256:entry.provenance.sha256,transpose:2,segments:[{sourceStart:0,sourceEnd:2,targetStart:0,targetEnd:4}],basis:'bar-grid'};
 const chord={id:0,symbol:'C',sourceSymbol:'C',start:0,end:4,pitches:[72]},performance={song:4,title:'Fixture',tempo:120,meter:[4,4],barBeats:4,beats:4,tonic:0,changes:[{beat:0,tonic:0,root:'C'}],rows:[{start:0,end:4,label:1}],chords:[chord],notes:[{id:'chord',pitch:72,start:0,duration:4,voice:0,velocity:74}]};
 return {entry,alignment,performance};
}
function withPerformed(performance,entry,alignment){
 const overlay=mapPDFMelody(performance,entry,alignment);
 const source=performedNotes({notes:entry.notes.map((note,i)=>({...note,id:'source-'+i,voice:1})),beats:entry.totalBeats,meter:[4,4]});
 const interpreted=mapPDFMelody(performance,entry,alignment,{notes:source});
 return {...overlay,performedNotes:interpreted.notes};
}
function midiEvents(bytes,channel){
 const midi=parseMidi(bytes),events=[];
 for(const track of midi.tracks){let tick=0;for(const event of track){tick+=event.deltaTime;if(event.channel!==channel)continue;if(event.type==='noteOn'&&event.velocity)events.push(['on',event.noteNumber,tick,event.velocity]);else if(event.type==='noteOff'||event.type==='noteOn'&&!event.velocity)events.push(['off',event.noteNumber,tick]);}}
 return {ppq:midi.header.ticksPerBeat,events:events.sort((a,b)=>a[2]-b[2]||a[0].localeCompare(b[0])||a[1]-b[1])};
}

test('bar maps validate pinned source and target identities, pitches and segment bounds',()=>{
 const {entry,alignment,performance}=fixture();
 for(const [source,map] of [[{...entry,id:'different'},alignment],[{...entry,provenance:{...entry.provenance,sha256:'changed'}},alignment],[entry,{...alignment,song:5}],[entry,{...alignment,transpose:.5}],[entry,{...alignment,transpose:80}]])assert.throws(()=>mapPDFMelody(performance,source,map));
 for(const segments of [[],[{sourceStart:-1,sourceEnd:2,targetStart:0,targetEnd:4}],[{sourceStart:0,sourceEnd:3,targetStart:0,targetEnd:4}],[{sourceStart:0,sourceEnd:2,targetStart:0,targetEnd:5}],[{sourceStart:0,sourceEnd:0,targetStart:0,targetEnd:4}],[{sourceStart:0,sourceEnd:1,targetStart:0,targetEnd:3},{sourceStart:1,sourceEnd:2,targetStart:2,targetEnd:4}],[{sourceStart:0,sourceEnd:2,targetStart:NaN,targetEnd:4}]])assert.throws(()=>mapPDFMelody(performance,entry,{...alignment,segments}));
});

test('mapping clips selected source phrases, replaces only the sax voice and leaves frozen PDF data untouched',()=>{
 const {entry,alignment,performance}=fixture();
 performance.notes.push({id:'old-melody',pitch:90,start:0,duration:1,voice:1});
 const before=JSON.stringify({entry,alignment,performance});freeze(entry);freeze(alignment);freeze(performance);
 const map={...alignment,segments:[{sourceStart:.25,sourceEnd:1.5,targetStart:1,targetEnd:3.5}]};
 assert.throws(()=>mapPDFMelody(performance,entry,map),/route cut/);
 const overlay=mapPDFMelody(performance,entry,{...map,boundaryPolicy:'clip-reviewed'}),merged=mergePDFMelody(performance,overlay);
 assert.deepEqual(overlay.notes.map(n=>[n.pitch,n.start,n.duration]),[[62,1,.5],[64,1.5,1],[66,2.5,1]]);
 assert.equal(merged.notes.find(n=>n.voice===0),performance.notes[0]);assert.ok(!merged.notes.some(n=>n.id==='old-melody'));
 for(const field of ['chords','rows','changes','meter'])assert.equal(merged[field],performance[field]);
 assert.equal(merged.beats,4);assert.equal(merged.voices.find(v=>v.voice===1).program,65);
 assert.equal(JSON.stringify({entry,alignment,performance}),before);assert.equal(mergePDFMelody(performance,null),performance);
});

test('source swing is interpreted before a nonunit bar map and preserves source-index note identity',()=>{
 const {entry,alignment,performance}=fixture(),overlay=withPerformed(performance,entry,alignment),merged=mergePDFMelody(performance,overlay),played=performedNotes(merged);
 assert.deepEqual(overlay.notes.map(n=>[n.start,n.duration]),[[0,1],[1,1],[2,2]]);
 near(overlay.performedNotes[0].duration,1.34);near(overlay.performedNotes[1].start,1.34);near(overlay.performedNotes[1].duration,.66);
 assert.deepEqual(overlay.performedNotes.map(n=>n.id),overlay.notes.map(n=>n.id));
 assert.deepEqual(played.filter(n=>n.voice===1),overlay.performedNotes);
 assert.equal(played.find(n=>n.voice===0),performance.notes[0]);
 const plan=playbackPlan({...merged,notes:played},120),ons=plan.events.filter(e=>e.channel===1&&e.type==='on');
 near(ons[1].beat,1.34);near(plan.timeAt(ons[1].beat),.67);
});

test('published PDF overlays retain original PDF chords and annotations independently of reharmonized melody sources',()=>{
 const manifest=read('data/standards.json'),sources=read('data/melody-sources.json').entries,alignments=JSON.parse(fs.readFileSync(new URL('../src/music/pdf-melody-alignments.json',import.meta.url),'utf8')).entries;
 assert.ok(Object.keys(manifest.pdfMelodies??{}).length>=60);
 for(const [key,reference] of Object.entries(manifest.pdfMelodies)){
  const song=manifest.songs[Number(key)],original=read('data/performances/'+pad(song.index)+'.json'),overlay=read(reference.url.replace(/^\.\//,'')),merged=mergePDFMelody(original,overlay),alignment=alignments.find(a=>a.song===song.index),source=sources[reference.melodyId];
  assert.ok(song.page);assert.equal(song.arrangementOf,undefined);assert.equal(reference.melodyId,overlay.melody.id);assert.equal(alignment.sourceSha256,source.provenance.sha256);
  const target=withMelodyPrelude(original,alignment.clockOffset??0);
  assert.deepEqual(merged.notes.filter(n=>n.voice!==1),target.notes.filter(n=>n.voice!==1));
  for(const field of ['chords','changes','sourceChanges','rows','meter','beats'])assert.deepEqual(merged[field],target[field],song.title+' '+field);
  const expected=mapPDFMelody(target,source,alignment);assert.deepEqual(overlay.notes,expected.notes,song.title);
  assert.ok(overlay.notes.every(n=>n.voice===1&&n.start>=0&&n.duration>0&&n.start+n.duration<=target.beats+1e-7),song.title);
  assert.deepEqual(midiEvents(fs.readFileSync(new URL(reference.midi.replace(/^\.\//,''),root)),0),midiEvents(encodeMidi(target),0),song.title+' piano MIDI');
  assert.deepEqual(midiEvents(fs.readFileSync(new URL(reference.midi.replace(/^\.\//,''),root)),1),midiEvents(encodeMidi(merged),1),song.title+' sax MIDI');
 }
 const alice=manifest.songs[4],aliceOverlay=read(manifest.pdfMelodies[4].url.replace(/^\.\//,''));
 assert.ok(alice.rows[0].bricks.some(brick=>brick.name==='Autumn Leaves Opening'&&brick.start===0&&brick.end===7));
 assert.equal(aliceOverlay.notes.length,109);assert.equal(aliceOverlay.melody.transpose,0);assert.deepEqual(aliceOverlay.melody.segments,[{sourceStart:0,sourceEnd:192,targetStart:0,targetEnd:192}]);
 const reharmonized=manifest.pdfMelodies[28],body=mergePDFMelody(read('data/performances/028.json'),read(reharmonized.url.replace(/^\.\//,'')));
 assert.ok(body.notes.some(n=>n.voice===1));assert.ok(manifest.songs[28].rows.some(row=>row.bricks.length));
});

test('pickup overlays preserve every selected pickup attack and held note before the first PDF chord',()=>{
 const manifest=read('data/standards.json'),sources=read('data/melody-sources.json').entries;
 let pickups=0,crossing=0;
 for(const [key,reference] of Object.entries(manifest.pdfMelodies)){
  const overlay=read(reference.url.replace(/^\.\//,'')),offset=overlay.clockOffset??0;if(!offset)continue;
  const original=read('data/performances/'+pad(Number(key))+'.json'),before=JSON.stringify(original),source=sources[reference.melodyId],merged=mergePDFMelody(original,overlay);
  assert.equal(merged.chords[0].start,original.chords[0].start+offset);assert.equal(merged.measureMap[0].sourceNumber,'0');assert.equal(merged.measureMap[1].start,offset);assert.equal(merged.measureMap[1].sourceNumber,'1');
  const incoming=source.notes.map((note,index)=>({note,index})).filter(({note})=>note.start<offset-1e-7);
  pickups+=incoming.length;crossing+=incoming.filter(({note})=>note.start+note.duration>offset+1e-7).length;
  for(const {note,index}of incoming){const mapped=overlay.notes.find(n=>n.sourceIndex===index);assert.ok(mapped);near(mapped.start,note.start);near(mapped.duration,note.duration);assert.equal(mapped.pitch,note.pitch+overlay.melody.transpose);}
  assert.equal(JSON.stringify(original),before);
 }
 assert.equal(pickups,114);assert.equal(crossing,3);
});

test('Just in Time selects its final written chorus at original speed and Cry Me a River keeps the C-minor opening reference',()=>{
 const manifest=read('data/standards.json'),sources=read('data/melody-sources.json').entries;
 const just=read(manifest.pdfMelodies[114].url.replace(/^\.\//,'')),entry=sources[just.melody.id];
 assert.deepEqual(just.melody.segments,[{sourceStart:128,sourceEnd:256,targetStart:0,targetEnd:128}]);assert.equal(just.melody.transpose,2);assert.equal(just.notes.length,81);
 for(const note of just.notes){const source=entry.notes[note.sourceIndex];assert.equal(note.pitch,source.pitch+2);near(note.start,source.start-128);near(note.duration,source.duration);}
 const cry=read(manifest.pdfMelodies[42].url.replace(/^\.\//,''));assert.equal(cry.melody.transpose,0);assert.equal(manifest.songs[42].tonic[1],'Minor');
});

test('mapped playback onsets and doubled note heights use the same performed clock while audition keeps the mapped sax register',async()=>{
 const dom=new JSDOM('<!doctype html><body><div id="score"></div></body>',{url:'http://localhost/',pretendToBeVisual:true}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,right:800,top:0,bottom:200,width:800,height:200});
 const {entry,alignment,performance}=fixture(),overlay=withPerformed(performance,entry,alignment),merged=mergePDFMelody(performance,overlay),auditions=[];
 const song={index:4,title:'Fixture',tonic:['C','Major'],meter:[4,4],bars:1,columns:1,rows:[{startBar:0,bars:1,keys:[{start:0,end:1,root:'C',mode:'Major'}],bricks:[],joins:[],chords:[{start:0,end:1,symbol:'C'}]}]};
 const {mountRawlView}=await import('../dist/rawl-view.js?pdf-melody-test');
 const host=mountRawlView(w.document.querySelector('#score'),{song,performance:merged,brickMap:new Map(),onNote:note=>auditions.push(note)});
 try{
  const firstId=overlay.notes[0].id,secondId=overlay.notes[1].id,first=()=>w.document.querySelector(`[data-note="${firstId}"]`),second=()=>w.document.querySelector(`[data-note="${secondId}"]`);
  await wait(()=>first()&&second());
  const plan=playbackPlan({...merged,notes:performedNotes(merged)},120),secondOn=plan.notes.find(n=>n.id===secondId);near(secondOn.start,1.34);
  assert.ok(Number(first().dataset.pitch)>overlay.notes[0].pitch);
  const baseHeight=Number.parseFloat(first().style.height);host.setPosition(1.2);await wait(()=>Number.parseFloat(first().style.height)===baseHeight*2);assert.equal(Number.parseFloat(second().style.height),baseHeight);
  host.setPosition(secondOn.start+.01);await wait(()=>Number.parseFloat(second().style.height)===baseHeight*2);assert.equal(Number.parseFloat(first().style.height),baseHeight);
  first().dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(auditions.length,1);assert.equal(auditions[0].pitch,overlay.notes[0].pitch);assert.equal(auditions[0].duration,overlay.notes[0].duration);
  const manifest=read('data/standards.json'),alice=manifest.songs[4],aliceOverlay=read(manifest.pdfMelodies[4].url.replace(/^\.\//,''));
  const alicePerformance=mergePDFMelody(read('data/performances/004.json'),aliceOverlay),bricks=read('data/bricks.json').bricks;
  const brickMap=new Map(bricks.flatMap(brick=>[brick.name,...brick.aliases,...(brick.sourceNames??[])].map(name=>[name,brick])));
  host.update({song:alice,performance:{...alicePerformance,changes:read('data/modulations.json').changes[4]},brickMap});
  await wait(()=>w.document.querySelector('.rawln-annotation[data-brick-start="0"][data-brick-end="21"]')&&w.document.querySelector('[data-note="'+aliceOverlay.notes[0].id+'"]'));
  assert.match(w.document.querySelector('.rawln-annotation[data-brick-start="0"][data-brick-end="21"]').textContent,/Autumn Leaves/);
  assert.ok(w.document.querySelector('[data-note][data-voice="1"]'),'PDF Autumn Leaves header and sax melody render together');
 }finally{host.destroy();dom.window.close();}
});

test('the reader plays a complete pickup with PDF analysis, shifted measure controls and a persisted melody toggle',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('index.html',root),'utf8'),{url:'http://localhost/#001?brick=straight&beat=4',pretendToBeVisual:true}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,history:w.history,localStorage:w.localStorage,innerWidth:1280,innerHeight:900,requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w)});
 Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,right:800,top:50,bottom:300,width:800,height:250});
 globalThis.fetch=async url=>({ok:true,json:async()=>read(String(url).replace(/^\.\//,''))});
 const plays=[],context={state:'running',currentTime:0,destination:{},resume:async()=>{},createGain:()=>({gain:{value:1,setTargetAtTime(value){this.value=value;}},connect(){},disconnect(){}})},engine={play(plan,mixers,offset){plays.push({plan,mixers,offset});return 0;},createClock:(_plan,_start,offset)=>({position:()=>offset,beat:()=>offset}),audition(){}};
 globalThis.SoundFontPlayback={getContext:()=>context,prepare:async()=>engine,stop(){}};
 const $=selector=>w.document.querySelector(selector),manifest=read('data/standards.json'),overlay=read(manifest.pdfMelodies[1].url.replace(/^\.\//,'')),offset=overlay.clockOffset;
 try{
  await import('../dist/app.js?pdf-pickup-reader');
  await wait(()=>!$('#play').disabled&&$('#rawl-view [data-voice="1"]')&&$('#rawl-view .brick-splash'));
  assert.equal($('#arrangement').value,'1');assert.equal($('#pdf-link').hidden,false);assert.equal($('#melody-voice').hidden,false);assert.equal($('#melody-source').getAttribute('href'),manifest.pdfMelodies[1].source);assert.equal($('#midi-download').getAttribute('href'),manifest.pdfMelodies[1].midi);
  assert.equal($('#rawl-view .rawln-measure-number[data-beat="'+offset+'"]').textContent,'1');
  const firstChord=$('#rawl-view .harmony-cell'),firstRow=$('#rawl-view .rawln-row');assert.ok(Number.parseFloat(firstChord.style.left)>0);assert.equal(firstRow.dataset.start,'0');
  const selected=$('#rawl-view .rawln-annotation[data-brick-start="'+(4+offset)+'"]');assert.ok(selected);assert.ok(selected.getAttribute('href').includes('beat=4'));assert.ok(selected.closest('.rawln-row').querySelector('.brick-splash'));
  $('#header-play').click();await wait(()=>plays.length===1);assert.equal(plays[0].offset,0);assert.equal(Math.min(...plays[0].plan.notes.filter(n=>n.voice===0).map(n=>n.start)),offset);assert.equal(Math.min(...plays[0].plan.notes.filter(n=>n.voice===1).map(n=>n.start)),0);
  const expected=mergePDFMelody(read('data/performances/001.json'),overlay);assert.deepEqual(plays[0].plan.notes.map(n=>[n.id,n.pitch,n.start,n.duration]),performedNotes(expected).map(n=>[n.id,n.pitch,n.start,n.duration]));$('#stop').click();
  $('#digital').click();await wait(()=>$('#score .rawln-measure-number[data-beat="'+offset+'"]'));assert.equal($('#score .rawln-measure-number[data-beat="'+offset+'"]').textContent,'1');assert.equal(Number($('#score [data-chord-start]').dataset.chordStart),offset);
  assert.deepEqual([...w.document.querySelectorAll('#score .rawln-measure-number')].map(n=>[n.dataset.beat,n.textContent]),[...w.document.querySelectorAll('#rawl-view .rawln-measure-number')].map(n=>[n.dataset.beat,n.textContent]));
  $('#notation-view').click();$('#melody-voice').click();await wait(()=>!$('#rawl-view [data-voice="1"]'));assert.equal(w.localStorage.getItem('insights-melody'),'hidden');$('#melody-voice').click();await wait(()=>$('#rawl-view [data-voice="1"]'));assert.equal(w.localStorage.getItem('insights-melody'),'visible');
 }finally{w.dispatchEvent(new w.Event('beforeunload'));dom.window.close();}
});
