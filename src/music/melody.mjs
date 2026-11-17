import {pitch,mod} from '../../dist/harmony.mjs';
const nearestShift=value=>{const shift=mod(value);return shift>6?shift-12:shift;};
/** Attach a verified source melody without stretching its onset/duration grid. */
export function attachMelody(performance,song,entry,alignment=null){
 if(!entry?.notes?.length)return performance;
 const transpose=alignment?alignment.transpose:nearestShift(-pitch(song.tonic[0])),offset=alignment?.beatOffset??0;
 if(!Number.isFinite(transpose)||!Number.isFinite(offset))throw Error('Invalid melody alignment');
 const notes=entry.notes.map((note,i)=>({...note,id:`melody:${entry.id}:${i}`,pitch:note.pitch+transpose,start:note.start+offset,voice:1,velocity:note.velocity??80}));
 for(const note of notes)if(!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||note.start<0||note.duration<=0||note.start+note.duration>performance.beats+1e-6)throw Error('Melody outside source timeline: '+entry.title);
 return {...performance,notes:[...performance.notes,...notes].sort((a,b)=>a.start-b.start||a.voice-b.voice||a.pitch-b.pitch),voices:[{voice:0,program:0,name:'Piano'},{voice:1,program:65,name:'Alto Sax'}],melody:{id:entry.id,title:entry.title,notes:notes.length,transpose,beatOffset:offset,source:entry.provenance?.url,basis:alignment?.basis??'same-source'}};
}
