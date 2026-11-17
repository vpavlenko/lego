import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseMidi} from 'midi-file';
import {parseImprovisorDuration,parseImprovisorMelody,readImprovisorLeadsheet,isExplicitHead,improvisorTonic} from '../src/music/improvisor-melody.mjs';
const root=new URL('../',import.meta.url),data=JSON.parse(fs.readFileSync(new URL('dist/data/improvisor-melodies.json',root),'utf8')),audit=JSON.parse(fs.readFileSync(new URL('evidence/improvisor-melody-audit.json',root),'utf8'));

test('note duration follows Impro-Visor integer slot arithmetic, additive ties, dots and tuplets',()=>{
 for(const [text,slots] of [['',60],['0',0],['4',120],['8/3',40],['16/5',24],['4.',180],['4..',210],['2.+8/3+32',415],['2/3+16/3',180],['8/7',51]])assert.equal(parseImprovisorDuration(text),slots,text);
 assert.throws(()=>parseImprovisorDuration('4/0'));assert.throws(()=>parseImprovisorDuration('4garbage'));
 const melody=parseImprovisorMelody(['r4+8','c+4+8','r8','d+8/3','e+8/3','f+8/3']);
 assert.equal(melody.notes.length,4);assert.equal(melody.notes[0].start,1.5);assert.equal(melody.notes[0].duration,1.5);assert.equal(melody.totalBeats,4.5);assert.equal(melody.rests.length,2);
});

test('written octaves, source enharmonic pitch-class convention and inline velocity remain explicit',()=>{
 const melody=parseImprovisorMelody(['c','c+4','c--4','d#4','ds4','cb4','b#4','cu4','v67','g4']);
 assert.deepEqual(melody.notes.map(n=>n.pitch),[60,72,36,63,63,71,60,72,67]);assert.equal(melody.notes[0].velocity,127);assert.equal(melody.notes.at(-1).velocity,67);
 assert.throws(()=>parseImprovisorMelody(['not-a-note']));assert.throws(()=>parseImprovisorMelody(['r+4']));
});

test('source reader preserves parenthesized titles and chord carries while selecting only explicit heads',()=>{
 const source='(title Fixture (Bb Instruments))\n(composer Source)\n(meter 4 4)\n(key 0)\n(part(type chords)(title Fixture))\nC | / | Dm7 G7 | C |\n(part(type melody)(title Head))\nc1+1 r1 c1\n(part(type melody)(title Chorus 1)(composer Soloist))\nc8 d8 e8 f8 g8 a8 b8 c+8';
 const score=readImprovisorLeadsheet(source);assert.equal(score.metadata.title,'Fixture (Bb Instruments)');assert.equal(score.bars,4);assert.deepEqual(score.chords.map(c=>[c.symbol,c.start,c.end]),[['C',0,8],['Dm7',8,10],['G7',10,12],['C',12,16]]);
 assert.equal(score.parts.filter(isExplicitHead).length,1);assert.equal(score.parts.filter(isExplicitHead)[0].metadata.title,'Head');assert.equal(isExplicitHead({metadata:{type:'melody',title:'Instantiating Abstract Melody'}}),false);
 assert.deepEqual(improvisorTonic(score).tonic,['C','Major']);
});

test('Body and Soul has rests/placeholders and a Hawkins chorus, with no head attached',()=>{
 const body=audit.bodyAndSoul;assert.equal(body.length,4);assert.equal(data.entries.some(e=>e.normalizedTitle==='bodyandsoul'),false);
 const hawkins=body.find(f=>f.path.includes('BodyAndSoulHawkins'));assert.ok(hawkins);assert.equal(hawkins.parts[0].classification,'transcription-not-head');assert.equal(hawkins.parts[0].composer,'Coleman Hawkins');
 const imaginary=body.find(f=>f.path.includes('imaginary-book'));assert.equal(imaginary.parts[0].notes,1);assert.equal(imaginary.parts[0].classification,'placeholder-or-fragment');
 for(const folder of ['insights','changes'])assert.ok(body.find(f=>f.path.includes('/'+folder+'/')).parts.every(p=>p.classification==='rest-only'));
 assert.equal(audit.counts.explicitHeadOriginalStandards,2);assert.equal(data.existingMatches.length,0);
});

test('every imported head keeps its complete arrangement and MIDI round-trips all quantized notes',()=>{
 assert.equal(data.entries.length,9);assert.equal(new Set(data.entries.map(e=>e.normalizedTitle)).size,7);assert.equal(audit.counts.importedNotes,841);
 for(const entry of data.entries){
  assert.match(entry.provenance.partTitle,/^Head\b/);assert.equal(entry.provenance.commit,'550bbb554962249aceb0e82a72142e3e5b3c0d4a');assert.equal(entry.tonicConfidence,'high');assert.equal(entry.totalBeats,entry.bars*entry.barBeats);assert.ok(entry.notes.every(n=>n.start>=0&&n.start+n.duration<=entry.totalBeats+1e-7));
  const midi=parseMidi(fs.readFileSync(new URL('dist/'+entry.midi,root))),notes=[];
  for(const track of midi.tracks){let tick=0;const active=new Map();for(const e of track){tick+=e.deltaTime;if(e.type==='noteOn'&&e.velocity)active.set(e.noteNumber,{pitch:e.noteNumber,start:tick/midi.header.ticksPerBeat,velocity:e.velocity});if(e.type==='noteOff'||e.type==='noteOn'&&!e.velocity){const n=active.get(e.noteNumber);assert.ok(n);active.delete(e.noteNumber);notes.push({...n,duration:tick/midi.header.ticksPerBeat-n.start});}}assert.equal(active.size,0);}
  notes.sort((a,b)=>a.start-b.start);assert.equal(notes.length,entry.notes.length);for(let i=0;i<notes.length;i++){assert.equal(notes[i].pitch,entry.notes[i].pitch);assert.equal(notes[i].velocity,entry.notes[i].velocity);assert.ok(Math.abs(notes[i].start-entry.notes[i].start)<1e-8);assert.ok(Math.abs(notes[i].duration-entry.notes[i].duration)<1e-8);}
  assert.ok(midi.tracks.flat().some(e=>e.type==='programChange'&&e.programNumber===65));
 }
 const stockholm=data.entries.find(e=>e.existingSong===46);assert.equal(stockholm.bars,46);assert.equal(stockholm.notes.length,123);
 const green=data.entries.find(e=>e.existingSong===75);assert.deepEqual(green.tonic,['F','Major']);assert.deepEqual(green.provenance.sourcePlaybackTranspose,[-2,-2,-2]);assert.equal(green.notes[0].pitch,77);
});
