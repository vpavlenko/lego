import {BRICK_NAME_PROPOSALS,COMPOUND_DISPLAY_NAMES} from '../src/music/brick-display-names.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBrickIndex} from '../src/music/bricks.mjs';
import {buildLearnerBrickIndex} from '../src/music/brick-families.mjs';

const {songs}=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8'));
const source=buildBrickIndex(songs),learner=buildLearnerBrickIndex(source);
const named=name=>learner.bricks.find(b=>b.name===name||b.aliases.includes(name));
const displayName=family=>BRICK_NAME_PROPOSALS.find(p=>p.cork===family)?.name??COMPOUND_DISPLAY_NAMES[family]??({'Whoopee':'vii°7/ii ii V I','Whoopee Turnaround':'I vii°/ii ii V'})[family]??family;
const containing=name=>learner.bricks.find(b=>b.sourceNames.includes(name));
const spans=index=>index.bricks.flatMap(b=>b.standards.flatMap(s=>s.passages.map(p=>JSON.stringify([s.song,p.row,p.startBar,p.endBar,p.start,p.end,p.label])))).sort();

test('learner grouping preserves each source passage exactly once and unions standard IDs',()=>{
 assert.equal(source.bricks.length,299);assert.equal(learner.sourceBricks,299);assert.equal(learner.sourceLabels,354);
 assert.equal(learner.totalStandards,242);assert.equal(learner.bricks.length,169);
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
 for(const stem of ['Autumnal','Dizzy','Nowhere','Rainy','Sad','Stablemates','Starlight','Straight','Tritone','Yardbird']){
  const b=named(stem);assert.ok(b,stem);
  for(const role of ['Approach','Cadence','Launcher']){
   const original=source.bricks.find(item=>item.name===stem+' '+role);
   if(original)assert.ok(b.sourceNames.includes(original.name),original.name);
  }
 }
 const cadence=named('Cadence');for(const name of ['Cadence','Cadence + Dropback','Cadence + Overrun','Launcher'])assert.ok(cadence.sourceNames.includes(name));
});

function fixture(names){
 const songs=names.map((name,index)=>({index,title:name,meter:[4,4],rows:[{startBar:0,bricks:[{name,start:0,end:1}]}]}));
 return buildLearnerBrickIndex(buildBrickIndex(songs));
}
const familyFor=(index,label)=>index.bricks.find(b=>b.sourceNames.includes(label));

test('repetition wrappers fold into their main type while modes and destinations remain',()=>{
 const names=['Pullback','Two Goes Pullback','Pullback Twice','Straight Cadence','Four Goes Straight Approach','Three Times Straight','Straight 5 Times','Twice Straight','Thrice Straight Cadence','Double Straight Launcher','Triple Straight','Twenty-One Goes Straight','7 Chord Dropback','Two Goes Minor Pullback to IV','Two Goes Major Pullback to IV','Two Goes Tritone Straight Approach','Minor On Twice','Three Goes Pullback+Cadence'];
 const index=fixture(names);
 for(const name of ['Two Goes Pullback','Pullback Twice'])assert.equal(familyFor(index,name).name,'Pullback');
 for(const name of names.filter(n=>n.includes('Straight')&&!n.includes('Tritone')))assert.equal(familyFor(index,name).name,'Straight',name);
 assert.equal(familyFor(index,'7 Chord Dropback').name,'7 Chord Dropback');
 assert.equal(familyFor(index,'Two Goes Minor Pullback to IV').name,'Minor Pullback to IV');
 assert.equal(familyFor(index,'Two Goes Major Pullback to IV').name,'Major Pullback to IV');
 assert.equal(familyFor(index,'Two Goes Tritone Straight Approach').name,'Tritone Straight');
 assert.equal(familyFor(index,'Minor On Twice').name,'Minor On');
 assert.equal(familyFor(index,'Three Goes Pullback+Cadence').name,'Pullback+Cadence');
 assert.equal(containing('Two Goes Pullback'),named('Pullback'));assert.equal(containing('Four Goes Straight Approach'),named('Straight'));
});

