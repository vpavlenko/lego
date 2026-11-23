import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanModulationRegions,reviewDisplayModulationOnsets} from '../src/music/modulation-regions.mjs';
import {songModulations} from '../src/music/modulations.mjs';
import {tonicAt} from '../packages/rawl-notation/src/geometry.mjs';
import {transposeChord,pitch} from '../dist/harmony.mjs';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const vocabulary=read('../src/music/chord-vocabulary.json');
function fixture(symbols,durations=symbols.map(()=>1),mode='Major'){
 let cursor=0;const chords=symbols.map((symbol,i)=>{const start=cursor;cursor+=durations[i];return {symbol,start:start/4,end:cursor/4};});
 return {index:0,title:'Fixture',tonic:['C',mode],meter:[4,4],bars:cursor/4,notes:[{pitch:60,start:0,duration:1}],rows:[{startBar:0,bars:cursor/4,chords,keys:[],bricks:[],joins:[]}]};
}
const change=(beat,root,mode='Major')=>({beat,root,tonic:pitch(root),mode});
const clean=(song,changes)=>cleanModulationRegions(song,changes,vocabulary);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('initial C stays the home anchor and an isolated minor iv folds into C minor',()=>{
 const song=fixture(['Cm7','Fm7','Dm7b5','G7','Cm'],[2,2,1,1,2],'Minor'),changes=[change(0,'C','Minor'),change(2,'F','Minor'),change(4,'C','Minor')];
 const result=clean(song,changes);assert.deepEqual(result.changes,[changes[0]]);assert.equal(result.stats.homeSingletonRegions,1);assert.equal(result.stats.mergedOneHarmonyRegions,1);
 assert.equal(result.decisions.find(d=>d.start===2).tonic,0);assert.equal(result.decisions.find(d=>d.start===0).reason,'initial-home-context');
 assert.equal(result.stats.remainingOneHarmonyModulations,0);
});

test('a dominant resolving to the next tonic merges forwards, with its analytical boundary moved',()=>{
 const song=fixture(['C','Dm7','G7','D7','G','Am7','D7']),changes=[change(0,'C'),{...change(3,'A'),join:true,name:'Source',from:'C',sourceDelta:-3},{...change(4,'G'),join:true,name:'Later',from:'A',sourceDelta:-2}];
 const result=clean(song,changes),decision=result.decisions.find(d=>d.start===3);
 assert.equal(decision.direction,'next');assert.equal(decision.tonic,7);assert.ok(decision.candidates[1].components.find(c=>c.rule==='cadential-context').score>0);
 assert.deepEqual(result.changes.map(c=>[c.beat,c.tonic]),[[0,0],[3,7]]);assert.equal(result.changes[1].sourceBeat,4);
 assert.equal(result.changes[1].join,undefined);assert.equal(result.changes[1].name,undefined);
 assert.equal(result.stats.remainingOneHarmonyModulations,0);
});

test('a preceding-key dominant and a terminal singleton retain the established previous context',()=>{
 const song=fixture(['C','Dm7','C','G7','F','Gm7','C7','F7']),changes=[change(0,'C'),change(3,'A'),change(4,'F'),change(7,'Bb')];
 const result=clean(song,changes);assert.equal(result.decisions.find(d=>d.start===3).direction,'previous');
 assert.equal(result.decisions.find(d=>d.start===7).reason,'terminal-context');assert.equal(result.decisions.find(d=>d.start===7).tonic,5);
 assert.deepEqual(result.changes.map(c=>[c.beat,c.tonic]),[[0,0],[4,5]]);
});

test('singleton chains use one globally scored cut rather than a greedy first merge',()=>{
 const song=fixture(['C','Dm7','G7','E7','D7','G','Am7','D7']),changes=[change(0,'C'),change(3,'A'),change(4,'B'),change(5,'G')],result=clean(song,changes);
 const decisions=result.decisions.filter(d=>d.direction!=='home');assert.deepEqual(decisions.map(d=>[d.start,d.direction,d.tonic]),[[3,'previous',0],[4,'next',7]]);
 assert.ok(decisions.every(d=>d.run.start===3&&d.run.end===5&&d.run.cut===1));assert.deepEqual(result.changes.map(c=>[c.beat,c.tonic]),[[0,0],[4,7]]);
 assert.equal(result.stats.remainingOneHarmonyModulations,0);
});

