import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {realizeSong,parseChord,playbackPlan} from '../src/music/realization.mjs';
import {encodeMidi} from '../src/music/midi.mjs';
import {buildBrickIndex,brickExample} from '../src/music/bricks.mjs';
import {songModulations,modulationAt,modulationDelta} from '../src/music/modulations.mjs';
import {pitch,transposeRoot} from '../dist/harmony.mjs';
import {pitchRange,staveGeometry,tonicAt,keyMarkers} from '../packages/rawl-notation/src/geometry.mjs';
const require=createRequire(import.meta.url),{parseMidi}=require('midi-file');
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const {songs}=read('../dist/data/roadmaps.json'),{qualities}=read('../src/music/chord-vocabulary.json');

test('every legible chord in all 242 standards has exact vocabulary tones and a round-trip MIDI',()=>{
 let notes=0,clipped=0;
 for(const song of songs){
  const p=realizeSong(song,qualities),parsed=parseMidi(encodeMidi(p));notes+=p.notes.length;
  assert.equal(p.beats,song.bars*song.meter[0]*4/song.meter[1]);assert.equal(parsed.header.ticksPerBeat,480);assert.equal(parsed.tracks.length,3);
  const result=[];
  for(const track of parsed.tracks){let tick=0;const active=new Map();for(const e of track){tick+=e.deltaTime;
   if(e.type==='noteOn'&&e.velocity){const key=e.channel+':'+e.noteNumber;assert.ok(!active.has(key),'overlapping same-pitch MIDI');active.set(key,{tick,velocity:e.velocity});}
   if(e.type==='noteOff'||e.type==='noteOn'&&!e.velocity){const key=e.channel+':'+e.noteNumber,on=active.get(key);assert.ok(on);result.push([e.channel,e.noteNumber,on.tick,tick-on.tick,on.velocity]);active.delete(key);}
  }assert.equal(active.size,0);assert.equal(tick,Math.round(p.beats*480));}
  const expected=p.notes.map(n=>[n.voice,n.pitch,Math.round(n.start*480),Math.round(n.duration*480),n.velocity]);
  const sort=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));assert.deepEqual(result.sort(sort),expected.sort(sort));
  for(const c of p.chords){
   const ns=p.notes.filter(n=>n.chord===c.id);
   if(c.clipped){clipped++;assert.equal(ns.length,0);continue;}
   const parsed=parseChord(c.symbol,qualities),pcs=new Set(ns.map(n=>n.pitch%12));
   for(const interval of parsed.intervals)assert.ok(pcs.has((parsed.root+interval)%12),c.symbol);
   assert.equal(ns.find(n=>n.voice===1).pitch%12,parsed.bass);
   for(const n of ns){assert.ok(n.pitch>=0&&n.pitch<=127);assert.equal(n.start,c.start);assert.equal(n.duration,c.end-c.start);}
  }
  const plan=playbackPlan(p,80);assert.equal(plan.timeAt(1),.75);assert.equal(plan.beatAt(.75),1);assert.equal(plan.notes.length,p.notes.length);
 }
 assert.equal(clipped,8);assert.equal(notes,54556);
});

test('all 354 brick pages index every source passage and have stable unique addresses',()=>{
 const index=buildBrickIndex(songs);assert.equal(index.bricks.length,354);assert.equal(new Set(index.bricks.map(b=>b.slug)).size,354);
 const names=new Map(index.bricks.map(b=>[b.name,b]));let count=0;
 for(const song of songs)for(const row of song.rows)for(const brick of row.bricks){
  count++;const target=names.get(brick.name),match=target.standards.find(s=>s.song===song.index);assert.ok(match);
  assert.ok(match.passages.some(p=>p.startBar===row.startBar+brick.start&&p.endBar===row.startBar+brick.end));
 }
 assert.equal(index.bricks.reduce((n,b)=>n+b.passages,0),count);
 for(const b of index.bricks){assert.ok(b.standards.length);assert.equal(new Set(b.standards.map(s=>s.song)).size,b.standards.length);}
});

test('Caplin geometry keeps held notes in both rows and keeps exact note heights',()=>{
 const notes=[{pitch:36,start:0,duration:8},{pitch:78,start:2,duration:1},{pitch:60,start:6,duration:3}];
 assert.deepEqual(pitchRange(notes,{start:4,end:8}),{low:36,high:60});assert.deepEqual(pitchRange(notes,{start:8,end:12}),{low:60,high:60});
 const axis=staveGeometry({low:36,high:78});assert.equal(axis.pitchToY(60),74);assert.equal(axis.notesBottom,153);assert.equal(axis.pitchToY(59)-axis.pitchToY(60),3);
 assert.equal(tonicAt(0,[{beat:4,tonic:5}],4),0);assert.equal(tonicAt(0,[{beat:4,tonic:5}],4.01),5);
});


test('every brick has a playable source-derived example in its local tonic C',()=>{
 for(const brick of buildBrickIndex(songs).bricks){
  const {previewSong,source}=brickExample(brick,songs),p=realizeSong(previewSong,qualities),sourceSong=songs.find(s=>s.index===source.song),row=sourceSong.rows[source.row];
  assert.ok(p.beats>0);assert.ok(p.notes.length,brick.name);assert.equal(p.changes[0].tonic,0);assert.equal(p.beats,source.end-source.start);
  for(const c of previewSong.rows[0].chords){assert.ok(row.chords.some(original=>original.symbol===c.symbol&&original.start<source.endBar-row.startBar&&original.end>source.startBar-row.startBar));}
  for(const n of p.notes){assert.ok(n.start>=0);assert.ok(n.start+n.duration<=p.beats+1e-6);assert.ok(Number.isFinite(n.pitch));}
  const generated=read('../dist/data/brick-performances/'+brick.slug+'.json');assert.deepEqual(generated.previewSong,previewSong);assert.equal(generated.notes.length,p.notes.length);assert.ok(parseMidi(fs.readFileSync(new URL('../dist/midi/bricks/'+brick.slug+'.mid',import.meta.url))).tracks.length===3);
 }
});


test('all 1271 joins start Rawl tonics at their exact onset, including zero shifts',()=>{
 let joins=0,zeros=0;
 for(const song of songs){
  const changes=songModulations(song),p=read('../dist/data/performances/'+String(song.index).padStart(3,'0')+'.json'),markers=keyMarkers(0,changes),bb=song.meter[0]*4/song.meter[1];
  assert.deepEqual(p.changes,changes);
  for(const row of song.rows)for(const join of row.joins){
   joins++;const beat=(row.startBar+join.at)*bb,event=changes.find(c=>c.beat===beat),marker=markers.find(c=>c.beat===beat);
   assert.ok(event?.join,song.title+' '+join.name);assert.equal(event.name,join.name);assert.equal(event.tonic,pitch(transposeRoot(join.to,song.tonic[0])));
   assert.equal(modulationAt(changes,beat).tonic,event.tonic);assert.equal(tonicAt(0,changes,beat+1e-5),event.tonic);
   assert.equal(marker.delta,join.delta);assert.equal(marker.delta,modulationDelta(marker.previousTonic,event.tonic));if(join.delta===0)zeros++;
  }
 }
 assert.equal(joins,1271);assert.ok(zeros>0);
 // Homer stays in C minor; it must not jump to the next later F-minor label.
 const alone=songModulations(songs[8]);assert.equal(alone.find(c=>c.beat===4).tonic,0);assert.equal(alone.find(c=>c.beat===12).tonic,0);
 // A row-end modulation appears at the following row's start, not its end.
 const things=songModulations(songs[7]);assert.equal(things.find(c=>c.beat===32).tonic,7);
});