test('length and tempo words fold only into known named stems or a generic role',()=>{
 const index=fixture(['Cadence','Slow Cadence','Long Cadence','Extended Approach','Short Launcher','Slow Cadence Twice','Two Goes Approach','Dogleg Cadence','Dogleg Slow Launcher','Extended Dogleg Approach','Slow Dogleg Extended','Minor Dogleg Slow Launcher','Unlisted Short Approach','Pullback','Two Goes Pullback Extended','Dominant Cycle','Chromatic Approach','Tritone Approach','Minor Approach','Major Approach']);
 for(const name of ['Slow Cadence','Long Cadence','Extended Approach','Short Launcher','Slow Cadence Twice','Two Goes Approach'])assert.equal(familyFor(index,name).name,'Cadence',name);
 for(const name of ['Dogleg Slow Launcher','Extended Dogleg Approach','Slow Dogleg Extended'])assert.equal(familyFor(index,name).name,displayName('Dogleg'),name);
 assert.equal(familyFor(index,'Two Goes Pullback Extended').name,'Pullback');
 assert.equal(familyFor(index,'Minor Dogleg Slow Launcher').name,'Minor Dogleg Slow');
 assert.equal(familyFor(index,'Unlisted Short Approach').name,'Unlisted Short');
 for(const name of ['Dominant Cycle','Chromatic Approach','Tritone Approach','Minor Approach','Major Approach'])assert.equal(familyFor(index,name).name,name.replace(/ Approach$/,''));
 const withBase=fixture(['Minor Dogleg Cadence','Minor Dogleg Slow Launcher']);assert.equal(familyFor(withBase,'Minor Dogleg Slow Launcher').name,'Minor Dogleg');
});

test('previous wrapper-family routes and aliases resolve to the main family',()=>{
 const routes=new Map(learner.bricks.flatMap(b=>[b.slug,...b.aliasSlugs].map(slug=>[slug,b.name])));
 for(const [route,target]of [['two-goes-pullback','Pullback'],['two-goes-pullback-extended','Pullback'],['two-goes-straight','Straight'],['four-goes-straight','Straight'],['extended','Cadence'],['long','Cadence'],['slow','Cadence'],['pullback-extended','Pullback']])assert.equal(routes.get(route),target,route);
 for(const alias of ['Two Goes Straight','Four Goes Straight'])assert.ok(named('Straight').aliases.includes(alias));
 const audit=JSON.parse(fs.readFileSync(new URL('../evidence/brick-families-audit.json',import.meta.url),'utf8'));
 assert.equal(audit.previousRoutes.length,423);for(const {route,family}of audit.previousRoutes)assert.equal(routes.get(route),displayName(family),route);
});

test('combined original and additional source usages and every source route remain intact',()=>{
 const additional=JSON.parse(fs.readFileSync(new URL('../dist/data/additional-standards.json',import.meta.url),'utf8')).songs,combined=buildBrickIndex([...songs,...additional]),before=JSON.stringify(combined),index=buildLearnerBrickIndex(combined);
 assert.equal(index.bricks.length,217);assert.deepEqual(spans(index),spans(combined));assert.equal(JSON.stringify(combined),before);
 assert.equal(familyFor(index,'Dogleg Slow Launcher'),familyFor(index,'Dogleg Cadence'));
 const routes=new Map();for(const b of index.bricks)for(const slug of [b.slug,...b.aliasSlugs]){assert.ok(!routes.has(slug),slug);routes.set(slug,b);}
 for(const b of combined.bricks)for(const slug of [b.slug,...b.aliasSlugs])assert.equal(routes.get(slug),familyFor(index,b.name),slug);
 const audit=JSON.parse(fs.readFileSync(new URL('../evidence/brick-families-audit.json',import.meta.url),'utf8'));
 assert.equal(audit.combined.previousRoutes.length,444);for(const {route,family}of audit.combined.previousRoutes)assert.equal(routes.get(route)?.name,displayName(family),route);
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