test('actual harmony identity includes quality, explicit bass and compound extension register',()=>{
 for(const pair of [['C','C7'],['G7/C','G7/D'],['C','C/C'],['Cadd2','Cadd9'],['C7b5','C7#11']]){
  const result=clean(fixture(['C','Dm7',...pair,'F','Gm7']),[change(0,'C'),change(2,'G'),change(4,'F')]);
  assert.equal(result.stats.oneHarmonyRegions,0,pair.join(' '));assert.equal(result.changes.length,3);
 }
 const repeated=clean(fixture(['C','Dm7','CM7','Cmaj7','F','Gm7']),[change(0,'C'),change(2,'G'),change(4,'F')]);
 assert.equal(repeated.stats.oneHarmonyRegions,1);assert.equal(repeated.stats.mergedOneHarmonyRegions,1);
});

test('zero-shift boundaries coalesce without changing source data or strict note-midpoint semantics',()=>{
 const song=fixture(['C','Dm7','G7','C']),changes=[change(0,'C'),{...change(1,'C'),join:true,name:'Homer'},change(2,'G')],before=structuredClone({song,changes});freeze(song);freeze(changes);
 const result=clean(song,changes);assert.deepEqual({song,changes},before);assert.equal(result.stats.sameTonicBoundaries,1);assert.equal(result.stats.oneHarmonyRegions,0);
 assert.equal(tonicAt(0,result.changes,2),0);assert.equal(tonicAt(0,result.changes,2+1e-8),7);
});

test('initial non-C singleton compares the next context against global C without transposing music',()=>{
 const song=fixture(['Bbm7','Bbm7/Ab','Gm7b5','C7','Fm7'],undefined,'Minor'),before=structuredClone(song),result=clean(song,[change(0,'Bb','Minor'),change(1,'F','Minor')]);
 assert.equal(result.decisions[0].direction,'next');assert.equal(result.changes[0].beat,0);assert.equal(result.changes[0].tonic,5);assert.deepEqual(song,before);
 assert.equal(result.decisions[0].candidates[0].components.find(c=>c.rule==='home-C-prior').score,1.5);
 const allSingle=clean(fixture(['C','F','G']),[change(0,'C'),change(1,'F'),change(2,'G')]);assert.deepEqual(allSingle.changes,[change(0,'C')]);
 const onlyOne=clean(fixture(['CM7'],[8]),[change(0,'C')]);assert.deepEqual(onlyOne.changes,[change(0,'C')]);assert.equal(onlyOne.stats.mergedOneHarmonyRegions,0);
});

test('harmonic ownership decisions are invariant under source-key transposition',()=>{
 const source=fixture(['C','Dm7','G7','D7','G','Am7','D7']),transposed=structuredClone(source);transposed.tonic=['D','Major'];transposed.rows[0].chords.forEach(c=>{c.symbol=transposeChord(c.symbol,'Bb');});
 const changes=[change(0,'C'),change(3,'A'),change(4,'G')],a=clean(source,changes),b=clean(transposed,changes);
 assert.deepEqual(a.changes,b.changes);assert.deepEqual(a.decisions.map(d=>[d.direction,d.tonic,d.harmonies,d.candidates]),b.decisions.map(d=>[d.direction,d.tonic,d.harmonies,d.candidates]));
});

