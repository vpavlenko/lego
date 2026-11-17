const EPS=1e-7;
/** Compiler-verified pickups, authored meter changes and final partial maps.
 * Time is always authored quarter beats. No normalization moves notes/chords. */
export function sourceMeasureMap(entry){
 const xml=entry.provenance?.musicXmlMeasureReview,repeated=entry.provenance?.repeatedPartialReview;
 if(xml||repeated){
  const p=entry.provenance,map=entry.measures,bpb=entry.barBeats;
  if(!Array.isArray(map)||map.length!==entry.bars||!map.length)throw Error('invalid-reviewed-measure-map');
  if(xml&&(p.format!=='MusicXML'||xml.sourceSha256!==p.sha256||xml.member!==p.path||JSON.stringify(xml.measures)!==JSON.stringify(map)))throw Error('invalid-xml-measure-review');
  if(repeated&&(p.format!=='LilyPond'||repeated.sourceSha256!==p.sha256||repeated.sourcePath!==p.path||repeated.sourceVersion!==p.sourceVersion))throw Error('invalid-repeated-pickup-review');
  let cursor=0,number=1,full=0;const partials=[];
  for(const [i,m]of map.entries()){
   const expected=m.meter?.[0]*4/m.meter?.[1]||bpb,partial=String(m.sourceNumber)==='0';
   if(!Number.isFinite(m.start)||!Number.isFinite(expected)||!(expected>0)||Math.abs(m.start-cursor)>EPS||!(m.duration>0)||m.duration>expected+EPS||m.meter&&m.beatBeats!==4/m.meter[1])throw Error('invalid-reviewed-measure-timing');
   if(partial){if(!repeated&&i!==0||!(m.duration<expected))throw Error('unreviewed-midscore-pickup');partials.push({start:m.start,duration:m.duration});}
   else{if(String(m.sourceNumber)!==String(number++)||Math.abs(m.duration-expected)>EPS)throw Error('invalid-reviewed-full-measure');full++;}
   cursor=m.start+m.duration;
  }
  if(Math.abs(cursor-entry.totalBeats)>EPS||full!==entry.sourceFullMeasureCount||!partials.length||Math.abs(partials[0].duration-entry.pickupBeats)>EPS||repeated&&JSON.stringify(partials)!==JSON.stringify(repeated.partialEvents))throw Error('reviewed-measure-evidence-mismatch');
  return map.map(m=>({...m}));
 }
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
