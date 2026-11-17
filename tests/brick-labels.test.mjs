import test from 'node:test';import assert from 'node:assert/strict';
import {brickNameParts,brickNameHTML} from '../src/music/brick-labels.mjs';
test('brick names color standalone harmonic degrees and secondary functions only',()=>{
 assert.deepEqual(brickNameParts('IV and Bird'),[{text:'IV',degree:5},{text:' and Bird',degree:null}]);
 assert.deepEqual(brickNameParts('vii°7/ii–ii–V–I').filter(p=>p.degree!==null).map(p=>p.degree),[1,2,7,0]);
 for(const name of ['Diatonic','Dizzy','7 Chord Dropback','Dominant Cycle 3 Steps','CESH'])assert.deepEqual(brickNameParts(name),[{text:name,degree:null}]);
 assert.deepEqual(brickNameParts('To bVII').filter(p=>p.degree!==null).map(p=>p.degree),[10]);assert.ok(brickNameHTML('<IV>').startsWith('&lt;<span'));
});
