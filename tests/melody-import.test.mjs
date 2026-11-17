import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseMidi} from 'midi-file';
import {exactMelodyMatch,normalizeMelodyTitle,melodyEligibility,tonicEvidence} from '../scripts/import-melodies.mjs';
import {pitch,mod} from '../dist/harmony.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const data=read('dist/data/melodies.json'),entries=Object.values(data.entries),candidates=read('dist/data/melody-leadsheets.json'),songs=read('dist/data/roadmaps.json').songs,qualities=read('src/music/chord-vocabulary.json').qualities;
const tolerance=1/10080+1e-8;

function decodedNotes(buffer){
 const midi=parseMidi(buffer),ppq=midi.header.ticksPerBeat,result=[];
 for(const track of midi.tracks){
  let tick=0;const active=new Map();
  for(const event of track){
   tick+=event.deltaTime;const key=event.channel+':'+event.noteNumber;
   if(event.type==='noteOn'&&event.velocity){if(!active.has(key))active.set(key,[]);active.get(key).push({pitch:event.noteNumber,start:tick/ppq,velocity:event.velocity});}
   if(event.type==='noteOff'||event.type==='noteOn'&&!event.velocity){const onset=active.get(key)?.shift();assert.ok(onset,'MIDI off has a corresponding onset');result.push({...onset,duration:tick/ppq-onset.start});}
  }
  assert.ok([...active.values()].every(notes=>!notes.length),'No hanging MIDI notes');
 }
 return {midi,notes:result.sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.duration-b.duration)};
}

test('every imported melody has source provenance and its MIDI round-trips actual notes',()=>{
 assert.equal(entries.length,131);assert.equal(data.timeUnit,'quarter-note');assert.equal(data.pitchBasis,'source');
 assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
 for(const e of entries){
  assert.ok(e.notes.length,e.title);assert.ok(e.provenance.url.includes('/b6a559e8bd2719c3279ed0e81554b5cdbab0da03/'));
  assert.match(e.provenance.sha256,/^[a-f0-9]{64}$/);assert.equal(e.provenance.sourceRights,'cc-by 4.0');
  assert.ok(e.provenance.melodySelection);assert.equal(e.provenance.melodySelection.partIndex,0);
  for(const n of e.notes){assert.ok(Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127);assert.ok(n.start>=0&&n.duration>0);assert.ok(n.start+n.duration<=e.totalBeats+1e-7,e.title);}
  const {midi,notes}=decodedNotes(fs.readFileSync(new URL('dist/'+e.midi,root)));
  assert.ok(midi.tracks.flat().some(event=>event.type==='programChange'&&event.programNumber===65));
  assert.equal(notes.length,e.notes.length,e.title);
  for(let i=0;i<notes.length;i++){
   const actual=notes[i],expected=e.notes[i];assert.equal(actual.pitch,expected.pitch,e.title);assert.equal(actual.velocity,expected.velocity);
   assert.ok(Math.abs(actual.start-expected.start)<tolerance,e.title+' onset');assert.ok(Math.abs(actual.duration-expected.duration)<tolerance,e.title+' duration');
  }
 }
});

test('Airegin omits lower piano voice and flags malformed upper-voice bars',()=>{
 const e=entries.find(e=>e.title==='Airegin');assert.equal(e.provenance.melodySelection.voice,'1');assert.ok(e.provenance.melodySelection.auxiliaryPitchesOmitted>0);
 assert.deepEqual(e.notes.filter(n=>n.start===3).map(n=>n.pitch),[65]);assert.deepEqual(e.measures.slice(0,4).map(m=>m.start),[0,4,8,12]);
 assert.ok(e.provenance.leadOverfullMeasures.length);assert.ok(e.candidateExclusions.includes('irregular source measures'));assert.ok(!data.existingMatches.some(m=>m.melodyId===e.id));
});

test('printed source titles resolve copied stale work-title metadata without invented renaming',()=>{
 for(const [title,stale] of [['Django','Dearly beloved'],['Leila','Impressions'],['Just you, just me','Just the way you are'],['Eye of the hurricane','Exactly like you'],["Groovin' high",'Groove merchant'],['The fields we know','500 miles high']]){
  const e=entries.find(e=>e.title===title);assert.ok(e,title);assert.equal(e.provenance.titleMetadata.printedTitle,title);assert.equal(e.provenance.titleMetadata.workTitle,stale);assert.equal(e.provenance.titleMetadata.selectedFrom,'printed title credit');
 }
});

test('append candidates use the exact source melody/chord arrangement and confirmed key evidence',()=>{
 assert.equal(candidates.entries.length,30);
 for(const e of candidates.entries){
  assert.equal(e.melodyId,e.id);assert.equal(e.tonicConfidence,'high');assert.equal(e.pickupBeats,0);assert.equal(e.totalBeats,e.bars*e.barBeats);
  assert.deepEqual(melodyEligibility(e,qualities),[]);assert.deepEqual(tonicEvidence(e).tonic,e.tonic);
  const source=entries.find(item=>item.id===e.id);assert.deepEqual(e.notes,source.notes);assert.deepEqual(e.chords,source.chords);
 }
});

