import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {realizeSong,parseChord} from '../src/music/realization.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const {qualities,spellings}=read('../src/music/chord-vocabulary.json');
function realize(symbols){
 const song={index:0,title:'Fixture',tonic:['C','Major'],meter:[4,4],bars:symbols.length,rows:[{startBar:0,bars:symbols.length,keys:[{start:0,end:symbols.length,root:'C',mode:'Major'}],joins:[],chords:symbols.map((symbol,i)=>({symbol,start:i,end:i+1}))}]};
 return realizeSong(song,qualities);
}

test('extensions stay above the seventh while altered fifths and suspensions stay in the core',()=>{
 const symbols=['C9','C11','C13','C7b9','C7#9','C7#11','C7b13','C7b5','Cm9b5','C13sus4','CM7add13','C7add6'];
 assert.deepEqual(realize(symbols).chords.map(c=>c.pitches),[
  [48,52,55,58,62],[48,55,58,62,65],[48,52,55,58,62,69],
  [48,52,55,58,61],[48,52,55,58,63],[48,52,55,58,66],
  [48,52,58,68],[48,52,54,58],[48,51,54,58,62],
  [48,53,55,58,62,69],[48,52,55,59,62,69],[48,52,55,57,58]
 ]);
 assert.ok(qualities['7alt'].includes(15));assert.ok(qualities.phryg.includes(13));assert.ok(qualities['7#4'].includes(18));
 assert.ok(qualities['6b5'].includes(6));assert.ok(!qualities['6b5'].includes(18));
 assert.deepEqual(qualities.add2,[0,2,4,7]);assert.deepEqual(qualities.add9no3,[0,7,14]);
});

test('explicit slash bass is below the complete root-starting chord in the same simultaneous voice',()=>{
 const p=realize(['G7/C','C/E','G7/B','G7/G','C9/Bb']);
 assert.deepEqual(p.chords.map(c=>c.pitches),[
  [48,55,59,62,65],[40,48,52,55],[47,55,59,62,65],[43,55,59,62,65],[46,48,52,55,58,62]
 ]);
 for(const c of p.chords){const notes=p.notes.filter(n=>n.chord===c.id);assert.equal(notes.length,c.pitches.length);assert.ok(notes.every(n=>n.voice===0&&n.start===c.start&&n.duration===c.end-c.start));}
 const repeated=realize(['C13','G7/C','B7b9','C13']);assert.deepEqual(repeated.chords[0].pitches,repeated.chords[3].pitches);
});

test('register-aware vocabulary retains exactly the declared source pitch classes',()=>{
 const natural={c:0,d:2,e:4,f:5,g:7,a:9,b:11},mod=n=>(n%12+12)%12;
 assert.equal(Object.keys(qualities).length,232);
 for(const [quality,intervals] of Object.entries(qualities)){
  const expected=spellings[quality].map(s=>{const [,letter,acc]=/^([a-g])([b#]*)/.exec(s);return mod(natural[letter]+[...acc].reduce((n,a)=>n+(a==='#'?1:-1),0));});
  assert.deepEqual([...new Set(intervals.map(mod))].sort((a,b)=>a-b),[...new Set(expected)].sort((a,b)=>a-b),quality);
  assert.deepEqual(intervals,[...new Set(intervals)].sort((a,b)=>a-b));assert.ok(intervals[0]===0&&intervals.every(i=>i>=0&&i<36),quality);
 }
});

test('all standards retain source timing and complete compound-interval cores',()=>{
 const {songs}=read('../dist/data/roadmaps.json');let count=0;
 for(const song of songs){const p=realizeSong(song,qualities);count+=p.notes.length;
  for(const c of p.chords){if(c.clipped)continue;const parsed=parseChord(c.symbol,qualities),root=48+parsed.root,core=[...new Set([0,...parsed.intervals])].sort((a,b)=>a-b).map(i=>root+i);
   assert.deepEqual(c.pitches.slice(parsed.slash?1:0),core,c.symbol);if(parsed.slash){assert.ok(c.pitches[0]<root);assert.equal(c.pitches[0]%12,parsed.bass);}else assert.equal(c.pitches[0],root);
   const notes=p.notes.filter(n=>n.chord===c.id);assert.deepEqual(notes.map(n=>n.pitch),c.pitches);assert.ok(notes.every(n=>n.voice===0&&n.start===c.start&&n.duration===c.end-c.start));
  }
 }
 assert.equal(count,43833);
});
