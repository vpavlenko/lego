import {pitch,mod,transposeChord,transposeRoot} from '../../dist/harmony.mjs';

export function parseChord(symbol,qualities){
 const match=/^([A-G][b#]*)(.*?)(?:\/([A-G][b#]*))?$/.exec(symbol);
 if(!match)return null;
 const intervals=qualities[match[2]];if(!intervals)return null;
 return {root:pitch(match[1]),bass:pitch(match[3]||match[1]),intervals,quality:match[2]};
}
function voice(pcs,previous){
 const sorted=[...new Set(pcs)].sort((a,b)=>a-b),choices=[];
 for(let inversion=0;inversion<sorted.length;inversion++){
  const pitches=sorted.slice(inversion).concat(sorted.slice(0,inversion).map(p=>p+12));
  for(let octave=3;octave<=6;octave++){
   const notes=pitches.map(p=>p+octave*12);if(notes[0]<53||notes.at(-1)>84)continue;
   const mean=notes.reduce((a,b)=>a+b,0)/notes.length;
   let cost=Math.abs(mean-65)*.2+Math.max(0,notes.at(-1)-notes[0]-20)*.5;
   if(previous?.length){
    cost+=notes.reduce((sum,p,i)=>sum+Math.abs(p-previous[Math.round(i*(previous.length-1)/Math.max(1,notes.length-1))]),0)/notes.length;
    cost+=previous.reduce((sum,p)=>sum+Math.min(...notes.map(n=>Math.abs(n-p))),0)/previous.length;
   }
   choices.push({notes,cost});
  }
 }
 if(!choices.length)throw Error('No playable voicing');
 choices.sort((a,b)=>a.cost-b.cost||a.notes[0]-b.notes[0]);return choices[0].notes;
}
export function realizeSong(song,qualities,{tempo=120}={}){
 const barBeats=song.meter[0]*4/song.meter[1],notes=[],chords=[],changes=[],rows=[];
 let previous,previousBass=40,priorTonic=null;
 for(let ri=0;ri<song.rows.length;ri++){
  const row=song.rows[ri];rows.push({start:row.startBar*barBeats,end:(row.startBar+row.bars)*barBeats,label:row.startBar+1});
  for(const key of row.keys){const tonic=pitch(transposeRoot(key.root,song.tonic[0]));if(tonic!==priorTonic){changes.push({beat:(row.startBar+key.start)*barBeats,tonic});priorTonic=tonic;}}
  for(const cell of row.chords){
   const symbol=transposeChord(cell.symbol,song.tonic[0]),start=(row.startBar+cell.start)*barBeats,end=(row.startBar+cell.end)*barBeats,id=chords.length;
   const c={id,row:ri,start,end,symbol,sourceSymbol:cell.symbol,clipped:!!cell.clipped};chords.push(c);
   // A source ellipsis conceals chord tones. Preserve its time as a marked gap.
   if(c.clipped){c.pitches=[];continue;}
   const parsed=parseChord(symbol,qualities);if(!parsed)throw Error('Unsupported chord '+symbol+' in '+song.title);
   const upper=voice(parsed.intervals.map(i=>mod(parsed.root+i)),previous);previous=upper;
   const bassChoices=[24,36,48].map(o=>o+parsed.bass).filter(p=>p>=32&&p<=48);
   bassChoices.sort((a,b)=>(Math.abs(a-previousBass)+Math.abs(a-39)*.15)-(Math.abs(b-previousBass)+Math.abs(b-39)*.15));
   const bass=bassChoices[0];previousBass=bass;c.pitches=[bass,...upper];
   notes.push({id:`${id}-b`,pitch:bass,start,duration:end-start,voice:1,velocity:66,chord:id});
   upper.forEach((p,i)=>notes.push({id:`${id}-${i}`,pitch:p,start,duration:end-start,voice:0,velocity:74,chord:id}));
  }
 }
 return {version:1,song:song.index,title:song.title,tempo,meter:song.meter,beats:song.bars*barBeats,barBeats,rows,tonic:0,changes,notes,chords};
}
export function playbackPlan(data,tempo=data.tempo){
 const notes=data.notes.map(n=>({...n,channel:n.voice,group:n.voice,end:n.start+n.duration}));
 const events=[];
 for(let channel=0;channel<2;channel++){
  events.push({beat:0,type:'program',channel,program:0});
  for(const [controller,value] of [[0,0],[32,0],[7,100],[10,64],[11,127],[64,0]])events.push({beat:0,type:'cc',channel,controller,value});
 }
 for(const n of notes)events.push({beat:n.start,type:'on',channel:n.channel,pitch:n.pitch,velocity:n.velocity},{beat:n.end,type:'off',channel:n.channel,pitch:n.pitch});
 const priority={program:0,cc:1,off:2,on:3};events.sort((a,b)=>a.beat-b.beat||priority[a.type]-priority[b.type]);
 return {beats:data.beats,duration:data.beats*60/tempo,notes,events,channels:[{channel:0,group:0},{channel:1,group:1}],timeAt:beat=>beat*60/tempo,beatAt:time=>time*tempo/60};
}
