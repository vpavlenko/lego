import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPlayer} from '../src/audio-player.mjs';
const data={tempo:120,beats:8,notes:[{pitch:60,voice:0,start:0,duration:4,velocity:74}]};
function setup({pending=false,naturalEnd=false}={}){
 let resolve,plays=0,stops=0,lastPlan,frame;const states=[],positions=[];
 const context={state:'running',currentTime:0,destination:{},resume:async()=>{},createGain:()=>({gain:{value:1,setTargetAtTime(){}},connect(){},disconnect(){}})};
 const engine={play(plan){plays++;lastPlan=plan;return 0;},createClock(){return {beat:()=>naturalEnd?8:2,position:()=>naturalEnd?8:2};},audition(){}};
 globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};
 globalThis.SoundFontPlayback={getContext:()=>context,stop:()=>stops++,prepare:()=>pending?new Promise(r=>{resolve=r;}):Promise.resolve(engine)};
 const p=createPlayer({onState:s=>states.push(s),onPosition:b=>positions.push(b)});p.load(data);
 return {p,states,positions,get plays(){return plays;},get stops(){return stops;},get plan(){return lastPlan;},resolve:()=>resolve(engine),frame:()=>frame?.()};
}
test('pause, seek, tempo and stop preserve the audible timeline and release playback',async()=>{
 const s=setup();await s.p.play();assert.equal(s.p.state,'playing');s.p.pause();assert.equal(s.p.position,2);assert.equal(s.p.state,'paused');
 assert.equal(s.positions.at(-1),null);s.p.seek(6);assert.equal(s.p.position,6);assert.equal(s.positions.at(-1),null);s.p.setTempo(80);await s.p.play();assert.equal(s.plan.timeAt(1),.75);
 s.p.stop();assert.equal(s.p.position,0);assert.equal(s.positions.at(-1),null);assert.equal(s.p.state,'idle');assert.ok(s.stops>=3);
});
test('stopping a delayed sample load cannot restart stale playback',async()=>{
 const s=setup({pending:true});const play=s.p.play();await Promise.resolve();s.p.stop();s.resolve();await play;assert.equal(s.plays,0);assert.equal(s.p.state,'idle');
});
test('natural end resets the transport and active note display',async()=>{
 const s=setup({naturalEnd:true});await s.p.play();assert.equal(s.p.state,'idle');assert.equal(s.p.position,0);assert.equal(s.positions.at(-1),null);
});

// Exercise the shipped Caplin scheduler, not a transport-only clock stub. The
// fake output timestamp intentionally trails currentTime's render-ahead clock.
function realClockSetup({timestamps=true}={}){
 let frame,pump,render=10,output=9.9,wall=20000;const positions=[],messages=[];
 const context={state:'running',get currentTime(){return render;},baseLatency:.04,outputLatency:.06,destination:{},resume:async()=>{},createGain:()=>({gain:{value:1,setTargetAtTime(){}},connect(){},disconnect(){}})};
 if(timestamps)context.getOutputTimestamp=()=>({contextTime:output,performanceTime:wall});
 const realm={performance:{now:()=>wall},setInterval:fn=>{pump=fn;return 1;},clearInterval(){},setTimeout,clearTimeout,console};
 vm.runInNewContext(fs.readFileSync(new URL('../dist/soundfont-playback.js',import.meta.url),'utf8'),realm);
 const synth={stopAll(){},connectChannel(){},disconnectChannel(){},controllerChange(channel,controller,value,options){messages.push({kind:'cc',channel,controller,value,time:options.time});},programChange(){},noteOn(channel,pitch,velocity,options){messages.push({kind:'on',channel,pitch,time:options.time});},noteOff(){}};
 const engine=new realm.SoundFontPlayback.PlaybackEngine(context,synth);
 globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};
 globalThis.SoundFontPlayback={getContext:()=>context,prepare:async()=>engine,stop:()=>engine.stop()};
 const p=createPlayer({onPosition:beat=>positions.push(beat)});
 p.load({tempo:120,beats:8,notes:[{pitch:60,voice:0,start:0,duration:1,velocity:74},{pitch:64,voice:0,start:1,duration:1,velocity:74},{pitch:67,voice:0,start:2,duration:2,velocity:74},{pitch:72,voice:0,start:4,duration:4,velocity:74}]});
 return {p,positions,messages,setTime(nextRender,nextOutput=nextRender-.1){render=nextRender;output=nextOutput;wall+=20;},tick(){pump?.();frame?.();}};
}
test('chord highlights follow the Caplin output clock, not queued attacks or the render clock',async()=>{
 const s=realClockSetup();await s.p.play();const first=s.messages.find(e=>e.kind==='on'&&e.pitch===60);assert.ok(first);assert.equal(s.positions.at(-1),null);
 // Audio has been rendered ahead, but has not reached the output device yet.
 s.setTime(first.time+.08,first.time-.02);s.tick();assert.equal(s.positions.at(-1),null);assert.equal(s.p.position,0);
 s.setTime(first.time+.11,first.time+.01);s.tick();assert.ok(Math.abs(s.positions.at(-1)-.02)<1e-6);
 const secondTime=first.time+.5;s.setTime(secondTime+.08,secondTime-.02);s.tick();const second=s.messages.find(e=>e.kind==='on'&&e.pitch===64);assert.ok(second);assert.ok(Math.abs(second.time-secondTime)<1e-6);assert.ok(s.positions.at(-1)<1);
 s.setTime(secondTime+.101,secondTime+.001);s.tick();assert.ok(s.positions.at(-1)>=1);
 s.p.pause();assert.equal(s.positions.at(-1),null);assert.ok(s.p.position>=1);s.p.stop();
});
test('seek waits for its audible onset while tempo keys preserve held attacks and the live output clock',async()=>{
 const s=realClockSetup();await s.p.play();const start=s.messages.find(e=>e.kind==='on').time;s.setTime(start+.2,start+.1);s.tick();
 s.p.seek(4);assert.equal(s.p.position,4);assert.equal(s.positions.at(-1),null);await Promise.resolve();await Promise.resolve();
 const seek=s.messages.filter(e=>e.kind==='on'&&e.pitch===72).at(-1);assert.ok(seek);assert.equal(s.positions.at(-1),null);
 s.setTime(seek.time+.11,seek.time+.01);s.tick();assert.ok(Math.abs(s.positions.at(-1)-4.02)<1e-6);
 const offset=s.p.position,before=s.messages.length,ons=s.messages.filter(e=>e.kind==='on'&&e.pitch===72).length;s.p.setTempo(80);assert.equal(s.positions.at(-1),offset);assert.equal(s.p.state,'playing');assert.equal(s.messages.length,before);
 s.setTime(seek.time+.4,seek.time+.3);s.tick();assert.ok(Math.abs(s.positions.at(-1)-(4+.11*2+(.3-.11)*80/60))<1e-6);assert.equal(s.messages.filter(e=>e.kind==='on'&&e.pitch===72).length,ons);assert.ok(!s.messages.slice(before).some(e=>e.kind==='cc'));s.p.stop();
});
test('output-latency fallback also gates highlights until the scheduled attack is audible',async()=>{
 const s=realClockSetup({timestamps:false});await s.p.play();const first=s.messages.find(e=>e.kind==='on');
 s.setTime(first.time+.09);s.tick();assert.equal(s.positions.at(-1),null);
 s.setTime(first.time+.11);s.tick();assert.ok(Math.abs(s.positions.at(-1)-.02)<1e-6);s.p.stop();
});
