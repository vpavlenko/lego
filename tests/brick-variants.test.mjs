import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBrickIndex} from '../src/music/bricks.mjs';
import {buildBrickVariants,buildBrickVariantIndex,collectBrickOccurrences} from '../src/music/brick-variants.mjs';
import {realizeSong} from '../src/music/realization.mjs';
const vocabulary=JSON.parse(fs.readFileSync(new URL('../src/music/chord-vocabulary.json',import.meta.url),'utf8'));
function song(index,symbols,durations,{root='C',mode='Major',name='Fixture',partialStart=false,partialEnd=false,clipped=[]}={}){
 let cursor=0;const chords=symbols.map((symbol,i)=>{const start=cursor;cursor+=durations[i];return {symbol,start,end:cursor,...(clipped.includes(i)?{clipped:true}:{})};});
 return {index,title:'Song '+index,tonic:[root,mode],meter:[4,4],bars:cursor,columns:cursor,rows:[{startBar:0,bars:cursor,keys:[{start:0,end:cursor,root,mode}],bricks:[{start:0,end:cursor,name,...(partialStart?{partialStart:true}:{}),...(partialEnd?{partialEnd:true}:{})}],chords,joins:[]}]};
}
const variants=songs=>buildBrickVariants(buildBrickIndex(songs).bricks.find(b=>b.name==='Fixture'),songs,vocabulary);
const rawCount=entry=>entry.variants.flatMap(v=>v.standards).concat(entry.unresolvedStandards).flatMap(m=>m.passages).reduce((n,p)=>n+p.segments.length,0);

test('uniform scaling, transposition and chord-quality aliases share one definition',()=>{
 const a=song(0,['Dm7','G7','CM7'],[1,1,2]),b=song(1,['G#m7','C#7','F#maj7'],[2,2,4],{root:'F#'}),c=song(2,['Dm7','G7','Cmaj7'],[.25,.25,.5]);
 const entry=variants([a,b,c]);assert.equal(entry.variants.length,1);assert.equal(entry.variants[0].standards.length,3);assert.equal(rawCount(entry),3);
 assert.deepEqual(entry.variants[0].structure.chords.map(c=>c.duration),['1/4','1/4','1/2']);
 const decimals=variants([song(3,['Dm7','G7','CM7'],[.1,.2,.3]),song(4,['Dm7','G7','CM7'],[.2,.4,.6])]);assert.equal(decimals.variants.length,1);
 const reversed=variants([c,b,a]);assert.equal(reversed.variants[0].id,entry.variants[0].id);
});

test('unequal rhythmic proportions, chord quality, explicit bass and extension registers remain distinct',()=>{
 const data=[song(0,['Dm7','G7','CM7'],[1,1,2]),song(1,['Dm7','G7','CM7'],[1,2,1]),song(2,['D7','G7','CM7'],[1,1,2]),song(3,['Dm7','G7/C','CM7'],[1,1,2])];
 assert.equal(variants(data).variants.length,4);
 assert.equal(variants([song(0,['Cadd2'],[1]),song(1,['Cadd9'],[1])]).variants.length,2);
 assert.equal(variants([song(0,['C7b5'],[1]),song(1,['C7#11'],[1])]).variants.length,2);
});

test('local key starts at the excerpt, not at an earlier key-label onset',()=>{
 const a=song(0,['CM7','Dm7','G7','CM7'],[1,1,1,2]);a.rows[0].bricks=[{start:0,end:1,name:'Other'},{start:1,end:5,name:'Fixture'}];
 const b=song(1,['Dm7','G7','CM7'],[1,1,2]);const entry=variants([a,b]);assert.equal(entry.variants.length,1);assert.equal(entry.variants[0].previewSong.rows[0].keys[0].start,0);
});

test('adjacent row continuations concatenate into one complete occurrence and retain both source spans',()=>{
 const a=song(0,['Dm7','G7'],[1,1]);a.bars=4;a.columns=2;a.rows.push({startBar:2,bars:2,keys:[{start:0,end:2,root:'C',mode:'Major'}],bricks:[{start:0,end:2,name:'Fixture'}],chords:[{start:0,end:2,symbol:'CM7'}],joins:[]});
 const b=song(1,['Dm7','G7','CM7'],[1,1,2]);const entry=variants([a,b]);assert.equal(entry.variants.length,1);assert.equal(entry.stats.occurrences,2);assert.equal(entry.stats.continuedOccurrences,1);assert.equal(rawCount(entry),3);
 const passage=entry.variants[0].standards.find(m=>m.song===0).passages[0];assert.equal(passage.segments.length,2);assert.equal(passage.startBar,0);assert.equal(passage.endBar,4);assert.deepEqual(entry.variants[0].previewSong.rows[0].chords.map(c=>c.symbol),['Dm7','G7','CM7']);
});

