const EPS=1e-7;
export const DEFAULT_SWING_RATIO=.67;

/** Resolve source-bound annotations; the user's default is 67% eighth swing. */
export function performanceStyle(song,sourceEntry,references={entries:[]},cellReviews={entries:[]}){
 const entries=references.entries??[],id=sourceEntry?.id??song.melodyId,sha=sourceEntry?.provenance?.sha256??song.source?.sha256??song.provenance?.sha256;
 const own=entries.filter(r=>r.melodyId===id&&id);
 for(const r of own)if(r.sourceSha256!==sha||r.sourcePath&&r.sourcePath!==sourceEntry?.provenance?.path)throw Error('Performance style source identity differs: '+id);
 const canonical=song.arrangementOf??song.index,reference=own.find(r=>r.feel==='straight'||r.feel==='swing')??(!id?entries.find(r=>r.id==='composition:original-'+canonical&&['straight','swing'].includes(r.feel)):null);
 const feel=reference?.feel==='straight'?'straight':'swing',review=cellReviews.entries?.find(r=>r.melodyId===id);
 if(review){
  if(review.sourceSha256!==sha)throw Error('Swing cell source identity differs: '+id);
  for(const cell of review.cells)for(const expected of cell.notes){const actual=sourceEntry.notes[expected.index];if(!actual||['pitch','start','duration'].some(k=>Math.abs(actual[k]-expected[k])>EPS))throw Error('Reviewed swing source note differs: '+id);}
 }
 return {feel,ratio:feel==='straight'?.5:DEFAULT_SWING_RATIO,unitBeats:1,...(reference?{referenceId:reference.id}:{}),...(review&&feel==='swing'?{reviewedCells:review.cells.map(c=>({start:c.start,sourceSplit:c.sourceSplit}))}:{})};
}

function fullQuarterCells(data){
 const map=data.measureMap??[{start:0,duration:data.beats,sourceNumber:'1'}],cells=[];
 for(const m of map){
  const end=m.start+m.duration,anchor=String(m.sourceNumber)==='0'?end:m.start;
  for(let k=Math.ceil(m.start-anchor-EPS);anchor+k+1<=end+EPS;k++){
   const start=anchor+k;if(start<-EPS||start+1>data.beats+EPS)continue;
   cells.push({start,end:start+1});
  }
 }
 return cells;
}

/** Derived performance only. Mixed subdivisions, tuplets and already-swung
 * cells keep their encoded edges. Source objects and exported MIDI stay intact. */
export function swungMelody(data){
 const notes=data.notes,style=data.playbackStyle;
 if(style?.feel==='straight'||!notes.some(n=>n.voice===1))return {notes,cells:[],affected:0};
 const melody=notes.filter(n=>n.voice===1),edges=melody.flatMap(n=>[n.start,n.start+n.duration]);
 const reviewed=new Map((style?.reviewedCells??[]).map(c=>[Math.round(c.start*1e7),c]));
 const cells=fullQuarterCells(data).flatMap(c=>{
  const sourceSplit=reviewed.get(Math.round(c.start*1e7))?.sourceSplit??.5;
  const inside=edges.filter(t=>t>c.start+EPS&&t<c.end-EPS);
  return inside.length&&inside.every(t=>Math.abs(t-c.start-sourceSplit)<EPS)?[{...c,sourceSplit}]:[];
 });
 const byMidpoint=new Map(cells.map(c=>[Math.round((c.start+c.sourceSplit)*1e7),c]));
 const warp=t=>{const c=byMidpoint.get(Math.round(t*1e7));return c&&Math.abs(t-c.start-c.sourceSplit)<EPS?Math.round((c.start+DEFAULT_SWING_RATIO)*1e9)/1e9:t;};
 let affected=0;
 const performed=notes.map(n=>{
  if(n.voice!==1)return n;
  const start=warp(n.start),end=warp(n.start+n.duration);
  if(Math.abs(start-n.start)<EPS&&Math.abs(end-n.start-n.duration)<EPS)return n;
  affected++;return {...n,start,duration:Math.round((end-start)*1e9)/1e9};
 });
 return {notes:affected?performed:notes,cells,affected};
}
export const performedNotes=data=>swungMelody(data).notes;
