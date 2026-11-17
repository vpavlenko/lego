const ROOTS=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
/** Rawl getNewAnalysis: change a selected boundary's tonic and remove idle
 * consecutive regions. Pitches and event times are never transposed. */
export function recolorModulation(changes,beat,pitch){
 if(!Number.isFinite(beat)||beat<0||!Number.isFinite(pitch))return changes;
 const tonic=((Math.round(pitch)%12)+12)%12,existing=changes.find(change=>Math.abs(change.beat-beat)<1e-7),choice={...(existing??{beat}),tonic,root:ROOTS[tonic]};
 const events=[...changes.filter(change=>Math.abs(change.beat-beat)>=1e-7).map(change=>({...change})),choice].sort((a,b)=>a.beat-b.beat),result=[];
 for(const event of events)if(!result.length||result.at(-1).tonic!==event.tonic)result.push(event);
 return result;
}

// A saved modulation onset inside a measure retains its exact source position.
export function recolorBoundary(changes,measureBeat,barBeats){return changes.find(change=>change.beat>=measureBeat-1e-7&&change.beat<measureBeat+barBeats-1e-7)?.beat??measureBeat;}
