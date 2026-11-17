// Pitch geometry follows Caplin packages/music/rawl-layout.js, based on Rawl.
// GPL-3.0-only. Note rectangles are 5 px high, with 3 px per semitone.
export const PITCH_STEP=3,NOTE_HEIGHT=5,TOP_CLEARANCE=20,BOTTOM_CLEARANCE=2;
export function pitchRange(notes,span=null,fallback={low:48,high:84}){
 const pitches=notes.filter(n=>!span||Math.min(span.end,n.start+n.duration)-Math.max(span.start,n.start)>1e-6).map(n=>n.pitch);
 return pitches.length?{low:Math.min(...pitches),high:Math.max(...pitches)}:{...fallback};
}
export function staveGeometry(range,{above=0,transpose=0}={}){
 const low=range.low+transpose,high=range.high+transpose,noteTop=TOP_CLEARANCE+above;
 const noteHeight=(high-low)*PITCH_STEP+TOP_CLEARANCE+NOTE_HEIGHT+BOTTOM_CLEARANCE;
 return {low,high,noteTop,noteHeight,notesBottom:noteHeight+above,guideTop:Math.max(0,noteTop-16),markerTop:noteTop-14,pitchToY:pitch=>noteTop+(high-pitch)*PITCH_STEP};
}
export const mod=n=>((n%12)+12)%12;
export function tonicAt(tonic,changes,beat){let result=tonic;for(const c of changes){if(c.beat<beat)result=c.tonic;else break;}return result;}
export function tonalSegments(tonic,changes,start,end){
 const events=[{beat:0,tonic},...changes].sort((a,b)=>a.beat-b.beat),result=[];
 let current=tonic,cursor=start;
 for(const e of events){if(e.beat<=start){current=e.tonic;continue;}if(e.beat>=end)break;if(e.tonic!==current){result.push({start:cursor,end:e.beat,tonic:current});cursor=e.beat;current=e.tonic;}}
 result.push({start:cursor,end,tonic:current});return result;
}
export function tonalLines(range,axis,tonic){
 const result=[];const rawlY=p=>axis.pitchToY(p)+PITCH_STEP;
 for(let octave=Math.ceil((range.low+7-tonic)/12);octave<=Math.floor((range.high+12-tonic)/12);octave++){
  const midi=tonic+octave*12;
  if(midi-12>=range.low&&midi-12<=range.high)result.push({kind:'tonic',y:rawlY(midi-13+.5)});
  if(midi-7>=range.low&&midi-7<=range.high)result.push({kind:'fifth',y:rawlY(midi-6)-.5});
 }
 return result;
}
