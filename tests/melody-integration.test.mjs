import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const {parseMidi}=createRequire(import.meta.url)('midi-file');
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8')),pad=index=>String(index).padStart(3,'0');
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(predicate(),'Reader did not settle');};

function midiNotes(midi,channel){
 const notes=[];
 for(const track of midi.tracks){let tick=0;const active=new Map();
  for(const event of track){tick+=event.deltaTime;if(event.channel!==channel)continue;
   if(event.type==='noteOn'&&event.velocity){assert.ok(!active.has(event.noteNumber),'Overlapping same-pitch source notes');active.set(event.noteNumber,{start:tick,velocity:event.velocity});}
   else if(event.type==='noteOff'||event.type==='noteOn'&&!event.velocity){const on=active.get(event.noteNumber);assert.ok(on,'Unmatched MIDI note release');notes.push([event.noteNumber,on.start,tick-on.start,on.velocity]);active.delete(event.noteNumber);}
  }
  assert.equal(active.size,0,'Hanging MIDI melody note');
 }
 return notes.sort((a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2]);
}

test('all 30 imported arrangements and the verified original Ipanema melody export separate GM65 notes on their exact source clocks',()=>{
 const original=read('data/roadmaps.json').songs,additional=read('data/additional-standards.json').songs,songs=read('data/standards.json').songs,manifest=read('data/melodies.json'),melodies=new Map(Object.values(manifest.entries).map(entry=>[entry.id,entry]));
 // Learner brick annotations may be projected; musical events and source
 // identity must remain exactly those of the underlying arrangements.
 const musicalSource=({bricks,rows,...song})=>({...song,rows:rows.map(({bricks,...row})=>row)});
 assert.equal(original.length,242);assert.equal(additional.length,30);assert.equal(songs.length,272);assert.deepEqual(songs.slice(0,242).map(musicalSource),original.map(musicalSource));assert.deepEqual(songs.slice(242).map(musicalSource),additional.map(musicalSource));
 assert.equal(additional.filter(s=>s.arrangementOf===undefined).length,22);assert.equal(additional.filter(s=>Number.isInteger(s.arrangementOf)).length,8);
 const withMelody=[];
 for(const song of songs){
  const performance=read('data/performances/'+pad(song.index)+'.json'),melody=performance.notes.filter(note=>note.voice===1);if(!melody.length)continue;withMelody.push(song.index);
  assert.ok(performance.voices.some(voice=>voice.voice===1&&voice.program===65),song.title);
  const source=melodies.get(performance.melody.id);assert.ok(source,song.title);assert.equal(melody.length,source.notes.length,song.title);
  const byId=new Map(melody.map(note=>[note.id,note]));
  source.notes.forEach((note,i)=>{const actual=byId.get('melody:'+source.id+':'+i);assert.ok(actual,song.title);assert.equal(actual.pitch,note.pitch+performance.melody.transpose,song.title);assert.equal(actual.start,note.start+performance.melody.beatOffset,song.title);assert.equal(actual.duration,note.duration,song.title);});
  const midi=parseMidi(fs.readFileSync(new URL('midi/'+pad(song.index)+'.mid',root)));assert.equal(midi.tracks.length,3,song.title);
  assert.deepEqual(midi.tracks.flatMap(track=>track.filter(event=>event.type==='programChange').map(event=>[event.channel,event.programNumber])),[[0,0],[1,65]],song.title);
  const expected=melody.map(note=>{const start=Math.round(note.start*480),end=Math.round((note.start+note.duration)*480);return[note.pitch,start,end-start,note.velocity];}).sort((a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2]);
  assert.deepEqual(midiNotes(midi,1),expected,song.title);
 }
 assert.deepEqual(withMelody,[73,...additional.map(song=>song.index)]);
 const originalWithoutMelody=parseMidi(fs.readFileSync(new URL('midi/000.mid',root)));assert.equal(originalWithoutMelody.tracks.length,2);assert.ok(!originalWithoutMelody.tracks.flat().some(event=>event.type==='programChange'&&event.programNumber===65));
});

