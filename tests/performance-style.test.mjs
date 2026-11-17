import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performanceStyle,swungMelody,performedNotes} from '../src/music/performance-style.mjs';
const note=(id,start,duration,voice=1)=>({id,pitch:60,start,duration,voice,velocity:80});
const view=notes=>notes.map(n=>[n.start,n.duration]);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('default eighth feel is exactly67/33 and never changes chord attacks or source objects',()=>{
 const notes=[note('chord',0,4,0),note('a',0,.5),note('b',.5,.5)],before=JSON.stringify(notes),p=swungMelody({notes,beats:4,meter:[2,2]});
 assert.deepEqual(view(p.notes),[[0,4],[0,.67],[.67,.33]]);assert.equal(p.notes[0],notes[0]);assert.equal(p.affected,2);assert.equal(JSON.stringify(notes),before);assert.equal(performanceStyle({index:0}).ratio,.67);
});
test('mixed sixteenths, tuplets, grace edges and already swung cells retain every encoded boundary',()=>{
 for(const notes of [[note('a',0,.5),note('b',.5,.25),note('c',.75,.25)],[note('a',0,1/3),note('b',1/3,1/3),note('c',2/3,1/3)],[note('a',0,.49),note('grace',.49,.01),note('b',.5,.5)],[note('a',0,.67),note('b',.67,.33)]])assert.equal(swungMelody({notes,beats:4}).notes,notes);
});
test('tied notes remain one attack and only the applicable eighth endpoint moves',()=>{
 const notes=[note('tied',.5,2.5),note('last',3,.5)],p=performedNotes({notes,beats:4});assert.equal(p.length,2);near(p[0].start,.67);near(p[0].duration,2.33);near(p[1].start,3);near(p[1].duration,.67);
});
test('source pickup/full-measure anchors preserve pickup entry, downbeats and final partial boundaries',()=>{
 const notes=[note('pickup',0,.5),note('a',.5,.5),note('b',1,.5),note('tail',1.5,.5)],data={notes,beats:2,measureMap:[{start:0,duration:.5,sourceNumber:'0'},{start:.5,duration:1.5,sourceNumber:'1'}]},p=performedNotes(data);
 assert.deepEqual(view(p),[[0,.5],[.5,.67],[1.17,.33],[1.5,.5]]);
});
test('only a pinned reviewed dotted swing cell changes75/25 to67/33',()=>{
 const notes=[note('a',0,.75),note('b',.75,.25)],data={notes,beats:4};assert.equal(performedNotes(data),notes);assert.deepEqual(view(performedNotes({...data,playbackStyle:{feel:'swing',reviewedCells:[{start:0,sourceSplit:.75}]}})),[[0,.67],[.67,.33]]);
 assert.equal(performedNotes({...data,playbackStyle:{feel:'straight',reviewedCells:[{start:0,sourceSplit:.75}]}}),notes);
});
test('straight annotations are source-bound and override the default feel',()=>{
 const song={index:300,arrangementOf:3,melodyId:'source'},entry={id:'source',provenance:{sha256:'pinned',path:'source.ly'},notes:[]},references={entries:[{id:'source',melodyId:'source',sourceSha256:'pinned',sourcePath:'source.ly',feel:'straight'}]};assert.equal(performanceStyle(song,entry,references).feel,'straight');assert.throws(()=>performanceStyle(song,{...entry,provenance:{sha256:'other'}},references));const notes=[note('a',0,.5),note('b',.5,.5)];assert.equal(performedNotes({notes,beats:4,playbackStyle:{feel:'straight'}}),notes);
});
test('whole corpus interpretations preserve source clocks, note count/pitch, ordering and chord-note identity',()=>{
 const root=new URL('../dist/data/performances/',import.meta.url);let changed=0;
 for(const name of fs.readdirSync(root).filter(n=>/^\d+\.json$/.test(n))){const data=JSON.parse(fs.readFileSync(new URL(name,root))),before=JSON.stringify(data),p=swungMelody(data);changed+=p.affected;assert.equal(p.notes.length,data.notes.length);let previous=0;
  p.notes.filter(n=>n.voice===1).sort((a,b)=>a.start-b.start).forEach(n=>{assert.ok(n.start>=previous-1e-7,name);assert.ok(n.start>=0&&n.start+n.duration<=data.beats+1e-7,name);previous=n.start+n.duration;});
  p.notes.forEach((n,i)=>{const original=data.notes[i];assert.equal(n.id,original.id);assert.equal(n.pitch,original.pitch);assert.equal(n.velocity,original.velocity);if(n.voice!==1)assert.equal(n,original);});assert.equal(JSON.stringify(data),before);
 }
 assert.ok(changed>1000);
});
