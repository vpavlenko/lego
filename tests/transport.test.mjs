import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayer} from '../src/audio-player.mjs';
const data={tempo:120,beats:8,notes:[{pitch:60,voice:0,start:0,duration:4,velocity:74}]};
function setup({pending=false,naturalEnd=false}={}){
 let resolve,plays=0,stops=0,lastPlan,frame;const states=[],positions=[];
 const context={state:'running',currentTime:0,destination:{},resume:async()=>{},createGain:()=>({gain:{value:1,setTargetAtTime(){}},connect(){},disconnect(){}})};
 const engine={play(plan){plays++;lastPlan=plan;return 0;},createClock(){return {position:()=>naturalEnd?8:2};},audition(){}};
 globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};
 globalThis.SoundFontPlayback={getContext:()=>context,stop:()=>stops++,prepare:()=>pending?new Promise(r=>{resolve=r;}):Promise.resolve(engine)};
 const p=createPlayer({onState:s=>states.push(s),onPosition:b=>positions.push(b)});p.load(data);
 return {p,states,positions,get plays(){return plays;},get stops(){return stops;},get plan(){return lastPlan;},resolve:()=>resolve(engine),frame:()=>frame?.()};
}
test('pause, seek, tempo and stop preserve the audible timeline and release playback',async()=>{
 const s=setup();await s.p.play();assert.equal(s.p.state,'playing');s.p.pause();assert.equal(s.p.position,2);assert.equal(s.p.state,'paused');
 s.p.seek(6);assert.equal(s.p.position,6);s.p.setTempo(80);await s.p.play();assert.equal(s.plan.timeAt(1),.75);
 s.p.stop();assert.equal(s.p.position,0);assert.equal(s.positions.at(-1),null);assert.equal(s.p.state,'idle');assert.ok(s.stops>=3);
});
test('stopping a delayed sample load cannot restart stale playback',async()=>{
 const s=setup({pending:true});const play=s.p.play();await Promise.resolve();s.p.stop();s.resolve();await play;assert.equal(s.plays,0);assert.equal(s.p.state,'idle');
});
test('natural end resets the transport and active note display',async()=>{
 const s=setup({naturalEnd:true});await s.p.play();assert.equal(s.p.state,'idle');assert.equal(s.p.position,0);assert.equal(s.positions.at(-1),null);
});