test('persisted Melody toggle controls real Ipanema sax notes and arrangement selection switches the whole chart and source',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('index.html',root),'utf8'),{url:'http://localhost:5187/#073',pretendToBeVisual:true}),w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,localStorage:w.localStorage,history:w.history,innerWidth:1280,innerHeight:900,requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w)});
 Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.getBoundingClientRect=function(){return{left:0,right:1000,top:60,bottom:250,width:1000,height:190};};
 w.localStorage.setItem('insights-melody','hidden');w.localStorage.setItem('insights-view','rawl');
 globalThis.fetch=async url=>({ok:true,json:async()=>read(String(url).replace(/^\.\//,''))});
 const plays=[],auditions=[],context={state:'running',currentTime:0,destination:{},resume:async()=>{},createGain:()=>({gain:{value:1,setTargetAtTime(value){this.value=value;}},connect(){},disconnect(){}})};
 const engine={play(plan,mixers,offset){plays.push({plan,mixers,offset,levels:mixers.map(mixer=>mixer.gain.value)});return 0;},createClock:(_plan,_start,offset)=>({position:()=>offset,beat:()=>offset}),audition(note){auditions.push(note);}};
 globalThis.SoundFontPlayback={getContext:()=>context,prepare:async()=>engine,stop(){}};
 const $=selector=>w.document.querySelector(selector),all=selector=>[...w.document.querySelectorAll(selector)];
 try{
  await import('../dist/app.js?melody-integration');
  await wait(()=>!$('#play').disabled&&!$('#melody-voice').hidden&&$('#rawl-view [data-note]'));
  assert.equal($('#title').textContent,'The Girl from Ipanema');assert.equal($('#melody-voice').getAttribute('aria-pressed'),'false');assert.equal(all('#rawl-view [data-voice="1"]').length,0);
  $('#play').click();await wait(()=>$('#play').textContent==='Pause');assert.equal(plays.at(-1).levels[1],0);assert.ok(plays.at(-1).plan.notes.some(note=>note.voice===1));$('#stop').click();
  $('#melody-voice').click();await wait(()=>$('#rawl-view [data-voice="1"]'));assert.equal(w.localStorage.getItem('insights-melody'),'visible');assert.equal($('#melody-voice').getAttribute('aria-pressed'),'true');
  const ipanema=read('data/performances/073.json'),melodyById=new Map(ipanema.notes.filter(note=>note.voice===1).map(note=>[note.id,note]));
  for(const element of all('#rawl-view [data-note][data-voice="1"]')){const note=melodyById.get(element.dataset.note);assert.ok(note);assert.equal(Number(element.dataset.pitch),note.pitch);}
  $('#play').click();await wait(()=>$('#play').textContent==='Pause');assert.equal(plays.at(-1).levels[1],1);assert.ok(plays.at(-1).plan.voices.some(voice=>voice.voice===1&&voice.program===65));
  $('#melody-voice').click();await wait(()=>!$('#rawl-view [data-voice="1"]'));assert.equal(plays.at(-1).mixers[1].gain.value,0);assert.equal(w.localStorage.getItem('insights-melody'),'hidden');$('#stop').click();
  w.location.hash='#000';await wait(()=>$('#title').textContent==='Take The "A" Train'&&!$('#play').disabled);assert.equal($('#melody-voice').hidden,true);
  w.location.hash='#073';await wait(()=>$('#title').textContent==='The Girl from Ipanema'&&!$('#play').disabled&&!$('#melody-voice').hidden);assert.equal($('#melody-voice').getAttribute('aria-pressed'),'false');assert.equal($('#rawl-view [data-voice="1"]'),null);
  $('#melody-voice').click();await wait(()=>$('#rawl-view [data-note][data-voice="1"]'));$('#rawl-view [data-note][data-voice="1"]').click();await wait(()=>auditions.length>0);assert.equal(auditions.at(-1).program,65);

  const additional=read('data/additional-standards.json').songs,alternate=additional.find(song=>song.arrangementOf===115);assert.ok(alternate);
  w.location.hash='#115';await wait(()=>$('#title').textContent==='Just the Way You Are'&&!$('#play').disabled);assert.equal($('#arrangement').hidden,false);assert.equal($('#arrangement').value,'115');assert.equal($('#pdf-link').hidden,false);assert.equal($('#measure-count').textContent,'54 bars');assert.equal($('#melody-voice').hidden,true);
  $('#arrangement').value=String(alternate.index);$('#arrangement').dispatchEvent(new w.Event('change',{bubbles:true}));
  await wait(()=>$('#title').textContent===alternate.title&&!$('#play').disabled&&!$('#melody-voice').hidden);
  assert.equal(w.location.hash,'#'+pad(alternate.index));assert.equal($('#arrangement').value,String(alternate.index));assert.equal($('#measure-count').textContent,alternate.bars+' bars');assert.notEqual(alternate.bars,54);assert.equal($('#pdf-link').hidden,true);assert.equal($('#source-image').hidden,true);assert.equal($('#source-encoded').hidden,false);assert.equal($('#midi-download').getAttribute('href'),'./midi/'+pad(alternate.index)+'.mid');
  assert.equal(all('#songs a.song-link[href="#'+pad(alternate.index)+'"]').length,0);assert.ok($('#songs a.song-link[href="#115"]').classList.contains('active'));
  const actualPerformance=read('data/performances/'+pad(alternate.index)+'.json');$('#play').click();await wait(()=>$('#play').textContent==='Pause');assert.equal(plays.at(-1).plan.beats,actualPerformance.beats);assert.deepEqual(plays.at(-1).plan.notes.map(n=>[n.voice,n.pitch,n.start,n.duration]),actualPerformance.notes.map(n=>[n.voice,n.pitch,n.start,n.duration]));$('#stop').click();
  $('#original').click();assert.equal($('#source-view').hidden,false);assert.equal($('#source-image').hidden,true);assert.ok($('#source-encoded').textContent.includes(alternate.encodedChanges[0].symbol));assert.equal($('#source-page').textContent,'MusicXML');
  $('#arrangement').value='115';$('#arrangement').dispatchEvent(new w.Event('change',{bubbles:true}));await wait(()=>$('#title').textContent==='Just the Way You Are'&&!$('#play').disabled);assert.equal($('#pdf-link').hidden,false);assert.equal($('#source-image').hidden,false);assert.equal($('#source-encoded').hidden,true);assert.equal($('#midi-download').getAttribute('href'),'./midi/115.mid');
 }finally{w.dispatchEvent(new w.Event('beforeunload'));dom.window.close();}
});
