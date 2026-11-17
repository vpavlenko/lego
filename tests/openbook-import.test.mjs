import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseMidi} from 'midi-file';
import {melodyEligibility,exactMelodyMatch} from '../scripts/import-melodies.mjs';
import {parseChord} from '../src/music/realization.mjs';
import {mod} from '../dist/harmony.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const data=read('dist/data/openbook-melodies.json'),audit=read('evidence/openbook-melody-audit.json'),qualities=read('src/music/chord-vocabulary.json').qualities,songs=read('dist/data/roadmaps.json').songs;
function notesFromMidi(bytes){
 const midi=parseMidi(bytes),ppq=midi.header.ticksPerBeat,notes=[];
 for(const track of midi.tracks){let tick=0;const active=new Map();for(const e of track){tick+=e.deltaTime;const key=e.channel+':'+e.noteNumber;if(e.type==='noteOn'&&e.velocity){assert.ok(!active.has(key));active.set(key,{pitch:e.noteNumber,start:tick/ppq,velocity:e.velocity});}else if(e.type==='noteOff'||e.type==='noteOn'&&!e.velocity){const onset=active.get(key);assert.ok(onset);active.delete(key);notes.push({...onset,duration:tick/ppq-onset.start});}}assert.equal(active.size,0);}
 return {midi,notes:notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.duration-b.duration)};
}
test('all OpenBook candidates retain pinned provenance, exact harmony coverage and actual GM65 MIDI notes',()=>{
 assert.ok(data.entries.length>=79);assert.equal(data.entries.length,audit.counts.validatedArrangements);assert.equal(data.timeUnit,'quarter-note');assert.equal(data.pitchBasis,'source');assert.equal(new Set(data.entries.map(e=>e.id)).size,data.entries.length);
 assert.match(data.sources[0].repositoryLicenseFile,/MIT License/);assert.match(data.sources[0].repositoryReadmeRights,/GPL/);
 for(const e of data.entries){
  assert.equal(e.id,e.melodyId);assert.equal(e.tonicConfidence,'high');assert.match(e.provenance.tonicBasis,/Explicit/);assert.match(e.provenance.url,/adbe5c68ff59e20068dd754e7d227979fa628d33/);assert.match(e.provenance.sha256,/^[a-f0-9]{64}$/);assert.equal(e.provenance.decoder,'LilyPond 2.26.0');assert.deepEqual(melodyEligibility(e,qualities),[],e.title);assert.equal(e.totalBeats,e.barBeats*e.bars);assert.equal(e.pickupBeats,0);const original=songs[audit.entries.find(a=>a.id===e.id).originalSong];assert.equal(e.tonic[1].toLowerCase(),original.tonic[1].toLowerCase());
  assert.equal(e.chords[0].start,0);assert.equal(e.chords.at(-1).end,e.totalBeats);
  for(let i=0;i<e.chords.length;i++){const c=e.chords[i];assert.ok(c.end>c.start);if(i)assert.ok(Math.abs(c.start-e.chords[i-1].end)<1e-7,e.title);assert.ok(c.sourceLine>=e.provenance.sections.chords.startLine);if(c.symbol==='NC')continue;const parsed=parseChord(c.symbol,qualities,c);assert.ok(parsed,c.symbol);const expected=new Set(parsed.intervals.map(x=>mod(parsed.root+x)));if(parsed.slash)expected.add(parsed.bass);assert.deepEqual([...new Set(c.sourcePitches.map(mod))].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b),e.title+' '+c.symbol);}
  const {midi,notes}=notesFromMidi(fs.readFileSync(new URL('dist/'+e.midi,root)));assert.ok(midi.tracks.flat().some(e=>e.type==='programChange'&&e.programNumber===65));assert.equal(notes.length,e.notes.length,e.title);
  for(let i=0;i<notes.length;i++){assert.equal(notes[i].pitch,e.notes[i].pitch);assert.equal(notes[i].velocity,e.notes[i].velocity);assert.ok(Math.abs(notes[i].start-e.notes[i].start)<1/10080+1e-8);assert.ok(Math.abs(notes[i].duration-e.notes[i].duration)<1/10080+1e-8);assert.ok(e.notes[i].start+e.notes[i].duration<=e.totalBeats+1e-7);}
 }
});
test('Body and Soul preserves the encoded Real melody, triplets, volta endings and its own 32-bar changes',()=>{
 const e=data.entries.find(e=>e.normalizedTitle==='bodyandsoul');assert.ok(e);assert.equal(e.id,'openbook-body-and-soul-real');assert.deepEqual(e.tonic,['Db','Major']);assert.equal(e.bars,32);assert.equal(e.totalBeats,128);assert.equal(e.notes.length,129);assert.deepEqual(e.notes.slice(0,5).map(n=>[n.pitch,n.start,n.duration]),[[63,.5,.5],[65,1,.5],[63,1.5,.5],[65,2,1.5],[63,3.5,.5]]);
 const triplets=e.notes.filter(n=>n.start>=18&&n.start<20);assert.deepEqual(triplets.map(n=>n.pitch),[70,66,58]);assert.ok(triplets.every(n=>Math.abs(n.duration-2/3)<1e-8));
 assert.deepEqual(e.chords.filter(c=>c.start>=28&&c.start<32).map(c=>c.symbol),['Db6','Bb7']);assert.deepEqual(e.chords.filter(c=>c.start>=60&&c.start<64).map(c=>c.symbol),['Db','A7']);assert.equal(e.chords.find(c=>c.start===64).symbol,'DM7');assert.equal(e.chords.find(c=>c.start===96).symbol,'Ebm7');assert.equal(exactMelodyMatch(e,songs[28]),null,'Same title and length do not authorize overlay over different roadmap changes');
 assert.ok(audit.excludedAttempts.some(e=>e.path.endsWith('body_and_soul.ly.tera')&&e.version==='Fake')===false,'A fully encoded preferred Real arrangement is selected directly');
});

