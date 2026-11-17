import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeForm,chordTimeline} from '../src/music/forms.mjs';
import {alignRepeatedSubphrases} from '../src/music/section-layout.mjs';
import {buildBrickIndex} from '../src/music/bricks.mjs';
import {buildLearnerBrickIndex} from '../src/music/brick-families.mjs';
const {songs}=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8'));
const learners=buildLearnerBrickIndex(buildBrickIndex(songs)),brickMap=new Map(learners.bricks.flatMap(b=>[b.name,...b.aliases].map(name=>[name,b])));
const wind=songs.find(song=>song.index===74),formal=analyzeForm(wind);
const shape=form=>form.layoutSections.map(s=>[s.start,s.end,s.label,s.layoutRow,s.layoutColumn]);
const expected=[[0,4,'A',0,0],[4,8,'A',1,0],[8,16,'B',1,4],[16,20,'A',2,0],[20,24,'A',3,0],[24,32,'C',3,4]];
const untouched=(song,form=formal)=>{const result=alignRepeatedSubphrases(song,form,brickMap);assert.deepEqual(result.layoutSections,form.sections);assert.equal(result.layoutColumns,form.columns);return result;};

test('Gone With the Wind aligns all four repeated four-bar A ideas without changing its ABAC form',()=>{
 const sourceJSON=JSON.stringify(wind),formJSON=JSON.stringify(formal),result=alignRepeatedSubphrases(wind,formal,brickMap);
 assert.deepEqual(shape(result),expected);assert.equal(result.layoutColumns,12);assert.equal(result.pattern,'ABAC');assert.equal(result.family,'ABAC');
 assert.deepEqual(result.sections,formal.sections);assert.equal(result.sections.length,4);assert.equal(result.columns,16);assert.equal(JSON.stringify(wind),sourceJSON);assert.equal(JSON.stringify(formal),formJSON);
 for(const s of result.layoutSections.filter(s=>s.label==='A')){assert.equal(s.subphraseBrick,'7 Chord Dropback');assert.equal(s.subphraseComparison.score,1);assert.equal(s.subphraseComparison.rootScore,1);}
});

test('display partitions preserve chronological coverage and every original chord endpoint/duration',()=>{
 for(const song of songs){
  const form=analyzeForm(song),result=alignRepeatedSubphrases(song,form,brickMap);assert.deepEqual(result.sections,form.sections);assert.equal(result.pattern,form.pattern);assert.equal(result.family,form.family);
  if(!result.layoutSections.length)continue;
  const spans=result.layoutSections;assert.equal(spans[0].start,0);assert.equal(spans.at(-1).end,song.bars);
  for(let i=1;i<spans.length;i++)assert.equal(spans[i].start,spans[i-1].end);
  for(const chord of chordTimeline(song)){
   const pieces=spans.map(s=>({start:Math.max(s.start,chord.start),end:Math.min(s.end,chord.end)})).filter(p=>p.end>p.start);
   assert.equal(pieces[0].start,chord.start);assert.equal(pieces.at(-1).end,chord.end);
   assert.ok(Math.abs(pieces.reduce((n,p)=>n+p.end-p.start,0)-(chord.end-chord.start))<1e-7);
  }
 }
});

test('the audited corpus matches only five complete repeated multi-chord patterns',()=>{
 const hits=songs.filter(song=>alignRepeatedSubphrases(song,analyzeForm(song),brickMap).layoutSections.length>analyzeForm(song).sections.length);
 assert.deepEqual(hits.map(s=>s.index),[74,119,218,227,228]);
 for(const i of [119,218,227])assert.deepEqual(shape(alignRepeatedSubphrases(songs[i],analyzeForm(songs[i]),brickMap)),expected);
 const love=alignRepeatedSubphrases(songs[228],analyzeForm(songs[228]),brickMap);assert.equal(love.pattern,'AABA');assert.equal(love.sections.length,4);assert.equal(love.layoutSections.length,7);
 assert.deepEqual(love.layoutSections.filter(s=>s.label==='A').map(s=>[s.start,s.layoutRow,s.layoutColumn]),[[0,0,0],[4,1,0],[8,2,0],[12,3,0],[24,4,0],[28,5,0]]);
});

test('one-chord repetition, a shared opening alone, or inconsistent formal As cannot trigger splitting',()=>{
 const one=structuredClone(wind);for(const row of one.rows)for(const chord of row.chords)chord.symbol='CM7';untouched(one);
 const opening=structuredClone(wind);for(const row of opening.rows)for(const chord of row.chords){const at=row.startBar+chord.start;if(at>=4.5&&at<8)chord.symbol='F#7';}untouched(opening);
 const inconsistent=structuredClone(wind);inconsistent.rows[2].bricks[1].name='Minor On';untouched(inconsistent);
 const clipped=structuredClone(wind);clipped.rows[0].chords[4].clipped=true;untouched(clipped);
 const gap=structuredClone(wind);gap.rows[0].chords[4].start+=.125;untouched(gap);
 const short={...formal,sections:formal.sections.map(s=>({...s,end:s.start+2,bars:2}))};untouched(wind,short);
});

test('halves must be complete occurrences, not cuts through a long brick or merges of adjacent same-row bricks',()=>{
 const long=structuredClone(wind);for(const row of [long.rows[0],long.rows[2]])row.bricks=[{name:'7 Chord Dropback',start:0,end:8}];untouched(long);
 const adjacent=structuredClone(wind);adjacent.rows[0].bricks.splice(0,1,{name:'7 Chord Dropback',start:0,end:2},{name:'7 Chord Dropback',start:2,end:4});untouched(adjacent);
});

function narrowRows(song){
 const result=structuredClone(song),rows=[];
 for(const source of result.rows)for(let start=source.startBar;start<source.startBar+source.bars;start+=2){
  const end=start+2,slice=field=>source[field].map(item=>({...item,start:source.startBar+item.start,end:source.startBar+item.end})).filter(item=>item.start<end&&item.end>start).map(item=>({...item,start:Math.max(start,item.start)-start,end:Math.min(end,item.end)-start}));
  rows.push({startBar:start,bars:2,keys:slice('keys'),bricks:slice('bricks'),chords:slice('chords'),joins:source.joins.map(j=>({...j,at:source.startBar+j.at})).filter(j=>j.at>=start&&j.at<end).map(j=>({...j,at:j.at-start}))});
 }
 result.rows=rows;return result;
}
test('one occurrence may continue across source rows while joins preserve distinct occurrences',()=>{
 const continued=narrowRows(wind),before=JSON.stringify(continued);assert.deepEqual(shape(alignRepeatedSubphrases(continued,formal,brickMap)),expected);assert.equal(JSON.stringify(continued),before);
 continued.rows[1].joins.push({at:0,name:'Homer',from:'Eb',to:'Eb',delta:0});untouched(continued);
});

test('canonical learner aliases are optional and never substitute for harmonic evidence',()=>{
 const alias=structuredClone(wind);alias.rows[0].bricks[1].name='7 Chord Dropback +...';
 assert.deepEqual(alignRepeatedSubphrases(alias,formal).layoutSections,formal.sections);assert.deepEqual(shape(alignRepeatedSubphrases(alias,formal,brickMap)),expected);
 alias.rows[0].chords[11].symbol='F#7';untouched(alias);
});
