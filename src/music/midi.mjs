const bytes=text=>Array.from(new TextEncoder().encode(text));
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function vlq(n){let result=[n&127];while((n>>>=7)>0)result.unshift((n&127)|128);return result;}
function meta(type,body){return [255,type,...vlq(body.length),...body];}
function track(events,endTick){
 const order={meta:0,program:1,off:2,on:3};events.sort((a,b)=>a.tick-b.tick||order[a.kind]-order[b.kind]);
 let at=0,out=[];
 for(const e of events){out.push(...vlq(e.tick-at),...e.data);at=e.tick;}
 out.push(...vlq(Math.max(0,endTick-at)),255,47,0);
 return [...bytes('MTrk'),...u32(out.length),...out];
}
export function encodeMidi(performance){
 const ppq=480,end=Math.round(performance.beats*ppq),us=Math.round(60000000/performance.tempo);
 const signatures=performance.meterChanges?.length?performance.meterChanges:[{beat:0,meter:performance.meter,metronome:24,thirtyseconds:8}];
 for(const s of signatures)if(!Number.isFinite(s.beat)||s.beat<0||s.beat>performance.beats||!Number.isInteger(s.meter?.[0])||s.meter[0]<=0||!Number.isInteger(Math.log2(s.meter[1])))throw Error('Invalid MIDI meter event');
 const tracks=[track([{tick:0,kind:'meta',data:meta(3,bytes(performance.title))},{tick:0,kind:'meta',data:meta(81,[(us>>>16)&255,(us>>>8)&255,us&255])},...signatures.map(s=>({tick:Math.round(s.beat*ppq),kind:'meta',data:meta(88,[s.meter[0],Math.round(Math.log2(s.meter[1])),s.metronome??24,s.thirtyseconds??8])}))],end)];
 const plan=playbackPlan(performance);
 for(const {voice,program,name} of plan.voices){
  const events=[{tick:0,kind:'meta',data:meta(3,bytes(name))},{tick:0,kind:'program',data:[192+voice,program]}];
  for(const note of plan.notes.filter(n=>n.voice===voice))events.push({tick:Math.round(note.start*ppq),kind:'on',data:[144+voice,note.pitch,note.velocity]},{tick:Math.round((note.start+note.duration)*ppq),kind:'off',data:[128+voice,note.pitch,0]});
  tracks.push(track(events,end));
 }
 return Uint8Array.from([...bytes('MThd'),...u32(6),0,1,0,tracks.length,(ppq>>>8)&255,ppq&255,...tracks.flat()]);
}
import {playbackPlan} from './realization.mjs';
