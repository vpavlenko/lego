import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {melodyDisplay} from '../src/music/melody-display.mjs';
import {performedNotes} from '../src/music/performance-style.mjs';
import {visibleAnalysis} from '../src/music/visible-analysis.mjs';
import {mergePDFMelody} from '../src/music/pdf-melody.mjs';
const {parseMidi}=createRequire(import.meta.url)('midi-file');
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8')),pad=index=>String(index).padStart(3,'0');
const displayed=index=>{const base=read('data/performances/'+pad(index)+'.json'),overlay=read('data/standards.json').pdfMelodies?.[index];return mergePDFMelody(base,overlay?read(overlay.url.replace(/^\.\//,'')):null);};
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

test('all imported source arrangements and verified original matches export separate GM65 notes on their exact source clocks',()=>{
 const original=read('data/roadmaps.json').songs,additional=read('data/additional-standards.json').songs,songs=read('data/standards.json').songs,manifest=read('data/melody-sources.json'),melodies=new Map(Object.values(manifest.entries).map(entry=>[entry.id,entry]));
 // Learner brick annotations may be projected; musical events and source
 // identity must remain exactly those of the underlying arrangements.
 const musicalSource=({bricks,rows,...song})=>({...song,rows:rows.map(({bricks,...row})=>row)});
 assert.equal(original.length,242);assert.ok(additional.length>=118);assert.equal(songs.length,original.length+additional.length);assert.deepEqual(additional.map(s=>s.index),Array.from({length:additional.length},(_,i)=>242+i));assert.deepEqual(songs.slice(0,242).map(musicalSource),original.map(visibleAnalysis).map(musicalSource));assert.deepEqual(songs.slice(242).map(musicalSource),additional.map(visibleAnalysis).map(musicalSource));
 const firstPS=['alice-in-wonderland','anthropology','bessie-s-blues','black-narcissus','bohemia-after-dark','ceora','cheerokee','cry-me-a-river','darn-that-dream','django','don-t-blame-me','east-of-the-sun','easy-to-love','emily','favela','fools-rush-in','four-brothers','harlem-nocturne','how-about-you','how-long-has-this-been-going-on','i-cover-the-waterfront','i-didn-t-know-what-time-it-was','in-a-sentimental-mood','it-never-entered-my-mind','jordu','just-the-way-you-are','just-you-just-me','ladies-in-mercedes','leila','little-sunflower'];
 assert.deepEqual(additional.slice(0,30).map(s=>s.melodyId),firstPS.map(id=>'psjazz-realbook-'+id));
 assert.equal(additional.slice(0,30).filter(s=>s.arrangementOf===undefined).length,22);assert.equal(additional.slice(0,30).filter(s=>Number.isInteger(s.arrangementOf)).length,8);
 for(const song of additional){assert.ok(melodies.has(song.melodyId),song.title);if(Number.isInteger(song.arrangementOf))assert.ok(song.arrangementOf>=0&&song.arrangementOf<song.index&&songs[song.arrangementOf].arrangementOf===undefined);assert.equal(song.image,null);assert.equal(song.page,null);}
 const body=additional.find(s=>s.melodyId==='openbook-body-and-soul-real');assert.ok(body);assert.equal(body.arrangementOf,28);assert.equal(body.source.format,'LilyPond');assert.equal(body.bars,32);
 const withMelody=[];
 for(const song of songs){
  const performance=read('data/performances/'+pad(song.index)+'.json'),melody=performance.notes.filter(note=>note.voice===1);if(!melody.length)continue;withMelody.push(song.index);
  assert.ok(performance.voices.some(voice=>voice.voice===1&&voice.program===65),song.title);
  const source=melodies.get(performance.melody.id);assert.ok(source,song.title);assert.equal(melody.length,source.notes.length,song.title);
  const byId=new Map(melody.map(note=>[note.id,note]));
  source.notes.forEach((note,i)=>{const actual=byId.get('melody:'+source.id+':'+i);assert.ok(actual,song.title);assert.equal(actual.pitch,note.pitch+performance.melody.transpose,song.title);assert.equal(actual.start,note.start+performance.melody.beatOffset,song.title);assert.equal(actual.duration,note.duration,song.title);});
  const midi=parseMidi(fs.readFileSync(new URL('midi/'+pad(song.index)+'.mid',root)));assert.equal(midi.tracks.length,3,song.title);
  assert.deepEqual(midi.tracks.flatMap(track=>track.filter(event=>event.type==='programChange').map(event=>[event.channel,event.programNumber])),[[0,0],[1,65]],song.title);
  const expected=melody.map(note=>{const start=Math.round(note.start*midi.header.ticksPerBeat),end=Math.round((note.start+note.duration)*midi.header.ticksPerBeat);return[note.pitch,start,end-start,note.velocity];}).sort((a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2]);
  assert.deepEqual(midiNotes(midi,1),expected,song.title);
 }
 const expectedMelodySongs=new Set([...additional.map(song=>song.index),...(manifest.existingMatches??[]).map(match=>match.song)]);assert.deepEqual(withMelody,[...expectedMelodySongs].sort((a,b)=>a-b));assert.ok(withMelody.length>=119);
 const originalWithoutMelody=parseMidi(fs.readFileSync(new URL('midi/000.mid',root)));assert.equal(originalWithoutMelody.tracks.length,2);assert.ok(!originalWithoutMelody.tracks.flat().some(event=>event.type==='programChange'&&event.programNumber===65));
});

test('every visible chart has a tempo record tied to its catalog identity and source',()=>{
 const {tempos,version}=read('data/standard-tempos.json');
 const songs=read('data/standards.json').songs.filter(song=>Number.isInteger(song.page)&&song.image);
 assert.equal(version,1);
 assert.deepEqual(Object.keys(tempos),songs.map(song=>String(song.index)));
 for(const song of songs){
  const {title,bpm,source}=tempos[song.index];
  assert.equal(title,song.title);
  assert.ok(Number.isInteger(bpm)&&bpm>=40&&bpm<=260,song.title);
  assert.match(source.url,/^https:\/\//,song.title);
 }
});

test('PDF-only navigation loads each chart’s sourced tempo and retains actual corpus melody playback',async()=>{
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
  const {tempos}=read('data/standard-tempos.json');
  assert.equal(Number($('#tempo').value),tempos[73].bpm);
  assert.equal($('#title').textContent,'The Girl from Ipanema');assert.equal($('#melody-voice').getAttribute('aria-pressed'),'false');assert.equal(all('#rawl-view [data-voice="1"]').length,0);
  $('#play').click();await wait(()=>$('#play').textContent==='Pause');assert.equal(plays.at(-1).levels[1],0);assert.ok(plays.at(-1).plan.notes.some(note=>note.voice===1));$('#stop').click();
  $('#melody-voice').click();await wait(()=>$('#rawl-view [data-voice="1"]'));assert.equal(w.localStorage.getItem('insights-melody'),'visible');assert.equal($('#melody-voice').getAttribute('aria-pressed'),'true');
  assert.ok(Math.min(...all('#rawl-view [data-voice="1"]').map(el=>Number(el.style.zIndex)))>Math.max(...all('#rawl-view [data-voice="0"]').map(el=>Number(el.style.zIndex))));
  const ipanema=read('data/performances/073.json'),melodyById=new Map(ipanema.notes.filter(note=>note.voice===1).map(note=>[note.id,note]));
  for(const element of all('#rawl-view [data-note][data-voice="1"]')){const note=melodyById.get(element.dataset.note);assert.ok(note);assert.equal(Number(element.dataset.pitch),note.pitch+12*melodyDisplay(ipanema.notes).octaves);}
  $('#play').click();await wait(()=>$('#play').textContent==='Pause');assert.equal(plays.at(-1).levels[1],1);assert.ok(plays.at(-1).plan.voices.some(voice=>voice.voice===1&&voice.program===65));
  $('#melody-voice').click();await wait(()=>!$('#rawl-view [data-voice="1"]'));assert.equal(plays.at(-1).mixers[1].gain.value,0);assert.equal(w.localStorage.getItem('insights-melody'),'hidden');$('#stop').click();
  w.location.hash='#000';await wait(()=>$('#title').textContent==='Take The "A" Train'&&!$('#play').disabled);assert.equal($('#melody-voice').hidden,false);assert.equal($('#pdf-link').hidden,false);assert.equal($('#melody-voice').getAttribute('aria-pressed'),'false');
  w.location.hash='#073';await wait(()=>$('#title').textContent==='The Girl from Ipanema'&&!$('#play').disabled&&!$('#melody-voice').hidden);assert.equal($('#melody-voice').getAttribute('aria-pressed'),'false');assert.equal($('#rawl-view [data-voice="1"]'),null);
  $('#melody-voice').click();await wait(()=>$('#rawl-view [data-note][data-voice="1"]'));const clickedMelody=$('#rawl-view [data-note][data-voice="1"]');clickedMelody.click();await wait(()=>auditions.length>0);assert.equal(auditions.at(-1).program,65);assert.equal(auditions.at(-1).pitch,melodyById.get(clickedMelody.dataset.note).pitch);

  const manifest=read('data/standards.json'),pdfSongs=manifest.songs.filter(song=>Number.isInteger(song.page)&&song.image);
  assert.equal(pdfSongs.length,242);assert.equal($('#count').textContent,'242');
  for(const link of all('#songs a.song-link')){const index=Number(link.getAttribute('href').slice(1));assert.ok(pdfSongs.some(song=>song.index===index),link.textContent);assert.equal(Number(link.dataset.standard),index);}
  assert.equal($('#arrangement').hidden,true);assert.equal($('#arrangement').options.length,1);assert.equal(Number($('#tempo').value),tempos[73].bpm);
  w.location.hash='#468?brick=straight&beat=4';await wait(()=>$('#title').textContent==='Lady Be Good'&&!$('#play').disabled&&$('#rawl-view .rawln-annotation'));
  assert.equal(w.location.hash,'#116');assert.equal($('#arrangement').hidden,true);assert.equal($('#arrangement').options.length,1);assert.equal($('#arrangement').value,'116');assert.equal($('#pdf-link').hidden,false);assert.equal($('#melody-voice').hidden,true);assert.ok($('#songs a[data-standard="116"]').classList.contains('no-melody'));
  w.location.hash='#487';await wait(()=>$('#title').textContent==='A Night in Tunisia'&&!$('#play').disabled);assert.equal(w.location.hash,'#153');assert.equal($('#pdf-link').hidden,false);
  const withoutPDF=manifest.songs.find(song=>!song.image&&!Number.isInteger(song.arrangementOf));assert.ok(withoutPDF);
  w.location.hash='#'+pad(withoutPDF.index);await wait(()=>$('#arrangement').value==='0'&&!$('#play').disabled&&$('#rawl-view [data-note][data-voice="1"]'));assert.equal(w.location.hash,'#000');assert.equal($('#pdf-link').hidden,false);assert.equal(Number($('#tempo').value),tempos[0].bpm);
  w.location.hash='#028';await wait(()=>$('#title').textContent==='Body and Soul'&&!$('#play').disabled&&$('#rawl-view [data-note][data-voice="1"]'));
  assert.equal($('#arrangement').hidden,true);assert.equal($('#pdf-link').hidden,false);assert.equal($('#melody-voice').hidden,false);assert.equal($('#midi-download').getAttribute('href'),'./midi/pdf-melodies/028.mid');assert.ok($('#rawl-view .rawln-annotation'));
  const body=displayed(28),bodyTempo=tempos[28].bpm;
  assert.equal(Number($('#tempo').value),bodyTempo);
  let downloaded;
  const createObjectURL=URL.createObjectURL,clickAnchor=w.HTMLAnchorElement.prototype.click;
  try{
   URL.createObjectURL=blob=>{downloaded=blob;return createObjectURL(blob);};
   w.HTMLAnchorElement.prototype.click=()=>{};
   $('#midi-download').dispatchEvent(new w.MouseEvent('click',{cancelable:true}));
  }finally{
   URL.createObjectURL=createObjectURL;
   w.HTMLAnchorElement.prototype.click=clickAnchor;
  }
  const midi=parseMidi(new Uint8Array(await downloaded.arrayBuffer()));
  assert.equal(midi.tracks[0].find(event=>event.type==='setTempo').microsecondsPerBeat,Math.round(60000000/bodyTempo));
  $('#header-play').click();await wait(()=>$('#play').textContent==='Pause');assert.equal(plays.at(-1).plan.timeAt(1),60/bodyTempo);assert.deepEqual(plays.at(-1).plan.notes.map(n=>[n.voice,n.pitch,n.start,n.duration]),performedNotes(body).map(n=>[n.voice,n.pitch,n.start,n.duration]));$('#stop').click();
  const playCount=plays.length;w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'=',bubbles:true,cancelable:true}));assert.equal(Number($('#tempo').value),bodyTempo+16);assert.equal(plays.length,playCount);w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'-',bubbles:true,cancelable:true}));assert.equal(Number($('#tempo').value),bodyTempo);
  for(const link of all('#songs a.song-link:not(.no-melody)')){const index=Number(link.getAttribute('href').slice(1)),p=displayed(index);assert.ok(p.notes.some(n=>n.voice===1),link.textContent);}
  $('#original').click();assert.equal($('#source-view').hidden,false);assert.equal($('#source-image').hidden,false);assert.equal($('#source-encoded').hidden,true);assert.match($('#source-page').textContent,/PDF/);
  $('#notation-view').click();w.location.hash='';await wait(()=>$('#arrangement').value==='0'&&!$('#play').disabled&&$('#rawl-view [data-note][data-voice="1"]'));assert.equal($('#pdf-link').hidden,false);assert.equal($('#arrangement').hidden,true);
 }finally{w.dispatchEvent(new w.Event('beforeunload'));dom.window.close();}
});
