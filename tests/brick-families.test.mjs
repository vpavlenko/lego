import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBrickIndex} from '../src/music/bricks.mjs';
import {buildLearnerBrickIndex} from '../src/music/brick-families.mjs';

const {songs}=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8'));
const source=buildBrickIndex(songs),learner=buildLearnerBrickIndex(source);
const named=name=>learner.bricks.find(b=>b.name===name);
const containing=name=>learner.bricks.find(b=>b.sourceNames.includes(name));
const spans=index=>index.bricks.flatMap(b=>b.standards.flatMap(s=>s.passages.map(p=>JSON.stringify([s.song,p.row,p.startBar,p.endBar,p.start,p.end,p.label])))).sort();

test('learner grouping preserves each source passage exactly once and unions standard IDs',()=>{
 assert.equal(source.bricks.length,299);assert.equal(learner.sourceBricks,299);assert.equal(learner.sourceLabels,354);
 assert.equal(learner.totalStandards,242);assert.equal(learner.bricks.length,186);
 assert.equal(learner.bricks.reduce((n,b)=>n+b.passages,0),3452);assert.deepEqual(spans(learner),spans(source));
 for(const b of learner.bricks){
  assert.equal(new Set(b.standards.map(s=>s.song)).size,b.standards.length);
  assert.equal(b.passages,b.standards.reduce((n,s)=>n+s.passages.length,0));
 }
});

test('Body & Soul shares one family across all requested roles and tails',()=>{
 const b=named('Body & Soul');assert.equal(b.slug,'body-soul');assert.equal(b.representativeName,'Body & Soul Cadence');
 assert.deepEqual(b.sourceNames,['Body & Soul Approach','Body & Soul Cadence','Body & Soul Cadence + Dropback','Body & Soul Cadence +...','Body & Soul Launcher']);
 assert.equal(b.passages,44);assert.equal(b.standards.length,25);assert.ok(b.aliases.includes('Body & Soul Cade...'));
});

test('all shared named Approach, Cadence, and Launcher stems coalesce',()=>{
 for(const stem of ['Autumnal','Dizzy','Extended','Long','Nowhere','Rainy','Sad','Slow','Stablemates','Starlight','Straight','Tritone','Two Goes Straight','Yardbird']){
  const b=named(stem);assert.ok(b,stem);
  for(const role of ['Approach','Cadence','Launcher']){
   const original=source.bricks.find(item=>item.name===stem+' '+role);
   if(original)assert.ok(b.sourceNames.includes(original.name),original.name);
  }
 }
 const cadence=named('Cadence');for(const name of ['Cadence','Cadence + Dropback','Cadence + Overrun','Launcher'])assert.ok(cadence.sourceNames.includes(name));
});

test('tails and uniquely resolved clipped roles fold without merging unrelated patterns',()=>{
 const b=named('Minor Dropback');assert.deepEqual(b.sourceNames,['Minor Dropback','Minor Dropback +...']);
 for(const label of ['Minor Dr.','Minor Dro.','Minor Dropb','Minor Dropbac','Minor Dropback +'])assert.ok(b.aliases.includes(label),label);
 assert.notEqual(b,containing('Minor On'));assert.notEqual(b,containing('Minor POT'));
 assert.equal(containing('Happenstance App...'),named('Happenstance'));
 assert.equal(containing('Straight...'),named('Straight'));
 // Ending, Opening, Turnaround, POT, and Start are outside the role merge.
 assert.notEqual(containing('Starlight Opening'),named('Starlight'));
 assert.notEqual(containing('Nowhere Turnaround'),named('Nowhere'));
 assert.notEqual(containing('Dominant Cycle Minor'),containing('Dominant Cycle'));
 assert.equal(containing('Pullback to Cadence').name,'Pullback to Cadence');
 for(const label of ['Bemsha Turnaround 1','Bemsha Turnaround 2','Bemsha Turnaround 3'])assert.equal(containing(label).name,label);
});

test('every source primary and alias route remains unique and maps to its learner family',()=>{
 const routes=new Map();
 for(const b of learner.bricks)for(const slug of [b.slug,...b.aliasSlugs]){
  assert.ok(!routes.has(slug),'Duplicate learner route: '+slug);routes.set(slug,b);
 }
 for(const b of source.bricks)for(const slug of [b.slug,...b.aliasSlugs])assert.equal(routes.get(slug),containing(b.name),slug);
});

test('new learner slugs cannot steal a reserved source route',()=>{
 const brick=(name,slug)=>({name,slug,aliases:[],aliasSlugs:[],standards:[],passages:0,clipped:false});
 const d=buildLearnerBrickIndex({sourceLabels:2,totalStandards:0,bricks:[brick('Echo Approach','echo-approach'),brick('Echo!','echo')]});
 const echo=d.bricks.find(b=>b.name==='Echo'),other=d.bricks.find(b=>b.name==='Echo!');
 assert.notEqual(echo.slug,'echo');assert.equal(other.slug,'echo');assert.ok(echo.aliasSlugs.includes('echo-approach'));
});

test('learner output is deterministic and leaves the source index untouched',()=>{
 const before=JSON.stringify(source);
 assert.deepEqual(buildLearnerBrickIndex({...source,bricks:[...source.bricks].reverse()}),learner);
 assert.equal(JSON.stringify(source),before);
});