test('reviewed source cases use phrase resolution and guarded composition/harmony matches',()=>{
 const originals=read('../dist/data/roadmaps.json').songs,additional=read('../dist/data/additional-standards.json').songs;
 for(const [title,beat,direction,tonic]of [['Chelsea Bridge',63,'next',6],['Lullaby of Birdland',42,'next',3],['Out of Nowhere',108,'next',0],["They Can't Take That Away from Me",12,'next',5],['Thunderbirds (theme)',108,'next',0],['Dear Old Stockholm',32,'previous',0],['Darn that dream',11,'previous',9],['In a sentimental mood',124,'next',0],['Just the way you are',308,'next',10],['I Should Care',111,'next',0]]){
  const candidates=[...originals,...additional].filter(s=>s.title===title);if(!candidates.length)continue;
  const song=candidates.find(s=>clean(s,songModulations(s)).decisions.some(d=>d.start===beat&&d.review));assert.ok(song,title);
  const decision=clean(song,songModulations(song)).decisions.find(d=>d.start===beat);
  assert.equal(decision?.direction,direction,title);assert.equal(decision?.tonic,tonic,title);assert.equal(decision?.reason,'reviewed-phrase-context',title);assert.ok(decision.review.rationale.length>20);
  // Renaming another arrangement or changing its immediate harmony must not
  // trigger a known-source override based only on a reused beat or index.
  const renamed={...song,title:'Different composition'},ordinary=clean(renamed,songModulations(renamed)).decisions.find(d=>d.start===beat);assert.ok(!ordinary?.review,title);
  const changed=structuredClone(song),barBeats=song.meter[0]*4/song.meter[1],previous=changed.rows.flatMap(r=>r.chords.map(c=>({cell:c,start:(r.startBar+c.start)*barBeats}))).filter(c=>c.start<beat-1e-7).at(-1);previous.cell.symbol='NC';
  assert.ok(!clean(changed,songModulations(changed)).decisions.find(d=>d.start===beat)?.review,title);
 }
});

test('every supplied source chart keeps all musical data and has no singleton modulation after cleanup',()=>{
 const songs=[...read('../dist/data/roadmaps.json').songs,...read('../dist/data/additional-standards.json').songs],before=structuredClone(songs);freeze(songs);
 let absorbed=0,forward=0,backward=0;
 for(const song of songs){
  const changes=songModulations(song),originalChanges=structuredClone(changes);freeze(changes);const result=clean(song,changes);
  assert.deepEqual(changes,originalChanges);assert.equal(result.stats.remainingOneHarmonyModulations,0,song.title);
  if(changes[0]?.tonic===0)assert.equal(result.changes[0].tonic,0,song.title);
  assert.ok(result.changes.every((c,i)=>i===0?c.beat===0:c.beat>result.changes[i-1].beat&&c.tonic!==result.changes[i-1].tonic));
  for(const event of result.changes)assert.equal(pitch(event.root),event.tonic,song.title);
  for(const decision of result.decisions.filter(d=>d.direction!=='home')){assert.equal(decision.harmonies.length,1);assert.ok(decision.candidates.some(c=>c.tonic===decision.tonic));assert.ok(decision.reason);}
  // A second pass must not discover new singleton modulations or change the map.
  assert.deepEqual(clean(song,result.changes).changes,result.changes,song.title);
  absorbed+=result.stats.mergedOneHarmonyRegions;forward+=result.decisions.filter(d=>d.direction==='next').length;backward+=result.decisions.filter(d=>d.direction==='previous').length;
 }
 assert.deepEqual(songs,before);assert.ok(absorbed>0&&forward>0&&backward>0);
});

test('reviewed slash-bass approaches start the incoming cadence at the next barline',()=>{
 const standards=read('../dist/data/standards.json').songs;
 const stored=read('../dist/data/modulations.json').changes;
 for(const [index,tonic,moves] of [
  [28,9,[[18,20],[50,52],[114,116]]],
  [45,4,[[102,104,104]]],
  [110,9,[[82,84]]],
  [147,9,[[102,104]]],
  [149,9,[[50,52],[114,116]]],
  [231,5,[[2,4],[34,36],[98,100]]],
 ]){
  const song=standards[index],source=freeze(songModulations(song)),projection=freeze(clean(song,source));
  const reviewed=reviewDisplayModulationOnsets(song,source,projection,vocabulary);
  assert.deepEqual(reviewed.onsetReviews.map(({sourceBeat,beat})=>[sourceBeat,beat]),moves.map(([before,after,from=before])=>[from,after]));
  assert.deepEqual(reviewed.changes,stored[index]);
  for(const [before,after,from=before] of moves){
   assert.ok(source.some(event=>event.beat===from&&event.tonic===tonic));
   assert.ok(reviewed.changes.some(event=>event.beat===after&&event.tonic===tonic&&event.sourceBeat===from));
   assert.ok(!reviewed.changes.some(event=>event.beat===before));
  }
  assert.deepEqual(reviewed.changes.filter(event=>event.join),projection.changes.filter(event=>event.join));
  if(index===231)assert.deepEqual(reviewed.changes[0],source[0]);
 }
});
