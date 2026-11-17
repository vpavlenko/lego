const EPS=1e-7;
/** Compiler-verified pickups, authored meter changes and final partial maps.
 * Time is always authored quarter beats. No normalization moves notes/chords. */
export function sourceMeasureMap(entry){
 const metered=!!entry.provenance?.meterMapPolicy,pickup=entry.pickupBeats>EPS;
 if(!pickup&&!metered)return null;
 const p=entry.provenance??{},map=entry.measures,total=entry.totalBeats,bpb=entry.barBeats;
 if(p.format!=='LilyPond'||pickup&&!p.pickupPolicy||!Array.isArray(map)||map.length!==entry.bars||map.length<2||pickup&&!(entry.pickupBeats<bpb)||!Number.isFinite(total))throw Error('unsupported-pickup-measure-map');
 let cursor=0;for(let i=0;i<map.length;i++){
  const m=map[i],first=i===0,last=i===map.length-1,expected=metered?m.meter?.[0]*4/m.meter?.[1]:bpb;
  if(metered){const event=p.compiledMeterEvents?.findLast(e=>e.start<=m.start+EPS);if(!event||!Number.isFinite(expected)||expected<=0||JSON.stringify(event.meter)!==JSON.stringify(m.meter)||m.beatBeats!==4/m.meter[1])throw Error('invalid-source-meter-evidence');}
  if(!Number.isFinite(m.start)||Math.abs(m.start-cursor)>EPS||!(m.duration>0)||m.duration>expected+EPS||String(m.sourceNumber)!==String(i+(pickup?0:1))||!(pickup&&first)&&!(pickup&&last)&&Math.abs(m.duration-expected)>EPS||pickup&&first&&Math.abs(m.duration-entry.pickupBeats)>EPS)throw Error('invalid-source-measure-map');
  cursor=m.start+m.duration;
 }
 if(Math.abs(cursor-total)>EPS)throw Error('source-measure-map-duration');
 return map.map(m=>({...m}));
}
/** Trim only visual bar boundaries when extracting a brick; musical times
 * already remain relative to the exact selected passage. */
export function sliceMeasureMap(song,startBar,endBar){
 if(!song.measureMap)return {};
 const bpb=song.meter[0]*4/song.meter[1],start=startBar*bpb,end=endBar*bpb;
 const measures=song.measureMap.filter(m=>m.start<end-EPS&&m.start+m.duration>start+EPS).map((m,i)=>({start:Math.max(start,m.start)-start,duration:Math.min(end,m.start+m.duration)-Math.max(start,m.start),sourceNumber:String(i+1),...(m.meter?{meter:[...m.meter]}:{}),...(m.beatBeats?{beatBeats:m.beatBeats}:{})}));
 return {measureMap:measures};
}
