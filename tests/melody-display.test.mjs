import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {melodyDisplay} from '../src/music/melody-display.mjs';

test('the smallest uniform visual octave shift separates a head while preserving original audition identities',()=>{
 const notes=[{id:'chord',voice:0,pitch:76,start:0,duration:4},{id:'head1',voice:1,pitch:53,start:0,duration:1},{id:'head2',voice:1,pitch:72,start:1,duration:2}],before=JSON.stringify(notes),display=melodyDisplay(notes);
 assert.equal(display.octaves,3);assert.equal(display.notes[0],notes[0]);assert.deepEqual(display.notes.slice(1).map(n=>n.pitch),[89,108]);assert.equal(display.sourceById.get('head1'),notes[1]);assert.equal(JSON.stringify(notes),before);
 assert.equal(melodyDisplay([notes[0],{...notes[1],pitch:78}]).octaves,0);assert.equal(melodyDisplay([notes[0]]).notes[0],notes[0]);
});

test('every arrangement keeps one display offset, source events, chord register and pitch classes unchanged',()=>{
 const root=new URL('../dist/data/performances/',import.meta.url);let shifted=0;
 for(const name of fs.readdirSync(root).filter(name=>/^\d+\.json$/.test(name))){const p=JSON.parse(fs.readFileSync(new URL(name,root))),before=JSON.stringify(p),display=melodyDisplay(p.notes),melody=display.notes.filter(n=>n.voice===1),chords=display.notes.filter(n=>(n.voice??0)===0);if(display.octaves)shifted++;
  display.notes.forEach((note,i)=>{const source=p.notes[i];assert.equal(display.sourceById.get(note.id),source);assert.deepEqual({...note,pitch:source.pitch},source);assert.equal(note.pitch-source.pitch,source.voice===1?display.octaves*12:0);assert.equal((note.pitch-source.pitch)%12,0);});
  if(melody.length&&chords.length){const low=Math.min(...melody.map(n=>n.pitch)),high=Math.max(...chords.map(n=>n.pitch));assert.ok(low>=high+2);if(display.octaves)assert.ok(low-12<high+2);}
  assert.equal(JSON.stringify(p),before);
 }
 assert.ok(shifted>200);
});
