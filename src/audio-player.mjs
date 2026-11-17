import {createTransport} from 'librawl/audio';
import {playbackPlan} from './music/realization.mjs';
import {performedNotes} from './music/performance-style.mjs';

export const DEFAULT_TEMPO=160;
export function createPlayer({defaultTempo,...callbacks}={}){
 const transport=createTransport({...callbacks,makePlan:(data,tempo)=>playbackPlan({...data,notes:performedNotes(data)},tempo)});
 if(defaultTempo!==undefined){
  transport.setTempo(defaultTempo);
  const load=transport.load;
  transport.load=data=>load({...data,tempo:defaultTempo});
 }
 return transport;
}

export {encodeMidi} from './music/midi.mjs';
export {bindTempoKeys} from 'librawl/audio';
