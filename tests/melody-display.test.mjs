import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {melodyDisplay} from '../src/music/melody-display.mjs';

test('the smallest uniform visual octave shift separates a head while preserving original audition identities',()=>{
 const notes=[{id:'chord',voice:0,pitch:76,start:0,duration:4},{id:'head1',voice:1,pitch:53,start:0,duration:1},{id:'head2',voice:1,pitch:72,start:1,duration:2}],before=JSON.stringify(notes),display=melodyDisplay(notes);
 assert.equal(display.octaves,2);assert.equal(display.notes[0],notes[0]);assert.deepEqual(display.notes.slice(1).map(n=>n.pitch),[77,96]);assert.equal(display.sourceById.get('head1'),notes[1]);assert.equal(JSON.stringify(notes),before);
 assert.equal(melodyDisplay([notes[0],{...notes[1],pitch:78}]).octaves,0);assert.equal(melodyDisplay([notes[0]]).notes[0],notes[0]);
});

test('different-time register extremes, pickups and touching endpoints do not separate an already adjacent head',()=>{
 const notes=[{id:'high-chord',voice:0,pitch:84,start:1,duration:1},{id:'low-chord',voice:0,pitch:48,start:2,duration:1},{id:'high-head',voice:1,pitch:85,start:1,duration:1},{id:'low-head',voice:1,pitch:49,start:2,duration:1},{id:'pickup',voice:1,pitch:30,start:0,duration:1}];
 const display=melodyDisplay(notes);assert.equal(display.octaves,0);assert.equal(display.notes,notes);
 const noOverlap=[{id:'chord',pitch:90,start:0,duration:1},{id:'head',voice:1,pitch:30,start:1,duration:1}];assert.equal(melodyDisplay(noOverlap).octaves,0);assert.equal(melodyDisplay(noOverlap).notes,noOverlap);
});

test('held melody must clear later chord attacks, while an unnecessarily high head moves down by whole octaves',()=>{
 const held=[{id:'chord1',pitch:48,start:0,duration:2},{id:'chord2',pitch:72,start:2,duration:2},{id:'next-chord',pitch:96,start:4,duration:1},{id:'head',voice:1,pitch:60,start:0,duration:4}];
 assert.equal(melodyDisplay(held).octaves,2);assert.equal(melodyDisplay(held).notes.at(-1).pitch,84);
 const high=[{id:'chord',voice:0,pitch:48,start:0,duration:4},{id:'head',voice:1,pitch:85,start:0,duration:4}],display=melodyDisplay(high);
 assert.equal(display.octaves,-3);assert.equal(display.notes[1].pitch,49);assert.equal(display.notes[0],high[0]);assert.equal(display.sourceById.get('head'),high[1]);
});

test('Night in Tunisia keeps the closest valid constant register even where most gaps are wider',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../dist/data/performances/487.json',import.meta.url))),display=melodyDisplay(p.notes);
 assert.equal(p.title,'A Night In Tunisia');assert.equal(display.octaves,2);
 const head=display.notes.find(n=>n.voice===1&&n.start===96),chord=display.notes.find(n=>n.voice===0&&n.pitch===68&&n.start===94.5);
 assert.ok(head&&chord);assert.equal(head.pitch,79);assert.equal(head.pitch-chord.pitch,11);assert.equal(head.pitch-12-chord.pitch,-1);
});

test('every arrangement keeps one display offset, source events, chord register and pitch classes unchanged',()=>{
 const root=new URL('../dist/data/performances/',import.meta.url);let shifted=0;
 for(const name of fs.readdirSync(root).filter(name=>/^\d+\.json$/.test(name))){const p=JSON.parse(fs.readFileSync(new URL(name,root))),before=JSON.stringify(p),display=melodyDisplay(p.notes),melody=display.notes.filter(n=>n.voice===1),chords=display.notes.filter(n=>(n.voice??0)===0);if(display.octaves)shifted++;
  display.notes.forEach((note,i)=>{const source=p.notes[i];assert.equal(display.sourceById.get(note.id),source);assert.deepEqual({...note,pitch:source.pitch},source);assert.equal(note.pitch-source.pitch,source.voice===1?display.octaves*12:0);assert.equal(Math.abs(note.pitch-source.pitch)%12,0);});
  let minimum=Infinity;
  for(const head of melody)for(const chord of chords)if(Math.min(head.start+head.duration,chord.start+chord.duration)>Math.max(head.start,chord.start))minimum=Math.min(minimum,head.pitch-chord.pitch);
  if(Number.isFinite(minimum)){assert.ok(minimum>=1,name+' simultaneous gap');assert.ok(minimum<=12,name+' closest whole-octave register');}else assert.equal(display.octaves,0);
  assert.equal(JSON.stringify(p),before);
 }
 assert.ok(shifted>200);
});
