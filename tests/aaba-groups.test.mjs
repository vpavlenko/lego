import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {groupAABA,aabaACoreBricks,aabaBEntryKey} from '../src/music/aaba-groups.mjs';
import {buildBrickIndex} from '../src/music/bricks.mjs';
import {buildLearnerBrickIndex} from '../src/music/brick-families.mjs';
import {analyzeForm} from '../src/music/forms.mjs';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const songs=read('../dist/data/roadmaps.json').songs,forms=songs.map(analyzeForm),bricks=buildLearnerBrickIndex(buildBrickIndex(songs)).bricks,brickMap=new Map(bricks.flatMap(brick=>[brick.name,...brick.aliases].map(name=>[name,brick])));
const digest=groups=>groups.map(g=>({key:g.key,label:g.label,degree:g.degree,songs:g.songs.map(s=>s.index)}));

test('B-key partitions all 101 original AABA standards exactly once with current source-derived group counts',()=>{
 const groups=groupAABA(songs,forms,brickMap),members=groups.flatMap(g=>g.songs),expected=songs.filter(s=>forms[s.index].family==='AABA');
 assert.equal(expected.length,101);assert.equal(groups.length,17);assert.equal(members.length,101);assert.equal(new Set(members.map(s=>s.index)).size,101);assert.deepEqual(members.map(s=>s.index).sort((a,b)=>a-b),expected.map(s=>s.index));
 assert.deepEqual(groups.slice(0,6).map(g=>[g.label,g.degree,g.songs.length]),[['I major',0,29],['IV major',5,27],['vi minor',9,7],['♭VI major',8,6],['♭III major',3,5],['III major',4,5]]);
 assert.equal(groups.find(g=>g.songs.some(s=>s.index===73)).label,'♭II major');assert.equal(groups.find(g=>g.songs.some(s=>s.index===73)).songs.length,3);assert.equal(groups.find(g=>g.songs.some(s=>s.index===80)).label,'I major');assert.equal(groups.find(g=>g.songs.some(s=>s.index===0)).label,'IV major');
 assert.ok(members.every(s=>songs.includes(s)));
});

test('Ipanema source-reviewed 40-bar form groups its complete 16-bar bridge before the exact A return',()=>{
 const form=forms[73];assert.equal(form.basis,'source-audit');assert.equal(form.pattern,'AABA');assert.deepEqual(form.sections.map(s=>[s.start,s.end,s.label]),[[0,8,'A'],[8,16,'A'],[16,32,'B'],[32,40,'A']]);
 assert.equal(aabaBEntryKey(songs[73],form).label,'♭II major');assert.deepEqual(aabaACoreBricks(songs[73],form,brickMap),[{name:'Donna Lee Opening',duration:6,first:0}]);
});

test('B entry uses the covering key area, preserves mode, and never reads a future label or first-chord root as its key',()=>{
 const form={family:'AABA',sections:[{start:0,end:8},{start:8,end:16},{start:16,end:24},{start:24,end:32}]},song={index:0,title:'Fixture',tonic:['Bb','Major'],rows:[{startBar:12,keys:[{start:2,end:6,root:'Eb',mode:'Major'},{start:6,end:8,root:'F',mode:'Major'}],chords:[{start:4,end:5,symbol:'Fm7'}]}]};
 assert.deepEqual(aabaBEntryKey(song,form),{key:'b-key:5:major',label:'IV major',degree:5,mode:'major'});
 song.rows[0].keys[0].root='G';song.rows[0].keys[0].mode='Minor';assert.equal(aabaBEntryKey(song,form).label,'vi minor');assert.equal(aabaBEntryKey(song,form).degree,9);
 song.rows[0].keys=[{start:6,end:8,root:'F',mode:'Major'}];assert.equal(aabaBEntryKey(song,form),null);assert.equal(groupAABA([song],[form],brickMap)[0].label,'Other');assert.equal(groupAABA([song],[form],brickMap)[0].degree,undefined);
});

