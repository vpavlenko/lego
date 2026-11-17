import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareAdditionalStandards} from '../scripts/import-standards.mjs';
import {parseBrickDictionary} from '../src/music/brick-parser.mjs';
import {sourceMeasureMap,sliceMeasureMap} from '../src/music/measure-map.mjs';
import {realizeSong,playbackPlan} from '../src/music/realization.mjs';
import {attachMelody} from '../src/music/melody.mjs';
import {notationRows} from '../src/music/notation-rows.mjs';
import {phraseGrid} from '../src/music/phrases.mjs';
import {analyzeForm} from '../src/music/forms.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const qualities=read('src/music/chord-vocabulary.json').qualities,all=read('dist/data/openbook-melodies.json').entries,entries=all.filter(e=>e.pickupBeats>0),songs=read('dist/data/additional-standards.json').songs,EPS=1e-7;
const near=(a,b)=>assert.ok(Math.abs(a-b)<EPS,`${a} != ${b}`);
test('all pickup arrangements retain exact authored note/harmony times and truthful measure boundaries',()=>{
 assert.equal(entries.length,72);
 for(const entry of entries){
  const song=songs.find(s=>s.melodyId===entry.id);assert.ok(song,entry.title);assert.ok(Number.isInteger(song.arrangementOf),entry.title);
  assert.deepEqual(song.measureMap,entry.measures);near(song.bars*entry.barBeats,entry.totalBeats);
  const performance=attachMelody(realizeSong(song,qualities),song,entry),plan=playbackPlan(performance),melody=performance.notes.filter(n=>n.voice===1);
  assert.equal(performance.beats,entry.totalBeats);assert.equal(melody.length,entry.notes.length);assert.equal(performance.melody.beatOffset,0);
  entry.notes.forEach((n,i)=>{const m=melody.find(m=>m.id===`melody:${entry.id}:${i}`);assert.equal(m.start,n.start);assert.equal(m.duration,n.duration);assert.equal(m.pitch,n.pitch+performance.melody.transpose);});
  assert.equal(performance.chords.length,entry.chords.length,entry.title+' no extra attacks at row cuts');
  entry.chords.forEach((chord,i)=>{near(performance.chords[i].start,chord.start);near(performance.chords[i].end,chord.end);});
  for(const event of plan.events.filter(e=>e.type==='on'))near(plan.beatAt(plan.timeAt(event.beat)),event.beat);
  const rows=notationRows({song,performance});near(rows[0].start,0);near(rows[0].end,entry.pickupBeats);near(rows.at(-1).end,entry.totalBeats);
  const boundaries=new Set([...entry.measures.map(m=>m.start),entry.totalBeats]);for(const row of rows){assert.ok([...boundaries].some(b=>Math.abs(b-row.start)<EPS));assert.ok([...boundaries].some(b=>Math.abs(b-row.end)<EPS));}
  const phrases=phraseGrid(song,analyzeForm(song));assert.equal(phrases.starts[0],entry.pickupBeats);assert.deepEqual(phrases.starts,entry.measures.filter(m=>Number(m.sourceNumber)>0).filter((m,i)=>i%4===0).map(m=>m.start));
 }
 const tail=entries.find(e=>e.title==='The Touch Of Your Lips');assert.ok(tail);assert.equal(tail.measures.at(-1).duration,3);
});
test('a compiler map with moved/gapped/interior partial boundaries fails admission',()=>{
 const entry=entries[0];assert.deepEqual(sourceMeasureMap(entry),entry.measures);
 for(const mutate of [e=>e.measures[1].start+=.5,e=>e.measures[2].duration-=.5,e=>e.measures[0].sourceNumber='1',e=>e.totalBeats+=1,e=>delete e.provenance.pickupPolicy,e=>e.provenance.format='MusicXML']){
  const changed=structuredClone(entry);mutate(changed);assert.throws(()=>sourceMeasureMap(changed));
  const result=prepareAdditionalStandards([changed],{originalSongs:[],dictionary:parseBrickDictionary(''),qualities});assert.equal(result.songs.length,0);assert.equal(result.audit.rejected.length,1);
 }
});
test('brick extraction clips visual boundaries without rescaling source music',()=>{
 const song=songs.find(s=>s.melodyId===entries[0].id),map=sliceMeasureMap(song,0,1.25).measureMap;
 assert.deepEqual(map,[{start:0,duration:1,sourceNumber:'1'},{start:1,duration:4,sourceNumber:'2'}]);
});

test('all 403 prior performance files retain their recorded source bytes',()=>{
 const audit=read('evidence/pickup-alignment-audit.json');assert.equal(Object.keys(audit.preservation.baselinePerformanceHashes).length,403);
 for(const [name,hash]of Object.entries(audit.preservation.baselinePerformanceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../dist/data/performances/'+name,import.meta.url))).digest('hex'),hash,name);
});
