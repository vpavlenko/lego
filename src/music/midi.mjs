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
 const tracks=[track([{tick:0,kind:'meta',data:meta(3,bytes(performance.title))},{tick:0,kind:'meta',data:meta(81,[(us>>>16)&255,(us>>>8)&255,us&255])},{tick:0,kind:'meta',data:meta(88,[performance.meter[0],Math.round(Math.log2(performance.meter[1])),24,8])}],end)];
 for(const voice of [0]){
  const events=[{tick:0,kind:'meta',data:meta(3,bytes('Piano'))},{tick:0,kind:'program',data:[192+voice,0]}];
  for(const note of performance.notes.filter(n=>n.voice===voice))events.push({tick:Math.round(note.start*ppq),kind:'on',data:[144+voice,note.pitch,note.velocity]},{tick:Math.round((note.start+note.duration)*ppq),kind:'off',data:[128+voice,note.pitch,0]});
  tracks.push(track(events,end));
 }
 return Uint8Array.from([...bytes('MThd'),...u32(6),0,1,0,tracks.length,(ppq>>>8)&255,ppq&255,...tracks.flat()]);
}
