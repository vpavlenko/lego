import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {playbackPlan} from '../src/music/realization.mjs';
import {encodeMidi} from '../src/music/midi.mjs';
import {createPlayer} from '../src/audio-player.mjs';
const {parseMidi}=createRequire(import.meta.url)('midi-file');
const piano={id:'c',pitch:60,voice:0,start:0,duration:4,velocity:74},melody={id:'m',pitch:79,voice:1,start:0,duration:3,velocity:81};
const data={title:'Fixture',tempo:120,meter:[4,4],beats:8,notes:[piano,melody,{id:'m2',pitch:77,voice:1,start:4,duration:2}]};

test('melody uses a separate alto-sax program and channel without changing piano notes or timing',()=>{
 const plan=playbackPlan(data,80);assert.deepEqual(plan.channels,[{channel:0,group:0},{channel:1,group:1}]);assert.deepEqual(plan.voices,[{voice:0,program:0,name:'Piano'},{voice:1,program:65,name:'Alto Sax'}]);
 assert.deepEqual(plan.events.filter(e=>e.type==='program').map(e=>[e.channel,e.program]),[[0,0],[1,65]]);assert.equal(plan.notes.find(n=>n.id==='m2').velocity,80);
 for(const original of data.notes){const note=plan.notes.find(n=>n.id===original.id);assert.equal(note.pitch,original.pitch);assert.equal(note.start,original.start);assert.equal(note.duration,original.duration);assert.equal(note.channel,original.voice);}
 assert.equal(plan.timeAt(4),3);assert.deepEqual(playbackPlan({...data,notes:[piano]}).channels,[{channel:0,group:0}]);
});

test('MIDI exports actual piano and sax programs, with no empty sax track when melody is absent',()=>{
 const midi=parseMidi(encodeMidi(data));assert.equal(midi.tracks.length,3);assert.equal(midi.tracks[1].find(e=>e.type==='trackName').text,'Piano');assert.equal(midi.tracks[2].find(e=>e.type==='trackName').text,'Alto Sax');
 assert.deepEqual(midi.tracks.flatMap(track=>track.filter(e=>e.type==='programChange').map(e=>[e.channel,e.programNumber])),[[0,0],[1,65]]);
 const notes=[];for(const track of midi.tracks){let tick=0;for(const e of track){tick+=e.deltaTime;if(e.type==='noteOn'&&e.velocity)notes.push([e.channel,e.noteNumber,tick,e.velocity]);}}
 assert.deepEqual(notes,[[0,60,0,74],[1,79,0,81],[1,77,1920,80]]);assert.equal(parseMidi(encodeMidi({...data,notes:[piano]})).tracks.length,2);
});

function chunks(bytes,start=12,end=bytes.length){const result=new Map();while(start+8<=end){const type=bytes.toString('ascii',start,start+4),length=bytes.readUInt32LE(start+4),at=start+8;if(type==='LIST')for(const [key,value]of chunks(bytes,at+4,Math.min(at+length,end)))result.set(key,value);else result.set(type,bytes.subarray(at,at+length));start=at+length+(length&1);}return result;}
test('shipped sax bank contains a real GM65 preset and sampled instrument, preserving the piano bank',()=>{
 const file=new URL('../dist/assets/soundfonts/GeneralUser-GS-alto-sax.sf2',import.meta.url),bytes=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(new URL('../dist/assets/soundfonts/GeneralUser-GS-alto-sax.json',import.meta.url))),blocks=chunks(bytes),phdr=blocks.get('phdr'),shdr=blocks.get('shdr');
 assert.equal(bytes.length,505140);assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.subset.sha256);assert.equal(phdr.length/38-1,1);assert.equal(phdr.toString('ascii',0,20).replace(/\0/g,''),'Alto Sax');assert.equal(phdr.readUInt16LE(20),65);assert.equal(phdr.readUInt16LE(22),0);assert.equal(shdr.length/46-1,13);assert.ok(blocks.get('smpl').length>400000);assert.ok(meta.verification.presetZonesEqual&&meta.verification.sampleBytesEqual);
 assert.equal(meta.verification.dualBankPCM.checks.length,9);const checks=meta.verification.dualBankPCM.checks,sax=checks.find(c=>c.program===65&&c.pitch===60&&c.velocity===96),piano=checks.find(c=>c.program===0);assert.notEqual(sax.stereoFloat32Sha256,piano.stereoFloat32Sha256);
 const old=fs.readFileSync(new URL('../dist/assets/soundfonts/GeneralUser-GS-v4.sf2.1',import.meta.url));assert.equal(createHash('sha256').update(old).digest('hex'),'f2a57c0c85d3b118b39d6cf6f5eb9447e8a22ec3884e6f616951412d7f5c3460');
});

