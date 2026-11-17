import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeForm,chordTimeline} from '../src/music/forms.mjs';
import {alignRepeatedSubphrases} from '../src/music/section-layout.mjs';
import {transposeChord} from '../dist/harmony.mjs';
import {notationRows} from '../src/music/notation-rows.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const songs=read('dist/data/standards.json').songs;
const shape=result=>result.layoutSections.map(s=>[s.start,s.end,s.label,s.layoutRow,s.layoutColumn]);

test('Honeysuckle Rose exposes both inner AABA choruses instead of two thirty-two-bar rows',()=>{
 const song=songs.find(s=>s.melodyId==='openbook-honeysuckle-rose-fake');assert.ok(song);assert.equal(song.bars,64);
 const form=analyzeForm(song),before=JSON.stringify({song,form}),result=alignRepeatedSubphrases(song,form);
 assert.equal(result.layoutBasis,'inner-aaba');assert.equal(result.layoutColumns,16);assert.equal(result.layoutPhraseBars,8);
 assert.deepEqual(shape(result),[[0,8,'A',0,0],[8,16,'A',1,0],[16,24,'B',1,8],[24,32,'A',2,0],[32,40,'A',3,0],[40,48,'A',4,0],[48,56,'B',4,8],[56,64,'A',5,0]]);
 assert.equal(result.layoutEvidence.minimumScore,.75);assert.deepEqual(result.sections,form.sections);assert.equal(result.family,form.family);assert.equal(result.pattern,form.pattern);assert.equal(JSON.stringify({song,form}),before);
 const performance={beats:256,barBeats:4,rows:[]};assert.deepEqual(notationRows({song,performance,form:result,continuous:true,measureWidth:100}),[{start:0,end:256,style:{width:6400}}]);
});

function synthetic(unit){
 const pattern='AABAAABA',rows=[...pattern].map((letter,i)=>({startBar:i*unit,bars:unit,keys:[{root:'C',start:0,end:unit}],bricks:[],joins:[],chords:(letter==='A'?['Dm7','G7','CM7']:['C7','E7','Gm7']).map((symbol,j)=>({symbol,start:j*unit/3,end:(j+1)*unit/3}))}));
 return {index:999,title:'Fixture',tonic:['C','Major'],meter:[4,4],bars:unit*8,columns:unit,rows};
}
test('the same inner rule works at four, eight and sixteen bars and under a constant transposition',()=>{
 for(const unit of [4,8,16]){
  const song=synthetic(unit),result=alignRepeatedSubphrases(song,analyzeForm(song));assert.equal(result.layoutBasis,'inner-aaba');assert.equal(result.layoutPhraseBars,unit);assert.equal(result.layoutEvidence.pattern,'AABAAABA');assert.ok(Math.abs(result.layoutEvidence.minimumScore-1)<1e-7);
  const transposed=structuredClone(song);for(const row of transposed.rows)for(const chord of row.chords)chord.symbol=transposeChord(chord.symbol,'Bb');assert.deepEqual(shape(alignRepeatedSubphrases(transposed,analyzeForm(transposed))),shape(result));
 }
});
test('a shared opening alone, no contrast, incomplete source, or an authored measure map cannot establish an inner AABA',()=>{
 const source=synthetic(8);
 for(const change of [
  s=>s.rows.forEach(row=>row.chords.forEach(c=>{c.symbol='CM7';})),
  s=>{s.rows[1].chords[1].symbol='F#7';s.rows[1].chords[2].symbol='F#7';},
  s=>{s.rows[1].chords[1].start+=.25;},
  s=>{s.rows[1].chords[1].clipped=true;},
  s=>{s.measureMap=[{start:0,duration:1,sourceNumber:'0'}];},
 ]){const song=structuredClone(source);change(song);assert.notEqual(alignRepeatedSubphrases(song,analyzeForm(song)).layoutBasis,'inner-aaba');}
 const uniform=structuredClone(source);uniform.rows.forEach(row=>{row.chords=structuredClone(source.rows[0].chords);});assert.notEqual(alignRepeatedSubphrases(uniform,analyzeForm(uniform)).layoutBasis,'inner-aaba');
});
test('all affected arrangements retain chronological coverage, every chord span and formal grouping',()=>{
 const hits=[];for(const song of songs){const form=analyzeForm(song),before=JSON.stringify(song),result=alignRepeatedSubphrases(song,form);assert.equal(JSON.stringify(song),before);assert.deepEqual(result.sections,form.sections);assert.equal(result.family,form.family);assert.equal(result.pattern,form.pattern);if(result.layoutBasis!=='inner-aaba')continue;hits.push(song.index);
  const sections=result.layoutSections;assert.equal(sections[0].start,0);assert.equal(sections.at(-1).end,song.bars);for(let i=1;i<sections.length;i++)assert.equal(sections[i-1].end,sections[i].start);
  for(const chord of chordTimeline(song)){const pieces=sections.map(s=>[Math.max(s.start,chord.start),Math.min(s.end,chord.end)]).filter(([a,b])=>b>a);assert.equal(pieces[0][0],chord.start);assert.equal(pieces.at(-1)[1],chord.end);assert.ok(Math.abs(pieces.reduce((n,[a,b])=>n+b-a,0)-(chord.end-chord.start))<1e-7);}
 }
 assert.deepEqual(hits.filter(index=>index<507),[303,313,320,369,373,375,386,392,397,475]);
});
