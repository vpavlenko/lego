import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {removeOneChordBricks,removeUnhelpfulBricks} from '../src/music/brick-coverage.mjs';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const {qualities}=read('../src/music/chord-vocabulary.json');
function fixture(symbols,{names=['Fixture'],joins=[],durations=symbols.map(()=>1)}={}){
 let end=0;const chords=symbols.map((symbol,i)=>{const start=end;end+=durations[i];return {symbol,start,end};});
 return {index:0,title:'Fixture',tonic:['C','Major'],meter:[4,4],bars:end,columns:end,bricks:names,notes:[{pitch:60,start:0,duration:1,voice:1}],rows:[{startBar:0,bars:end,keys:[{start:0,end,root:'C',mode:'Major'}],chords,bricks:names.map(name=>({name,start:0,end})),joins}]};
}
function splitRows(left,right,{names=['Fixture Cadence','Fixture Approach'],join=false}={}){
 const song=fixture([left],{names:[names[0]]});song.bars=2;
 song.rows.push({...fixture([right],{names:[names[1]]}).rows[0],startBar:1});song.bricks=[...new Set(names)].sort((a,b)=>a.localeCompare(b));
 if(join)song.rows[1].joins=[{at:0,from:'C',to:'C',delta:0}];
 return song;
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function withoutBricks(songs){return songs.map(({bricks,rows,...song})=>({...song,rows:rows.map(({bricks,...row})=>row)}));}

test('a held chord and repeated equal harmonies leave empty brick spans without altering source',()=>{
 for(const song of [fixture(['CM7'],{durations:[8]}),fixture(['CM7','Cmaj7','CM7'],{durations:[1,2,1]})]){
  const before=structuredClone(song);freeze(song);const result=removeOneChordBricks([song],qualities);
  assert.deepEqual(song,before);assert.deepEqual(result.songs[0].rows[0].bricks,[]);assert.deepEqual(result.songs[0].bricks,[]);
  assert.deepEqual(result.stats,{rawPassages:1,removedPassages:1,keptPassages:0,rawOccurrences:1,removedOccurrences:1,keptOccurrences:0,reasons:{'single-harmony':{passages:1,occurrences:1},'on-off-family':{passages:0,occurrences:0}}});
  assert.equal(result.removed[0].segments[0].row,0);assert.equal(result.removed[0].segments[0].brick,0);assert.equal(result.removed[0].harmonies.length,1);
  assert.deepEqual(withoutBricks(result.songs),withoutBricks([song]));
 }
});

test('quality, compound extension and explicit bass changes keep an occurrence',()=>{
 for(const symbols of [['CM7','C7'],['Cadd2','Cadd9'],['C7b5','C7#11'],['G7/C','G7/D'],['C','C/C'],['CM7','Dm7']]){
  const song=fixture(symbols),result=removeOneChordBricks([song],qualities);
  assert.deepEqual(result.songs,[song],symbols.join(' '));assert.equal(result.stats.removedOccurrences,0);
 }
 // Enharmonic roots and bass spellings represent the same actual harmony.
 const same=removeOneChordBricks([fixture(['C#7/F#','Db7/Gb'])],qualities);assert.equal(same.stats.removedOccurrences,1);
});

test('adjacent row family continuations keep both halves of a real progression',()=>{
 const song=splitRows('Dm7','G7'),result=removeOneChordBricks([song],qualities);
 assert.equal(result.stats.rawOccurrences,1);assert.equal(result.stats.keptPassages,2);assert.deepEqual(result.songs,[song]);
 const held=removeOneChordBricks([splitRows('CM7','Cmaj7')],qualities);
 assert.equal(held.stats.removedOccurrences,1);assert.equal(held.stats.removedPassages,2);
 assert.deepEqual(held.removed[0].segments.map(s=>[s.row,s.brick,s.label]),[[0,0,'Fixture Cadence'],[1,0,'Fixture Approach']]);
 assert.ok(held.songs[0].rows.every(row=>row.bricks.length===0));
});

test('a join including zero separates occurrences; same-row neighbors never continue',()=>{
 const song=splitRows('Dm7','G7',{join:true}),result=removeOneChordBricks([song],qualities);
 assert.equal(result.stats.rawOccurrences,2);assert.equal(result.stats.removedOccurrences,2);assert.equal(result.stats.keptPassages,0);
 assert.deepEqual(result.songs[0].rows[1].joins,song.rows[1].joins);
 const sameRow=fixture(['Dm7','G7']);sameRow.rows[0].bricks=[{name:'Fixture',start:0,end:1},{name:'Fixture',start:1,end:2}];
 assert.equal(removeOneChordBricks([sameRow],qualities).stats.removedOccurrences,2);
 const nonadjacent=splitRows('Dm7','G7');nonadjacent.rows.splice(1,0,{startBar:1,bars:1,keys:[],chords:[],bricks:[],joins:[]});nonadjacent.rows[2].startBar=2;nonadjacent.bars=3;
 assert.equal(removeOneChordBricks([nonadjacent],qualities).stats.removedOccurrences,2);
});

test('unknown and clipped harmonies compare exact source symbols rather than guessed pitches',()=>{
 for(const symbols of [['G7…'],['Cunknown','Cunknown'],['CM7','CM7']]){
  const song=fixture(symbols);if(symbols[0]==='CM7')song.rows[0].chords.forEach(c=>c.clipped=true);
  const result=removeOneChordBricks([song],qualities);assert.equal(result.stats.removedOccurrences,1);
  assert.ok('unknown' in result.removed[0].harmonies[0]);
 }
 for(const symbols of [['Cunknown','Dunknown'],['G7…','G7'],['C','CM7']])assert.equal(removeOneChordBricks([fixture(symbols)],qualities).stats.removedOccurrences,0);
 const noChords=fixture([]);assert.equal(removeOneChordBricks([noChords],qualities).stats.removedOccurrences,0);
});

test('harmonies are counted only where their sounding spans overlap the complete occurrence',()=>{
 const song=fixture(['Dm7','G7','CM7']);song.rows[0].bricks=[{name:'Fixture',start:.5,end:1.5},{name:'Other',start:2.25,end:2.75}];song.bricks=['Fixture','Other'];
 const result=removeOneChordBricks([song],qualities);assert.deepEqual(result.songs[0].bricks,['Fixture']);assert.equal(result.removed[0].brick,'Other');
 assert.deepEqual(result.songs[0].rows[0].bricks,[song.rows[0].bricks[0]]);
});

test('all On/Off and Off/On families are removed even when they contain full progressions',()=>{
 const names=['On Off Major IV','Off On Minor bil','On Off Four Times On To II','On Off On +Dropback IV Major','On Off On Twice Minor V','On Off Thrice To IV','On Off Twice To V','On-Off Minor #1V','Off—On Major Nowhere','  On   Off\tMinor V','On/Off Major bVII'];
 for(const name of names){
  const song=fixture(['Dm7','G7','CM7'],{names:[name]}),result=removeUnhelpfulBricks([song],qualities);
  assert.equal(result.stats.removedPassages,1,name);assert.deepEqual(result.songs[0].rows[0].bricks,[]);assert.deepEqual(result.songs[0].bricks,[]);
  assert.equal(result.removed[0].reason,'on-off-family');assert.equal(result.removed[0].harmonies.length,3);assert.deepEqual(withoutBricks(result.songs),withoutBricks([song]));
  assert.deepEqual(result.stats.reasons,{'single-harmony':{passages:0,occurrences:0},'on-off-family':{passages:1,occurrences:1}});
 }
 assert.equal(removeOneChordBricks,removeUnhelpfulBricks);
 const bothRules=removeUnhelpfulBricks([fixture(['CM7'],{names:['On Off Major IV']})],qualities);assert.equal(bothRules.removed[0].reason,'on-off-family');
 for(const name of ['Onward Cadence','Off Onward','On Offbeat','Fixture with On Off','On'])assert.equal(removeUnhelpfulBricks([fixture(['Dm7','G7'],{names:[name]})],qualities).stats.removedPassages,0,name);
 const continuation=removeUnhelpfulBricks([splitRows('Dm7','G7',{names:['On Off Major IV Cadence','On Off Major IV Approach']})],qualities);
 assert.equal(continuation.stats.rawOccurrences,1);assert.equal(continuation.stats.removedPassages,2);assert.equal(continuation.removed[0].segments.length,2);
});

test('the full original and additional corpus keeps all chords, notes, keys, joins and metadata unchanged',()=>{
 const songs=[...read('../dist/data/roadmaps.json').songs,...read('../dist/data/additional-standards.json').songs],before=structuredClone(songs);freeze(songs);
 const {songs:projected,stats,removed}=removeOneChordBricks(songs,qualities);
 assert.deepEqual(songs,before);assert.deepEqual(withoutBricks(projected),withoutBricks(songs));
 assert.equal(stats.rawPassages,songs.flatMap(s=>s.rows).reduce((n,r)=>n+r.bricks.length,0));
 assert.equal(stats.rawPassages,stats.removedPassages+stats.keptPassages);assert.equal(stats.rawOccurrences,stats.removedOccurrences+stats.keptOccurrences);
 assert.equal(stats.removedPassages,removed.reduce((n,o)=>n+o.segments.length,0));assert.ok(stats.removedOccurrences>0);assert.ok(stats.keptOccurrences>0);
 assert.equal(stats.reasons['single-harmony'].passages+stats.reasons['on-off-family'].passages,stats.removedPassages);
 assert.equal(stats.reasons['single-harmony'].occurrences+stats.reasons['on-off-family'].occurrences,stats.removedOccurrences);
 const positions=new Set();for(const occurrence of removed){if(occurrence.reason==='single-harmony')assert.equal(occurrence.harmonies.length,1);else assert.equal(occurrence.reason,'on-off-family');for(const segment of occurrence.segments){
  const song=songs.find(s=>s.index===occurrence.song),span=song.rows[segment.row].bricks[segment.brick],id=[occurrence.song,segment.row,segment.brick].join(':');
  assert.ok(!positions.has(id));positions.add(id);assert.equal(span.name,segment.label);assert.equal(span.start,segment.start);assert.equal(span.end,segment.end);
 }}
 projected.forEach((song,i)=>{
  assert.deepEqual(song.bricks,[...new Set(song.rows.flatMap(r=>r.bricks.map(b=>b.name)))].sort((a,b)=>a.localeCompare(b)));
  assert.ok(!song.bricks.some(name=>/^(?:On Off|Off On)\b/i.test(name.replace(/[-‐‑‒–—−/]+/g,' ').replace(/\s+/g,' ').trim())));
  song.rows.forEach((row,ri)=>assert.deepEqual(row.bricks,songs[i].rows[ri].bricks.filter((_,bi)=>!positions.has([song.index,ri,bi].join(':')))));
 });
});
