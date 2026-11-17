import {pitch,mod,transposeRoot} from '../../dist/harmony.mjs';

// The source's key regions supply carried keys; every join is retained as an
// onset, including joins whose destination has the same pitch class.
export function songModulations(song){
 const barBeats=song.meter[0]*4/song.meter[1],events=[];
 for(const row of song.rows){
  for(const key of row.keys){const root=transposeRoot(key.root,song.tonic[0]);events.push({beat:(row.startBar+key.start)*barBeats,tonic:pitch(root),root,mode:key.mode});}
  for(const join of row.joins){const root=transposeRoot(join.to,song.tonic[0]);events.push({beat:(row.startBar+join.at)*barBeats,tonic:pitch(root),root,join:true,name:join.name,from:transposeRoot(join.from,song.tonic[0]),sourceDelta:join.delta});}
 }
 events.sort((a,b)=>a.beat-b.beat||Number(!!a.join)-Number(!!b.join));
 const onsets=[];
 for(const event of events){if(onsets.at(-1)?.beat===event.beat)onsets[onsets.length-1]={...onsets.at(-1),...event};else onsets.push(event);}
 const changes=[];
 for(const event of onsets){const previous=changes.at(-1);if(!previous||event.join||event.tonic!==previous.tonic)changes.push(event);}
 return changes;
}

export function modulationAt(changes,beat){
 let result=changes[0]??{beat:0,tonic:0,root:'C'};
 for(const event of changes){if(event.beat<=beat+1e-7)result=event;else break;}
 return result;
}

export const TONIC_NAMES=['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
export const modulationDelta=(previous,next)=>{const delta=mod(next-previous);return delta>6?delta-12:delta;};
