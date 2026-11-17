import {pitch,mod,transposeChord} from '../../dist/harmony.mjs';
import {songModulations} from './modulations.mjs';

export function parseChord(symbol,qualities){
 const match=/^([A-G][b#]*)(.*?)(?:\/([A-G][b#]*))?$/.exec(symbol);
 if(!match)return null;
 const intervals=qualities[match[2]];if(!intervals)return null;
 return {root:pitch(match[1]),bass:pitch(match[3]||match[1]),intervals,quality:match[2],slash:!!match[3]};
}
// Keep the core rooted and dense; compound intervals preserve 9/11/13
// above the seventh. An explicit slash bass sits below the complete chord,
// including a second instance when that bass is already a chord tone.
function rootPosition(parsed){
 const root=48+parsed.root,core=[...new Set([0,...parsed.intervals])].sort((a,b)=>a-b).map(interval=>root+interval);
 if(!parsed.slash)return core;
 let bass=48+parsed.bass;while(bass>=root)bass-=12;
 return [bass,...core];
}
export function realizeSong(song,qualities,{tempo=120}={}){
 const barBeats=song.meter[0]*4/song.meter[1],notes=[],chords=[],changes=songModulations(song),rows=[];
 for(let ri=0;ri<song.rows.length;ri++){
  const row=song.rows[ri];rows.push({start:row.startBar*barBeats,end:(row.startBar+row.bars)*barBeats,label:row.startBar+1});
  for(const cell of row.chords){
   const symbol=transposeChord(cell.symbol,song.tonic[0]),start=(row.startBar+cell.start)*barBeats,end=(row.startBar+cell.end)*barBeats,id=chords.length;
   const c={id,row:ri,start,end,symbol,sourceSymbol:cell.symbol,clipped:!!cell.clipped};chords.push(c);
   // A source ellipsis conceals chord tones. Preserve its time as a marked gap.
   if(c.clipped){c.pitches=[];continue;}
   const parsed=parseChord(symbol,qualities);if(!parsed)throw Error('Unsupported chord '+symbol+' in '+song.title);
   c.pitches=rootPosition(parsed);
   c.pitches.forEach((p,i)=>notes.push({id:`${id}-${i}`,pitch:p,start,duration:end-start,voice:0,velocity:74,chord:id}));
  }
 }
 return {version:3,voicing:'root-position',song:song.index,title:song.title,tempo,meter:song.meter,beats:song.bars*barBeats,barBeats,rows,tonic:0,changes,notes,chords};
}
export function playbackPlan(data,tempo=data.tempo){
 const notes=data.notes.map(n=>({...n,channel:n.voice,group:n.voice,end:n.start+n.duration}));
 const events=[];
 for(const channel of [0]){
  events.push({beat:0,type:'program',channel,program:0});
  for(const [controller,value] of [[0,0],[32,0],[7,100],[10,64],[11,127],[64,0]])events.push({beat:0,type:'cc',channel,controller,value});
 }
 for(const n of notes)events.push({beat:n.start,type:'on',channel:n.channel,pitch:n.pitch,velocity:n.velocity},{beat:n.end,type:'off',channel:n.channel,pitch:n.pitch});
 const priority={program:0,cc:1,off:2,on:3};events.sort((a,b)=>a.beat-b.beat||priority[a.type]-priority[b.type]);
 return {beats:data.beats,duration:data.beats*60/tempo,notes,events,channels:[{channel:0,group:0}],timeAt:beat=>beat*60/tempo,beatAt:time=>time*tempo/60};
}
