import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {phraseGrid} from '../src/music/phrases.mjs';
import {analyzeForm} from '../src/music/forms.mjs';
import {alignRepeatedSubphrases} from '../src/music/section-layout.mjs';
const original=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8')).songs;
const chart=(bars=12,meter=[4,4])=>({index:999,title:'Fixture',bars,meter,rows:[]});

test('default phrases are every four measures in absolute quarter beats, with closure kept separate',()=>{
 const grid=phraseGrid(chart(12));assert.deepEqual(grid.starts,[0,16,32]);assert.equal(grid.end,48);assert.equal(grid.closesAtEnd,true);assert.equal(grid.basis,'four-bar-default');assert.deepEqual(grid.exceptions,[]);
 assert.deepEqual(phraseGrid(chart(12,[3,4])).starts,[0,12,24]);assert.deepEqual(phraseGrid(chart(12,[6,8])).starts,[0,12,24]);
 const odd=phraseGrid(chart(10,[5,4]));assert.deepEqual(odd.starts,[0,20,40]);assert.equal(odd.end,50);assert.equal(odd.closesAtEnd,false);assert.deepEqual(odd.exceptions,[]);assert.equal(odd.uncertainty[0].kind,'unproven-final-remainder');
 assert.throws(()=>phraseGrid(chart(0)));assert.throws(()=>phraseGrid(chart(12,[0,4])));
});

test('House follows audited ten-plus-ten-plus-eight-plus-ten with four-plus-four-plus-two extensions',()=>{
 const song=original[80],form=analyzeForm(song),before=JSON.stringify({song,form}),grid=phraseGrid(song,form);
 assert.deepEqual(grid.starts.map(b=>b/4),[0,4,8,10,14,18,20,24,28,32,36]);assert.equal(grid.end,152);assert.equal(grid.closesAtEnd,true);assert.equal(grid.basis,'source-audited-sections');
 assert.deepEqual(grid.exceptions.map(e=>e.phraseBars),[[4,4,2],[4,4,2],[4,4,2]]);assert.ok(grid.exceptions.every(e=>e.source.includes('HouseIsNotAHome.ls')));assert.equal(JSON.stringify({song,form}),before);
 const unverified=phraseGrid(song,{...form,basis:'harmonic-comparison'});assert.deepEqual(unverified.starts.map(b=>b/4),[0,4,8,12,16,20,24,28,32,36]);assert.equal(unverified.closesAtEnd,false);
});

test('audited expanded Blue and Sentimental ending changes closure without inventing shifted starts',()=>{
 const song=original[20],grid=phraseGrid(song,analyzeForm(song));assert.deepEqual(grid.starts.map(b=>b/4),[0,4,8,12,16]);assert.equal(grid.end,72);assert.equal(grid.closesAtEnd,true);assert.deepEqual(grid.exceptions[0].phraseBars,[4,2]);
});

test('display phrase grouping, local modulations and brick boundaries do not redefine hypermeter',()=>{
 const love=original[124],form=alignRepeatedSubphrases(love,analyzeForm(love)),grid=phraseGrid(love,form);assert.equal(form.layoutPhraseBars,16);assert.deepEqual(grid.starts.map(b=>b/4),[0,4,8,12,16,20,24,28,32,36,40,44]);
 const song=structuredClone(original[0]);for(const row of song.rows){row.joins.push({at:1,from:'C',to:'D',delta:2,name:'Modulation'});row.bricks.push({start:1,end:3,name:'Fixture'});}
 assert.deepEqual(phraseGrid(song,analyzeForm(song)).starts,[0,16,32,48,64,80,96,112]);
});

test('verified identical-arrangement source may establish three-bar or shifted phrases without an end label',()=>{
 const song=chart(),evidence={starts:[0,12,24,36,48],timeUnit:'quarter-note',verified:true,arrangementMatch:'exact',bars:12,meter:[4,4],source:{url:'https://rawl.rocks/s/hypermeter/'},closesAtEnd:true},before=JSON.stringify(evidence),grid=phraseGrid(song,null,evidence);
 assert.deepEqual(grid.starts,[0,12,24,36]);assert.equal(grid.closesAtEnd,true);assert.equal(grid.basis,'verified-source');assert.deepEqual(grid.exceptions.map(e=>e.bars),[3,3,3,3]);assert.equal(JSON.stringify(evidence),before);
 const shifted=phraseGrid(chart(),null,{...evidence,starts:[0,4,20,36],closesAtEnd:false});assert.deepEqual(shifted.starts,[0,4,20,36]);assert.equal(shifted.closesAtEnd,false);
});

test('unverified, mismatched, invalid or ambiguous-unit rendition evidence never transfers to the chart',()=>{
 const song=chart(),base={starts:[0,12,24,36],timeUnit:'quarter-note',verified:true,arrangementMatch:'exact',bars:12,meter:[4,4],source:{id:'fixture'}};
 for(const change of [{verified:false},{arrangementMatch:'different'},{timeUnit:'measure'},{bars:16},{meter:[3,4]},{source:null},{starts:[0,0,16]},{starts:[0,60]},{starts:[12,24]},{starts:[0,NaN]}]){const grid=phraseGrid(song,null,{...base,...change});assert.deepEqual(grid.starts,[0,16,32]);assert.equal(grid.basis,'four-bar-default');assert.ok(grid.uncertainty.some(u=>u.kind==='source-evidence-rejected'));}
 const references=[{standardIndex:0,midiId:'fixture',analysisKey:'f/fixture',phraseStarts:[1,4,7,10],alignment:{status:'unverified',safeToCopy:false}}],grid=phraseGrid(song,null,{references});assert.deepEqual(grid.starts,[0,16,32]);assert.equal(grid.uncertainty[0].kind,'rendition-references');assert.equal(grid.uncertainty[0].references[0].midiId,'fixture');assert.deepEqual(phraseGrid(song,null,{references:[]}).uncertainty,[]);
});

test('every original and imported chart receives a complete stable grid without musical or layout mutation',()=>{
 const file=new URL('../dist/data/additional-standards.json',import.meta.url),additional=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).songs:[];let audited=0;
 for(const song of [...original,...additional]){
  const form=alignRepeatedSubphrases(song,analyzeForm(song)),before=JSON.stringify({song,form}),grid=phraseGrid(song,form);assert.equal(JSON.stringify({song,form}),before);assert.equal(grid.starts[0],song.pickupBeats??0);assert.equal(grid.end,song.bars*song.meter[0]*4/song.meter[1]);assert.ok(grid.starts.every((beat,i)=>beat>=0&&beat<grid.end&&(!i||beat>grid.starts[i-1])));
  if(grid.basis==='source-audited-sections')audited++;else if(song.measureMap)assert.deepEqual(grid.starts,song.measureMap.filter(m=>Number(m.sourceNumber)>0).filter((_,i)=>i%4===0).map(m=>m.start));else for(let i=1;i<grid.starts.length;i++)assert.equal(grid.starts[i]-grid.starts[i-1],song.meter[0]*4/song.meter[1]*4);
 }
 assert.equal(audited,2);
});
