import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {brickType,groupBricks} from '../src/music/brick-groups.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const types=read('src/music/brick-types.json');
const item=(name,standards,extra={})=>({name,slug:name.toLowerCase().replaceAll(' ','-'),standards,...extra});

test('dominant-cycle directions, lengths and minor/cadence variants share one catalogue group while retaining dictionary types',()=>{
 const names=['Dominant Cycle','Dominant Cycle 2 Steps','Dominant Cycle 8 Steps','Dominant Cycle Minor','Reverse Dominant Cycle','Reverse Dominant Cycle 2 Steps'];
 const bricks=names.map((name,i)=>item(name,i+1,name==='Dominant Cycle'?{representativeName:'Dominant Cycle Cadence'}:{})),before=JSON.stringify(bricks),groups=groupBricks(bricks,types);
 assert.equal(groups.length,1);assert.equal(groups[0].type,'Dominant Cycle');assert.deepEqual(groups[0].bricks.map(b=>b.name),[...names].reverse());
 for(const b of groups[0].bricks)assert.deepEqual(b.classification,brickType(b.representativeName??b.name,types));
 assert.equal(groups[0].bricks.find(b=>b.name==='Dominant Cycle').classification.type,'Cadence');assert.equal(groups[0].bricks.find(b=>b.name==='Reverse Dominant Cycle 2 Steps').classification.type,'Dropback');assert.equal(JSON.stringify(bricks),before);
});

test('IV-and patterns share a group across cadence, turnaround, deceptive and dropback types without absorbing a bare To IV alias',()=>{
 const bricks=[item('IV n Bird',5),item('To IV n Bird SPOT',2),item('IV and Yak',4),item("IV 'n' Back",3),item('IV & Hack',1),item('To IV',7,{sourceNames:['To IV','To IV n Mack +...']}),item('Diatonic I IV iii ii',2),item('II n Bird',4)];
 const groups=groupBricks(bricks,types),family=groups.find(g=>g.type==='IV and');assert.deepEqual(family.bricks.map(b=>b.name),['IV n Bird','IV and Yak',"IV 'n' Back",'To IV n Bird SPOT','IV & Hack']);
 assert.equal(family.bricks.find(b=>b.name==='IV n Bird').classification.type,'Deceptive-Cadence');assert.equal(family.bricks.find(b=>b.name==='To IV n Bird SPOT').classification.type,'Turnaround');assert.equal(groups.find(g=>g.bricks.some(b=>b.name==='To IV')).type,'Cadence');
 assert.ok(!family.bricks.some(b=>/^II n|^Diatonic/.test(b.name)));
 assert.ok(groups.find(g=>g.type==='II and'));assert.ok(groups.find(g=>g.type==='Diatonic'));
});

test('all live catalogue and drawer identities get the same group with descending composition popularity and unchanged classification',()=>{
 const index=read('dist/data/bricks.json').bricks,atlas=read('dist/data/atlas.json').groups.flatMap(g=>g.bricks),before=JSON.stringify(index),catalogue=groupBricks(atlas,types),drawer=groupBricks(index,types),map=groups=>Object.fromEntries(groups.flatMap(g=>g.bricks.map(b=>[b.slug,g.type])));
 assert.deepEqual(map(catalogue),map(drawer));assert.equal(catalogue.flatMap(g=>g.bricks).length,index.length);assert.equal(new Set(catalogue.flatMap(g=>g.bricks.map(b=>b.slug))).size,index.length);
 for(const g of drawer)for(const [i,b]of g.bricks.entries()){
  assert.deepEqual(b.classification,brickType(b.representativeName??b.name,types));
  if(i){const a=g.bricks[i-1];assert.ok(a.standardCount>=b.standardCount);if(a.standardCount===b.standardCount)assert.ok(a.name.localeCompare(b.name)<=0);}
 }
 for(const slug of ['dominant-cycle','dominant-cycle-2-steps','reverse-dominant-cycle','dominant-cycle-3-steps','dominant-cycle-minor','reverse-dominant-cycle-2-steps','dominant-cycle-4-steps'].filter(slug=>index.some(brick=>brick.slug===slug)))assert.ok(drawer.find(g=>g.type==='Dominant Cycle').bricks.some(b=>b.slug===slug));
 for(const slug of ['iv-n-yak','iv-n-back','to-iv-n-yak','iv-n-bird','iv-n-bird-spot','to-iv-n-back','to-iv-n-bird-spot','iv-n-hack'].filter(slug=>index.some(brick=>brick.slug===slug)))assert.ok(drawer.find(g=>g.type==='IV and').bricks.some(b=>b.slug===slug));
 assert.equal(JSON.stringify(index),before);
});