test('A-brick groups use canonical merged families and cover every AABA without duplicate songs',()=>{
 const groups=groupAABA(songs,forms,brickMap,'a-brick'),members=groups.flatMap(g=>g.songs);
 assert.equal(members.length,101);assert.equal(new Set(members.map(s=>s.index)).size,101);assert.equal(groups.length,23);
 assert.deepEqual(groups.slice(0,5).map(g=>[g.label,g.songs.length]),[['Straight',41],['I (vi/VI7) ii V',10],['I iii VI7',6],['Major On',6],['Cadence',5]]);
 for(const group of groups)for(const song of group.songs){const candidates=aabaACoreBricks(song,forms[song.index],brickMap);assert.ok(group.label==='Other'?!candidates.length:candidates.some(c=>c.name===group.label),song.title);}
 assert.deepEqual(groups.find(g=>g.label==='Donna Lee Opening').songs.map(s=>s.index),[73]);
 const straight=groups.find(g=>g.label==='Straight');assert.ok(straight.songs.some(s=>s.index===80));assert.ok(!groups.some(g=>g.label==='Straight Approach'||g.label==='Straight Launcher'));
});

function fixture(index,brickSpans,title='Song '+index){return{index,title,tonic:['C','Major'],rows:[{startBar:0,bars:8,bricks:brickSpans,keys:[{start:0,end:8,root:'C',mode:'Major'}]}]};}
const aForm={family:'AABA',sections:[{start:0,end:8},{start:8,end:16},{start:16,end:24},{start:24,end:32}]};
const aliases=new Map([['X-short',{name:'X'}],['X',{name:'X'}],['Y',{name:'Y'}]]);
test('representative A brick prefers global document frequency, then actual core duration, then earlier onset and name',()=>{
 const popular=[fixture(0,[{name:'X-short',start:0,end:1},{name:'Y',start:1,end:6}]),fixture(1,[{name:'X',start:0,end:2}]),fixture(2,[{name:'X',start:0,end:2}])];
 assert.equal(groupAABA(popular,[aForm,aForm,aForm],aliases,'a-brick').find(g=>g.songs.includes(popular[0])).label,'X');
 const tied=[fixture(0,[{name:'X-short',start:0,end:1},{name:'Y',start:1,end:6}]),fixture(1,[{name:'X',start:0,end:2},{name:'Y',start:2,end:4}])],groups=groupAABA(tied,[aForm,aForm],aliases,'a-brick');assert.equal(groups.find(g=>g.songs.includes(tied[0])).label,'Y');assert.equal(groups.find(g=>g.songs.includes(tied[1])).label,'X');
 const overlapping=fixture(0,[{name:'Zulu',start:0,end:2},{name:'Alpha',start:0,end:2}]);assert.equal(groupAABA([overlapping],[aForm],new Map(),'a-brick')[0].label,'Alpha');
});

test('A core uses actual row coordinates, clips at 75%, and measures overlapping aliases only once',()=>{
 const song={index:0,title:'Core',rows:[{startBar:0,bricks:[{name:'X-short',start:0,end:2},{name:'X',start:1,end:3}]},{startBar:4,bricks:[{name:'Y',start:0,end:4}]}]};
 assert.deepEqual(aabaACoreBricks(song,aForm,aliases),[{name:'X',duration:3,first:0},{name:'Y',duration:2,first:4}]);
 const noBricks=fixture(0,[]);assert.equal(groupAABA([noBricks],[aForm],aliases,'a-brick')[0].label,'Other');
});

test('both partitions and member order are stable under song permutation and leave inputs untouched',()=>{
 const before=JSON.stringify(songs),mapBefore=[...brickMap.keys()];
 for(const mode of ['b-key','a-brick']){
  const original=groupAABA(songs,forms,brickMap,mode),reversed=groupAABA([...songs].reverse(),forms,brickMap,mode);assert.deepEqual(digest(reversed),digest(original));
  for(const group of original)assert.deepEqual(group.songs.map(s=>s.title),[...group.songs].sort((a,b)=>a.title.localeCompare(b.title)||a.index-b.index).map(s=>s.title));
 }
 assert.equal(JSON.stringify(songs),before);assert.deepEqual([...brickMap.keys()],mapBefore);assert.deepEqual(groupAABA(songs,forms.map(f=>({...f,family:'Other'})),brickMap),[]);
});