test('a zero join is a real occurrence boundary even when it is not displayed',()=>{
 const a=song(0,['CM7'],[2]);a.bars=4;a.rows[0].joins=[{at:2,name:'Homer',from:'C',to:'C',delta:0}];a.rows.push({startBar:2,bars:2,keys:[{start:0,end:2,root:'C',mode:'Major'}],bricks:[{start:0,end:2,name:'Fixture'}],chords:[{start:0,end:2,symbol:'CM7'}],joins:[]});
 const brick=buildBrickIndex([a]).bricks[0];assert.equal(collectBrickOccurrences(brick,[a]).length,2);const entry=variants([a]);assert.equal(entry.stats.continuedOccurrences,0);assert.equal(entry.variants.length,1);assert.equal(entry.variants[0].completeOccurrences,2);
});

test('partial passages never create definitions and only attach to a uniquely compatible complete variant',()=>{
 const full=song(0,['Dm7','G7','CM7'],[1,1,2]),tail=song(1,['G7','CM7'],[1,2],{partialStart:true});let entry=variants([full,tail]);assert.equal(entry.variants.length,1);assert.equal(entry.stats.matchedFragments,1);assert.equal(entry.variants[0].partialOccurrences,1);assert.equal(entry.unresolvedStandards.length,0);assert.equal(rawCount(entry),2);
 const alternative=song(2,['Fm7','G7','CM7'],[1,1,2]);entry=variants([full,tail,alternative]);assert.equal(entry.variants.length,2);assert.equal(entry.stats.matchedFragments,0);assert.equal(entry.unresolvedStandards[0].passages[0].candidateVariantIds.length,2);assert.equal(entry.unresolvedStandards[0].passages[0].status,'partial');assert.equal(rawCount(entry),3);
 const noFull=variants([tail]);assert.equal(noFull.variants.length,0);assert.equal(noFull.unresolvedStandards.length,1);
});

test('uncovered source time is not silently compressed into a matching definition',()=>{
 const full=song(0,['Dm7','G7','CM7'],[1,1,2]),gap=song(1,['Dm7','G7','CM7'],[1,1,2]);gap.rows[0].chords[1].start=1.5;
 const entry=variants([full,gap]);assert.equal(entry.variants.length,1);assert.equal(entry.stats.matchedFragments,0);assert.equal(entry.unresolvedStandards[0].passages[0].reason,'uncovered-time');assert.deepEqual(entry.unresolvedStandards[0].passages[0].candidateVariantIds,[]);
});

test('clipped source chords stay unknown rather than becoming wildcard definitions',()=>{
 const full=song(0,['Dm7','G7','CM7'],[1,1,2]),unknown=song(1,['Dm7','G7…','CM7'],[1,1,2],{clipped:[1]}),entry=variants([full,unknown]);assert.equal(entry.variants.length,1);assert.equal(entry.stats.unknownOccurrences,1);assert.equal(entry.unresolvedStandards[0].passages[0].status,'unknown');assert.deepEqual(entry.unresolvedStandards[0].passages[0].candidateVariantIds,[]);assert.equal(rawCount(entry),2);
});

test('every corpus passage is preserved exactly once and every MIDI definition is complete and legible',()=>{
 const {songs}=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8')),bricks=buildBrickIndex(songs).bricks,index=buildBrickVariantIndex(songs,{bricks,vocabulary});
 assert.equal(index.stats.sourcePassages,3452);assert.equal(index.bricks.length,bricks.length);assert.ok(index.stats.continuedOccurrences>0);assert.equal(index.stats.unknownOccurrences,8);
 let all=0;for(const entry of index.bricks){const original=bricks.find(b=>b.slug===entry.slug);assert.equal(rawCount(entry),original.passages);all+=rawCount(entry);
  const sources=new Map();for(const match of original.standards)for(const p of match.passages){const id=[match.song,p.row,p.startBar,p.endBar,p.label].join('|');sources.set(id,(sources.get(id)||0)+1);}
  for(const match of entry.variants.flatMap(v=>v.standards).concat(entry.unresolvedStandards))for(const p of match.passages)for(const segment of p.segments){const id=[match.song,segment.row,segment.startBar,segment.endBar,segment.label].join('|');assert.ok(sources.get(id)>0);sources.set(id,sources.get(id)-1);}
  assert.ok([...sources.values()].every(n=>n===0));assert.equal(new Set(entry.variants.map(v=>v.id)).size,entry.variants.length);
  for(const variant of entry.variants){assert.ok(variant.completeOccurrences>0);assert.ok(variant.previewSong.rows.every(r=>r.chords.every(c=>!c.clipped)));const p=realizeSong(variant.previewSong,vocabulary.qualities);assert.ok(p.notes.length);assert.equal(p.beats,variant.source.end-variant.source.start);assert.equal(p.changes[0].tonic,0);}
 }
 assert.equal(all,3452);
});
