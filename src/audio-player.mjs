import {createTransport} from 'librawl/audio';
import {playbackPlan} from './music/realization.mjs';

export function createPlayer(callbacks={}){
 return createTransport({...callbacks,makePlan:playbackPlan});
}

export {encodeMidi} from './music/midi.mjs';
