import {createTransport} from 'librawl/audio';
import {playbackPlan} from './music/realization.mjs';
import {performedNotes} from './music/performance-style.mjs';

export function createPlayer(callbacks={}){
 return createTransport({...callbacks,makePlan:(data,tempo)=>playbackPlan({...data,notes:performedNotes(data)},tempo)});
}

export {encodeMidi} from './music/midi.mjs';
export {bindTempoKeys} from 'librawl/audio';