function setup(){
 let frame,pump,render=10,output=9.9,wall=20000;const positions=[],events=[];
 const context={state:'running',get currentTime(){return render;},destination:{},resume:async()=>{},getOutputTimestamp:()=>({contextTime:output,performanceTime:wall}),createGain:()=>({gain:{value:1,setTargetAtTime(value){this.value=value;},setValueAtTime(value){this.value=value;}},connect(){},disconnect(){}})};
 const realm={performance:{now:()=>wall},setInterval:fn=>{pump=fn;return 1;},clearInterval(){},setTimeout:()=>1,clearTimeout(){},console};vm.runInNewContext(fs.readFileSync(new URL('../dist/soundfont-playback.js',import.meta.url),'utf8'),realm);
 const synth={midiChannels:Array.from({length:16},()=>({setDrums(){}})),stopAll(){},connectChannel(){},disconnectChannel(){},controllerChange(channel,controller,value,options){events.push({type:'cc',channel,controller,value,time:options.time});},programChange(channel,program,options){events.push({type:'program',channel,program,time:options.time});},noteOn(channel,pitch,velocity,options){events.push({type:'on',channel,pitch,velocity,time:options.time});},noteOff(){}};
 const engine=new realm.SoundFontPlayback.PlaybackEngine(context,synth);globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};globalThis.SoundFontPlayback={getContext:()=>context,prepare:async()=>engine,stop:()=>engine.stop()};
 const player=createPlayer({onPosition:b=>positions.push(b)});player.load(data);return{player,engine,events,positions,setTime(r,o=r-.1){render=r;output=o;wall+=20;},tick(){pump?.();frame?.();}};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
test('shared scheduler keeps both programs and melody mute through seeks and tempo changes on the audible clock',async()=>{
 const s=setup();s.player.setMuted(1,true);await s.player.play();assert.deepEqual(s.events.filter(e=>e.type==='program').map(e=>[e.channel,e.program]),[[0,0],[1,65]]);assert.equal(s.engine.connections.find(([channel])=>channel===1)[1].gain.value,0);assert.equal(s.positions.at(-1),null);
 const start=s.events.find(e=>e.type==='on').time;s.setTime(start+.2,start+.1);s.tick();assert.ok(s.positions.at(-1)>0);
 s.player.seek(1);await settle();assert.equal(s.positions.at(-1),null);assert.ok(s.player.mutedVoices.includes(1));assert.equal(s.engine.connections.find(([channel])=>channel===1)[1].gain.value,0);
 s.player.setTempo(80);await settle();assert.equal(s.positions.at(-1),null);assert.equal(s.engine.connections.find(([channel])=>channel===1)[1].gain.value,0);assert.equal(s.events.filter(e=>e.type==='program'&&e.channel===1).at(-1).program,65);
 s.player.setMuted(1,false);assert.equal(s.engine.connections.find(([channel])=>channel===1)[1].gain.value,1);assert.equal(s.engine.connections.find(([channel])=>channel===0)[1].gain.value,1);s.player.stop();assert.equal(s.positions.at(-1),null);
});

test('melody audition selects actual sax program and hiding melody cancels and prevents its auditions',async()=>{
 const s=setup();await s.player.audition(melody);assert.equal(s.events.filter(e=>e.type==='program').at(-1).program,65);assert.equal(s.events.filter(e=>e.type==='program').at(-1).channel,9);assert.ok(s.engine.auditionState);
 await s.player.audition(melody);assert.ok(s.engine.auditionState);s.player.setMuted(1,true);assert.equal(s.engine.auditionState,null);const before=s.events.filter(e=>e.type==='on').length;await s.player.audition(melody);assert.equal(s.events.filter(e=>e.type==='on').length,before);
 await s.player.audition(piano);assert.equal(s.events.filter(e=>e.type==='program').at(-1).program,0);s.player.stop();
});
