/** One visual octave offset per arrangement. Audio always resolves by source ID. */
export function melodyDisplay(notes){
 const melody=notes.filter(note=>note.voice===1),chords=notes.filter(note=>(note.voice??0)===0),sourceById=new Map(notes.map(note=>[note.id,note]));
 if(!melody.length||!chords.length)return {notes,octaves:0,sourceById};
 const lowest=Math.min(...melody.map(note=>note.pitch)),highest=Math.max(...chords.map(note=>note.pitch));
 // Two semitone rows leave room for Rawl's doubled sounding-note height.
 const octaves=Math.max(0,Math.ceil((highest+2-lowest)/12));
 return {notes:octaves?notes.map(note=>note.voice===1?{...note,pitch:note.pitch+12*octaves}:note):notes,octaves,sourceById};
}
