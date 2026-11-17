/** One visual octave offset per arrangement. Audio always resolves by source ID. */
export function melodyDisplay(notes){
 const melody=notes.filter(note=>note.voice===1),chords=notes.filter(note=>(note.voice??0)===0),sourceById=new Map(notes.map(note=>[note.id,note]));
 if(!melody.length||!chords.length)return {notes,octaves:0,sourceById};
 let closest=-Infinity;
 for(const head of melody)for(const chord of chords){
  if(Math.min(head.start+head.duration,chord.start+chord.duration)<=Math.max(head.start,chord.start))continue;
  closest=Math.max(closest,chord.pitch-head.pitch);
 }
 // Only simultaneous notes constrain the one display register. Lower an
 // already distant head too; the narrowest actual gap stays within 1–12.
 const octaves=Number.isFinite(closest)?Math.ceil((closest+1)/12)||0:0;
 return {notes:octaves?notes.map(note=>note.voice===1?{...note,pitch:note.pitch+12*octaves}:note):notes,octaves,sourceById};
}