const python=[process.env.OPENBOOK_PYTHON,'/opt/homebrew/bin/python3.11','/opt/homebrew/bin/python3.14','python3'].filter(Boolean).find(p=>spawnSync(p,['-c','import tomllib'],{encoding:'utf8'}).status===0);
const lilypond=[process.env.LILYPOND,'/private/tmp/insights-melodies/lilypond-2.26.0/bin/lilypond','lilypond'].filter(Boolean).find(p=>spawnSync(p,['--version'],{encoding:'utf8'}).status===0);
const fixture=String.raw`{#
default_version = "Real"
[attributes]
title = "Fixture"
composer = "Source composer"
structure = "AABA"
[versions.Real]
doChords = true
doVoice = true
#}
{% if part == "ChordsReal" %}\chordmode {
\repeat volta 2 { c1 | g:7 | } \alternative { {c1 |} {f1 |} }
a1:m7 | c1 |
}{% endif %}
{% if part == "VoiceReal" %}{
\time 4/4 \key c \major
\repeat volta 2 { r4 \tuplet 3/2 {c8 d e} f2 | g1~ | } \alternative { {g1 |} {g1 |} }
a1 | c1 |
}{% endif %}`;
function compileFixture(text,sourceIntervals=false,pickups=false){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'openbook-fixture-'));
 try{
  const source=path.join(directory,'fixture.ly.tera');fs.writeFileSync(source,text);
  const script=`import importlib.util,pathlib,json,sys\np=pathlib.Path(sys.argv[1]);spec=importlib.util.spec_from_file_location('openbook',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);q=json.loads(pathlib.Path(sys.argv[5]).read_text())['qualities'];print(json.dumps(m.decode(pathlib.Path(sys.argv[2]),'Real',sys.argv[3],q,pathlib.Path(sys.argv[4]),pathlib.Path(sys.argv[4]),sys.argv[6]=='true',sys.argv[7]=='true')))`;
  return spawnSync(python,['-c',script,new URL('scripts/import-openbook-melodies.py',root).pathname,source,lilypond,directory,new URL('src/music/chord-vocabulary.json',root).pathname,String(sourceIntervals),String(pickups)],{encoding:'utf8'});
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
test('compiler fixture unfolds both alternate endings and merges actual tied notes without losing tuplets or rests',{skip:!python||!lilypond?'Requires Python 3.11+ and LilyPond':false},()=>{
 const result=compileFixture(fixture);assert.equal(result.status,0,result.stderr);const e=JSON.parse(result.stdout);assert.equal(e.bars,8);assert.equal(e.totalBeats,32);assert.deepEqual(e.chords.map(c=>[c.symbol,c.start,c.end]),[['C',0,4],['G7',4,8],['C',8,12],['C',12,16],['G7',16,20],['F',20,24],['Am7',24,28],['C',28,32]]);
 assert.deepEqual(e.notes.map(n=>n.pitch),[60,62,64,65,67,60,62,64,65,67,69,72]);assert.equal(e.notes[0].start,1);assert.ok(Math.abs(e.notes[0].duration-1/3)<1e-8);assert.deepEqual(e.notes.filter(n=>n.pitch===67).map(n=>[n.start,n.duration]),[[4,8],[16,8]]);
});
test('compiler rejects unencoded textual navigation and mismatched melody/harmony lengths',{skip:!python||!lilypond?'Requires Python 3.11+ and LilyPond':false},()=>{
 const navigation=compileFixture(fixture.replace('a1 | c1 |','a1^"D.C. al Coda" | c1 |'));assert.notEqual(navigation.status,0);assert.match(navigation.stderr,/Textual navigation/);
 const mismatch=compileFixture(fixture.replace('a1 | c1 |','a1 |'));assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/length mismatch/);
});

test('blank chord-label skips continue harmony while explicit rests remain no-chord',{skip:!python||!lilypond?'Requires Python 3.11+ and LilyPond':false},()=>{
 const result=compileFixture(fixture.replace('c1 | g:7 |','c1 | s1 |').replace('a1:m7 | c1 |','r1 | c1 |'));assert.equal(result.status,0,result.stderr);const e=JSON.parse(result.stdout);assert.deepEqual(e.chords.slice(0,2).map(c=>[c.symbol,c.start,c.end]),[['C',0,8],['C',8,12]]);assert.equal(e.chords[0].sourceContinuations.length,1);assert.equal(e.chords[0].sourceContinuations[0].sourceSymbol,'s1');assert.equal(e.chords.find(c=>c.start===24).symbol,'NC');
});