test('existing roadmap melody attaches only after exact constant-transposition root/rhythm verification',()=>{
 assert.deepEqual(data.existingMatches.map(m=>m.song),[73]);
 for(const match of data.existingMatches){
  const e=entries.find(e=>e.id===match.melodyId),song=songs[match.song];assert.deepEqual(exactMelodyMatch(e,song),match);assert.equal(match.beatOffset,0);assert.ok(Math.abs(match.transpose)<=6);
  const firstSource=e.chords.find(c=>/^[A-G]/.test(c.symbol)),firstTarget=song.rows[0].chords[0];
  assert.equal(mod(pitch(firstSource.symbol)+match.transpose),mod(pitch(firstTarget.symbol)-pitch(song.tonic[0])));
  assert.equal(exactMelodyMatch({...e,totalBeats:e.totalBeats+1},song),null);
  const changed=structuredClone(e);changed.chords[0].end-=0.5;assert.equal(exactMelodyMatch(changed,song),null);
  const wrong=structuredClone(e);wrong.chords[0].symbol='F#7';assert.equal(exactMelodyMatch(wrong,song),null);
 }
 assert.equal(normalizeMelodyTitle('The Girl from Ipanema'),'girlfromipanema');
 assert.ok(!data.existingMatches.some(m=>m.song===3),'Airegin arrangement is not stretched into the roadmap');
});

const fixture=`<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0"><work><work-title>Fixture</work-title></work><identification><creator type="composer">Fixture</creator></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>4</duration></backup><note><pitch><step>G</step><octave>2</octave></pitch><duration>24</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
<backup><duration>24</duration></backup><note><pitch><step>C</step><octave>2</octave></pitch><duration>4</duration><voice>3</voice><type>quarter</type><staff>2</staff></note></measure>
<measure number="1"><barline location="left"><repeat direction="forward"/></barline>
<harmony><root><root-step>C</root-step></root><kind>dominant</kind><bass><bass-step>G</bass-step></bass><degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree></harmony>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><type>quarter</type><staff>1</staff></note><note><rest/><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note><note><chord/><pitch><step>F</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
<backup><duration>16</duration></backup><note><pitch><step>G</step><octave>2</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
<backup><duration>16</duration></backup><note><pitch><step>C</step><octave>2</octave></pitch><duration>16</duration><voice>3</voice><type>whole</type><staff>2</staff></note></measure>
<measure number="2"><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><pitch><step>E</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>C</step><octave>2</octave></pitch><duration>16</duration><voice>3</voice><type>whole</type><staff>2</staff></note><barline location="right"><repeat direction="backward"/></barline></measure></part></score-partwise>`;
const pythonCandidates=[process.env.MELODY_PYTHON,'/private/tmp/insights-melodies/venv/bin/python','python3'].filter(Boolean);
const python=pythonCandidates.find(candidate=>spawnSync(candidate,['-c','import music21'],{encoding:'utf8'}).status===0);
test('MusicXML fixture preserves pickup, repeats, ties and rests while omitting auxiliary staff/voice', {skip:!python&&'Set MELODY_PYTHON to a Python environment with music21'},()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'melody-fixture-'));
 try{
  const target=path.join(directory,'fixture.musicxml');fs.writeFileSync(target,fixture);
  const script=`import importlib.util,json,pathlib,sys\np=pathlib.Path(sys.argv[1]);s=importlib.util.spec_from_file_location('import_melodies',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.decode(pathlib.Path(sys.argv[2]),pathlib.Path(sys.argv[3]))))`;
  const result=spawnSync(python,['-c',script,new URL('scripts/import-melodies.py',root).pathname,target,directory],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const e=JSON.parse(result.stdout);
  assert.equal(e.pickupBeats,1);assert.equal(e.totalBeats,17);assert.equal(e.bars,4);
  assert.deepEqual(e.notes.map(n=>[n.pitch,n.start,n.duration]),[[72,0,2],[77,3,2],[76,5,4],[72,9,1],[77,11,2],[76,13,4]]);
  assert.equal(e.chords[0].symbol,'C9/G');assert.equal(e.provenance.unfoldStatus,'expanded');
  assert.equal(e.provenance.melodySelection.sourceParts,2);assert.equal(e.provenance.melodySelection.voice,'1');assert.ok(e.provenance.melodySelection.auxiliaryPitchesOmitted>0);
  assert.deepEqual(e.measures.map(m=>m.start),[0,1,5,9,13]);assert.deepEqual(e.provenance.leadOverfullMeasures,[]);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
