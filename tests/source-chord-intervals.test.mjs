import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseChord,realizeSong} from '../src/music/realization.mjs';
import {parseBrickDictionary,createBrickParser,discoverRepeatedPatterns} from '../src/music/brick-parser.mjs';
import {prepareAdditionalStandards} from '../scripts/import-standards.mjs';
const qualities=JSON.parse(fs.readFileSync(new URL('../src/music/chord-vocabulary.json',import.meta.url))).qualities;
const override=intervals=>({sourceIntervals:intervals,realizationBasis:'source-compiled-chord'});
const chart=(symbol,intervals)=>({index:400,title:'Source',tonic:['D','Major'],meter:[4,4],bars:1,rows:[{startBar:0,bars:1,keys:[{start:0,end:1,root:'D',mode:'Major'}],joins:[],bricks:[],chords:[{symbol,start:0,end:1,...override(intervals)}]}]});
test('source m6 retains the actual compiled core instead of the vocabulary eleventh',()=>{
 assert.deepEqual(parseChord('Dm6',qualities).intervals,[0,3,5,7,9]);
 const s=chart('Dm6',[0,3,7,9]),before=structuredClone(s),p=realizeSong(s,qualities);
 assert.deepEqual(p.chords[0].pitches,[48,51,55,57]);assert.deepEqual(s,before);
});
test('compound source extensions stay above seventh and explicit slash bass remains below the rooted core',()=>{
 const p=realizeSong(chart('Dsource/A',[0,4,7,10,14,17,21]),qualities);
 assert.deepEqual(p.chords[0].pitches,[43,48,52,55,58,62,65,69]);
 assert.ok(p.notes.every(n=>n.start===0&&n.duration===4));
 assert.throws(()=>parseChord('Cunknown',qualities,{sourceIntervals:[0,4]}),/Invalid source/);
 assert.throws(()=>parseChord('Cunknown',qualities,override([0,-3,7])),/Invalid source/);
});
test('source overrides cannot inherit incompatible dictionary quality-equivalence or discovered fingerprints',()=>{
 const dictionary=parseBrickDictionary('(equiv m6 m7)\n(defbrick Core Minor Cadence C (chord Cm6 1) (chord F7 1))');
 const parser=createBrickParser(dictionary,{qualities}),source=[{symbol:'Cm6',start:0,end:1,...override([0,3,7,9])},{symbol:'F7',start:1,end:2}];
 assert.equal(parser.parse(source).segments.filter(s=>s.kind==='known').length,0);
 assert.equal(parser.parse([{symbol:'Cm6',start:0,end:1},{symbol:'F7',start:1,end:2}]).segments.filter(s=>s.kind==='known').length,1);
 const same=[{symbol:'Cm6',start:0,end:1,...override([0,3,5,7,9])},{symbol:'F7',start:1,end:2}];assert.equal(parser.parse(same).segments.filter(s=>s.kind==='known').length,1);
 const make=(index,intervals)=>{const chords=[{symbol:'Cm6',start:0,end:1,...override(intervals)},{symbol:'E7',start:1,end:2},{symbol:'Ab7',start:2,end:3}];return {index,title:'Source'+index,normalizedTitle:'source'+index,chords,parse:{segments:[]}};};
 assert.equal(discoverRepeatedPatterns([make(1,[0,3,7,9]),make(2,[0,3,5,7,9]),make(3,[0,3,5,7,9])],{qualities,minimumStandards:3}).length,0);
});
test('new source arrangements retain verified intervals through intake, with no clipped source harmony',()=>{
 const e={id:'source-fixture',title:'Fixture',tonic:['D','Major'],meter:[4,4],barBeats:4,bars:1,totalBeats:4,pickupBeats:0,notes:[{pitch:74,start:0,duration:4}],chords:[{symbol:'Dsource/A',start:0,end:4,...override([0,4,7,10,14])}],provenance:{format:'LilyPond'}};
 const result=prepareAdditionalStandards([e],{originalSongs:[],priorSongs:[],dictionary:parseBrickDictionary(''),qualities});assert.equal(result.songs.length,1);const c=result.songs[0].rows[0].chords[0];assert.ok(!c.clipped);assert.deepEqual(c.sourceIntervals,[0,4,7,10,14]);assert.deepEqual(realizeSong(result.songs[0],qualities).chords[0].pitches,[43,48,52,55,58,62]);
});
