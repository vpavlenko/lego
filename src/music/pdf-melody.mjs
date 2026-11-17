const EPS=1e-7;
export function shiftedChanges(changes,offset=0){return offset?changes.map((change,i)=>({...change,beat:i===0&&change.beat===0?0:change.beat+offset})):changes;}

export function withMelodyPrelude(performance,offset=0){
 if(!Number.isFinite(offset)||offset<0||offset>=performance.barBeats)throw Error('Invalid melody pickup');
 if(!offset)return performance;
 if(performance.clockOffset)throw Error('Melody pickup already applied');
 const map=performance.measureMap??Array.from({length:Math.round(performance.beats/performance.barBeats)},(_,i)=>({start:i*performance.barBeats,duration:performance.barBeats,sourceNumber:String(i+1)}));
 return {...performance,clockOffset:offset,scoreBeats:performance.beats,beats:performance.beats+offset,
  notes:performance.notes.map(note=>({...note,start:note.start+offset})),
  chords:performance.chords.map(chord=>({...chord,start:chord.start+offset,end:chord.end+offset})),
  rows:performance.rows.map(row=>({...row,start:row.start+offset,end:row.end+offset})),
  changes:shiftedChanges(performance.changes,offset),
  ...(performance.sourceChanges?{sourceChanges:shiftedChanges(performance.sourceChanges,offset)}:{}),
  ...(performance.meterChanges?{meterChanges:performance.meterChanges.map((event,i)=>({...event,beat:i===0&&event.beat===0?0:event.beat+offset}))}:{}),
  measureMap:[{start:0,duration:offset,sourceNumber:'0'},...map.map(measure=>({...measure,start:measure.start+offset}))]};
}

export function mapPDFMelody(performance,entry,alignment,{notes:sourceNotes=entry.notes}={}){
 if(!entry?.notes?.length||entry.id!==alignment.melodyId||entry.provenance?.sha256!==alignment.sourceSha256)throw Error('PDF melody source identity differs');
 if(performance.song!==alignment.song||!Number.isInteger(alignment.transpose))throw Error('PDF melody target identity differs');
 const segments=alignment.segments;
 if(!segments?.length)throw Error('Empty PDF melody bar map');
 let previousEnd=0;
 for(const s of segments){
  if(![s.sourceStart,s.sourceEnd,s.targetStart,s.targetEnd].every(Number.isFinite)||s.sourceStart<0||s.sourceEnd<=s.sourceStart||s.sourceEnd>entry.totalBeats+EPS||s.targetStart<previousEnd-EPS||s.targetEnd<=s.targetStart||s.targetEnd>performance.beats+EPS)throw Error('Invalid PDF melody bar map');
  previousEnd=s.targetEnd;
 }
 const notes=[];
 sourceNotes.forEach((note,index)=>segments.forEach((s,si)=>{
  const start=Math.max(note.start,s.sourceStart),end=Math.min(note.start+note.duration,s.sourceEnd);
  if(end<=start+EPS)return;
  if((start>note.start+EPS||end<note.start+note.duration-EPS)&&alignment.boundaryPolicy!=='clip-reviewed')throw Error('PDF melody note crosses a route cut');
  const scale=(s.targetEnd-s.targetStart)/(s.sourceEnd-s.sourceStart),target=s.targetStart+(start-s.sourceStart)*scale,pitch=note.pitch+alignment.transpose;
  if(!Number.isInteger(pitch)||pitch<0||pitch>127)throw Error('PDF melody pitch outside MIDI range');
  notes.push({...note,id:`melody:${entry.id}:${index}:map:${si}`,sourceIndex:index,sourceStart:entry.notes[index].start,sourceDuration:entry.notes[index].duration,pitch,start:target,duration:(end-start)*scale,voice:1,velocity:note.velocity??80});
 }));
 if(!notes.length)throw Error('Empty PDF melody mapping');
 return {notes,voices:[{voice:0,program:0,name:'Piano'},{voice:1,program:65,name:'Alto Sax'}],melody:{id:entry.id,title:entry.title,notes:notes.length,transpose:alignment.transpose,beatOffset:segments[0].targetStart-segments[0].sourceStart,source:entry.provenance.url,basis:'pdf-bar-map',segments:segments.map(s=>({...s}))}};
}

export function mergePDFMelody(performance,overlay){
 if(!overlay)return performance;
 const base=withMelodyPrelude(performance,overlay.clockOffset??0);
 return {...base,notes:[...base.notes.filter(note=>note.voice!==1),...overlay.notes].sort((a,b)=>a.start-b.start||a.voice-b.voice||a.pitch-b.pitch),voices:overlay.voices,melody:overlay.melody,performedMelodyNotes:overlay.performedNotes};
}

export function mappedMelodyStyle(style,alignment){
 const reviewedCells=(style.reviewedCells??[]).flatMap(cell=>alignment.segments.flatMap(s=>Math.abs(s.targetEnd-s.targetStart-s.sourceEnd+s.sourceStart)<EPS&&cell.start>=s.sourceStart-EPS&&cell.start+1<=s.sourceEnd+EPS?[{...cell,start:cell.start+s.targetStart-s.sourceStart}]:[]));
 return {...style,...(style.reviewedCells?{reviewedCells}:{})};
}