test('source-only compound interval overrides preserve compiled m6 and explicit added slash bass',{skip:!python||!lilypond?'Requires Python 3.11+ and LilyPond':false},()=>{
 const text=fixture.replace('a1:m7 | c1 |','a1:m6 | c1:m6/+d |');
 const strict=compileFixture(text);assert.notEqual(strict.status,0);assert.match(strict.stderr,/chord mismatch/);
 const result=compileFixture(text,true);assert.equal(result.status,0,result.stderr);const e=JSON.parse(result.stdout);
 assert.deepEqual(e.chords.at(-2).sourceIntervals,[0,3,7,9]);assert.deepEqual(e.chords.at(-1).sourceIntervals,[0,3,7,9]);assert.equal(e.chords.at(-1).symbol,'Cm6/D');
 for(const c of e.chords.slice(-2)){assert.equal(c.realizationBasis,'source-compiled-chord');assert.ok(c.sourceCorePitches.length);assert.deepEqual(parseChord(c.symbol,qualities,c).intervals,c.sourceIntervals);}
});

const pickupFixture=String.raw`{#
default_version = "Real"
[attributes]
title = "Pickup fixture"
composer = "Source composer"
structure = "AA"
[versions.Real]
doChords = true
doVoice = true
#}
{% if part == "ChordsReal" %}\chordmode {
\partial 4 g4:7 | c1 | f1 |
}{% endif %}
{% if part == "VoiceReal" %}{
\time 4/4 \key c \major
\partial 4 g4 | c1 | f1 |
}{% endif %}`;

test('opt-in pickup decoding preserves actual notes and source measure0 without adding silent padding',{skip:!python||!lilypond?'Requires Python 3.11+ and LilyPond':false},()=>{
 const strict=compileFixture(pickupFixture);assert.notEqual(strict.status,0);assert.match(strict.stderr,/pickup requires explicit source review/);
 const result=compileFixture(pickupFixture,false,true);assert.equal(result.status,0,result.stderr);const e=JSON.parse(result.stdout);
 assert.equal(e.pickupBeats,1);assert.equal(e.totalBeats,9);assert.equal(e.bars,3);
 assert.deepEqual(e.measures,[{sourceNumber:'0',start:0,duration:1},{sourceNumber:'1',start:1,duration:4},{sourceNumber:'2',start:5,duration:4}]);
 assert.deepEqual(e.notes.map(n=>[n.pitch,n.start,n.duration]),[[55,0,1],[60,1,4],[65,5,4]]);
 assert.deepEqual(e.chords.map(c=>[c.symbol,c.start,c.end]),[['G7',0,1],['C',1,5],['F',5,9]]);
 assert.deepEqual(e.provenance.irregularMeasures.map(m=>[m.sourceNumber,m.kind,m.duration]),[['0','pickup',1]]);assert.match(e.provenance.pickupPolicy,/No padding/);
 assert.ok(melodyEligibility(e,qualities).length,'Irregular candidate is not silently admitted by the regular-grid runtime');
});

test('pickup length comes from LilyPond duration semantics including dots and multipliers',{skip:!python||!lilypond?'Requires Python 3.11+ and LilyPond':false},()=>{
 for(const [notation,beats] of [['4.',1.5],['8*3',1.5],['16',.25]]){
  const source=pickupFixture.replaceAll('\\partial 4 g4',`\\partial ${notation} g${notation}`),result=compileFixture(source,false,true);assert.equal(result.status,0,result.stderr);const e=JSON.parse(result.stdout);
  assert.equal(e.pickupBeats,beats);assert.equal(e.totalBeats,beats+8);assert.equal(e.measures[1].start,beats);assert.equal(e.notes[1].start,beats);assert.equal(e.notes[0].duration,beats);
 }
});

test('pickup opt-in still rejects textual navigation, mismatched streams and repeat-local pickup declarations',{skip:!python||!lilypond?'Requires Python 3.11+ and LilyPond':false},()=>{
 const navigation=compileFixture(pickupFixture.replace('c1 | f1 |','c1^"D.C. al Coda" | f1 |'),false,true);assert.notEqual(navigation.status,0);assert.match(navigation.stderr,/Textual navigation/);
 const noChordDeclaration=compileFixture(pickupFixture.replace('\\partial 4 g4:7','g4:7'),false,true);assert.notEqual(noChordDeclaration.status,0);assert.match(noChordDeclaration.stderr,/Pickup must be one matching initial/);
 const repeated=compileFixture(pickupFixture.replaceAll('\\partial 4 g4','\\repeat unfold 2 { \\partial 4 g4').replaceAll('f1 |\n}','f1 | }\n}'),false,true);assert.notEqual(repeated.status,0);assert.match(repeated.stderr,/Pickup must be one matching initial|structural warning/);
});
