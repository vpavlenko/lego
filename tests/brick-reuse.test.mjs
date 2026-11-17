import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBrickIndex} from '../src/music/bricks.mjs';
import {buildLearnerBrickIndex} from '../src/music/brick-families.mjs';
import {buildBrickVariants} from '../src/music/brick-variants.mjs';
import {removeUnhelpfulBricks} from '../src/music/brick-coverage.mjs';
import {refineSingleUseFamilies} from '../src/music/brick-reuse.mjs';
const vocabulary=JSON.parse(fs.readFileSync(new URL('../src/music/chord-vocabulary.json',import.meta.url),'utf8'));
function chart(index,label,symbols,{tonic='C',clipped=false}={}){
 const bars=symbols.length;return {index,title:'Fixture '+index,tonic:[tonic,'Major'],meter:[4,4],bars,columns:bars,bricks:[label],notes:[{pitch:60,start:0,duration:1,voice:1}],rows:[{startBar:0,bars,keys:[{start:0,end:bars,root:tonic,mode:'Major'}],bricks:[{start:0,end:bars,name:label}],chords:symbols.map((symbol,i)=>({start:i,end:i+1,symbol,...(clipped&&i===1?{clipped:true}:{})})),joins:[]}]};
}
const reusable=()=>[chart(0,'Reusable',['Dm7','G7','CM7']),chart(1,'Reusable',['Dm7','G7','CM7'])];
function run(songs){const index=buildLearnerBrickIndex(buildBrickIndex(songs));return {original:index,...refineSingleUseFamilies(index,songs,vocabulary)};}
const decision=(result,name)=>result.decisions.find(d=>d.source.name===name);

test('clear added-chord and quality/slash variants join a supported family without rewriting their music or labels',()=>{
 const songs=[...reusable(),chart(2,'Extra',['Dm7','G7','CM7','A7']),chart(3,'Quality',['Dm9','G7/B','CM9'])],before=JSON.stringify(songs),result=run(songs);
 assert.equal(result.stats.mergedFamilies,2);assert.equal(result.stats.removedFamilies,0);assert.equal(result.index.bricks.length,1);
 const family=result.index.bricks[0];assert.equal(family.name,'Reusable');assert.equal(family.representativeName,'Reusable');assert.deepEqual(family.standards.map(s=>s.song),[0,1,2,3]);
 for(const name of ['Extra','Quality']){const d=decision(result,name);assert.equal(d.action,'merge');assert.ok(d.distance<=.28);assert.equal(d.target.distinctStandards,2);assert.ok(d.pairs.every(p=>p.anchors>=2&&p.supportStandards.length>=2));assert.ok(family.aliases.includes(name));assert.ok(family.aliasSlugs.includes(result.original.bricks.find(b=>b.name===name).slug));}
 assert.equal(result.songs[2].rows[0].bricks[0].name,'Extra');assert.equal(result.songs[3].rows[0].bricks[0].name,'Quality');assert.equal(JSON.stringify(songs),before);assert.deepEqual(result.songs,songs);
 const variants=buildBrickVariants(family,result.songs,vocabulary);assert.equal(variants.variants.length,3);assert.ok(variants.variants.some(v=>v.previewSong.rows[0].chords.some(c=>c.symbol==='G7/B')));
 assert.ok(family.standards.find(s=>s.song===3).passages.every(p=>p.label==='Quality'));
});

test('a changed root in an otherwise similar two-chord pair cannot merge',()=>{
 const songs=[chart(0,'Reusable',['Dm7','G7']),chart(1,'Reusable',['Dm7','G7']),chart(2,'Unique',['Ebm7','G7'])],result=run(songs),d=decision(result,'Unique');
 assert.equal(d.action,'remove');assert.equal(d.reason,'no-clear-supported-harmonic-variant');assert.equal(result.songs[2].rows[0].bricks.length,0);assert.deepEqual(result.songs[2].rows[0].chords,songs[2].rows[0].chords);
});

test('equal or near-equal supported families leave the singleton unassigned and remove only its label',()=>{
 const songs=[chart(0,'Reusable One',['Dm7','G7','CM7']),chart(1,'Reusable One',['Dm7','G7','CM7']),chart(2,'Reusable Two',['Dm7','G7','CM7']),chart(3,'Reusable Two',['Dm7','G7','CM7']),chart(4,'Unique',['Dm7','G7','CM7'])],result=run(songs),d=decision(result,'Unique');
 assert.equal(d.action,'remove');assert.equal(d.reason,'ambiguous-supported-families');assert.equal(d.candidates.length,2);assert.equal(d.candidates[0].distance,d.candidates[1].distance);assert.equal(result.index.bricks.length,2);
 assert.equal(result.songs[4].rows[0].bricks.length,0);assert.deepEqual(result.songs[4].notes,songs[4].notes);assert.deepEqual(result.songs[4].rows[0].keys,songs[4].rows[0].keys);assert.deepEqual(result.songs[4].rows[0].joins,songs[4].rows[0].joins);
});

test('repeated occurrences in one standard are not reuse and every source variant needs complete support',()=>{
 const source=chart(2,'Unique',['Dm7','G7','CM7']);source.rows.push({...chart(2,'Unique',['Gb7','E7','F#M7']).rows[0],startBar:3,joins:[{at:0,from:'C',to:'C',delta:0,name:'Homer'}]});source.bars=6;
 const songs=[...reusable(),source],result=run(songs),d=decision(result,'Unique');assert.equal(d.source.distinctStandards,1);assert.equal(d.source.passages,2);assert.equal(d.source.variants.length,2);assert.equal(d.action,'remove');assert.ok(result.songs[2].rows.every(r=>!r.bricks.length));
 const unknown=run([...reusable(),chart(2,'Unknown',['Dm7','G7','CM7'],{clipped:true})]);assert.equal(decision(unknown,'Unknown').reason,'unsupported-or-incomplete-source');
});

test('target popularity is established by the matching core, including quality variants across distinct standards',()=>{
 const insufficient=[chart(0,'Reusable',['Dm7','G7','CM7']),chart(1,'Reusable',['Abm7','Db7','GbM7']),chart(2,'Unique',['Dm9','G7','CM9'])],no=run(insufficient);assert.equal(decision(no,'Unique').action,'remove');
 const clippedSupport=run([chart(0,'Reusable',['Dm7','G7','CM7']),chart(1,'Reusable',['Dm7','G7','CM7'],{clipped:true}),chart(2,'Unique',['Dm9','G7','CM9'])]);assert.equal(decision(clippedSupport,'Unique').action,'remove');
 const aggregate=[chart(0,'Reusable',['Dm7','G7','CM7']),chart(1,'Reusable',['Dm9','G9','CM9']),chart(2,'Unique',['Dm11','G13','CM7'])],yes=run(aggregate),d=decision(yes,'Unique');
 assert.equal(d.action,'merge');assert.deepEqual(d.pairs[0].supportStandards,[0,1]);assert.equal(yes.index.bricks[0].standards.length,3);
});

test('tonic-relative comparison retains source pitch context while refusing a mismatched context',()=>{
 const songs=[...reusable(),chart(2,'Transposed',['Em7','A7','DM7'],{tonic:'D'})],result=run(songs);assert.equal(decision(result,'Transposed').action,'merge');assert.equal(decision(result,'Transposed').distance,0);assert.deepEqual(result.songs[2].tonic,['D','Major']);assert.equal(result.songs[2].rows[0].chords[0].symbol,'Em7');
 const wrong=run([...reusable(),chart(2,'Wrong Context',['Dm7','G7','CM7'],{tonic:'D'})]);assert.equal(decision(wrong,'Wrong Context').action,'remove');
});

test('the current corpus preserves all musical data, retained spans and merged legacy routes without one-standard families',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8')).songs,additional=JSON.parse(fs.readFileSync(new URL('../dist/data/additional-standards.json',import.meta.url),'utf8')).songs,songs=removeUnhelpfulBricks([...original,...additional],vocabulary).songs,input=buildLearnerBrickIndex(buildBrickIndex(songs)),before=JSON.stringify({songs,input}),result=refineSingleUseFamilies(input,songs,vocabulary);
 assert.equal(JSON.stringify({songs,input}),before);assert.equal(result.stats.singleStandardFamilies,39);assert.equal(result.stats.mergedFamilies,11);assert.equal(result.stats.removedFamilies,28);assert.equal(result.index.bricks.length,123);
 assert.equal(result.stats.keptPassages,result.index.bricks.reduce((n,b)=>n+b.passages,0));assert.equal(result.stats.removedPassages,result.decisions.filter(d=>d.action==='remove').reduce((n,d)=>n+d.source.passages,0));
 for(let i=0;i<songs.length;i++){
  const kept=result.songs[i],source=songs[i];assert.equal(kept.bars,source.bars);assert.deepEqual(kept.tonic,source.tonic);assert.deepEqual(kept.meter,source.meter);assert.deepEqual(kept.notes,source.notes);assert.equal(kept.rows.length,source.rows.length);
  for(let r=0;r<source.rows.length;r++){const {bricks:ignored,...a}=kept.rows[r],{bricks:omitted,...b}=source.rows[r];assert.deepEqual(a,b);}
 }
 const routes=new Map();for(const b of result.index.bricks){assert.ok(new Set(b.standards.map(s=>s.song)).size>=2);for(const slug of [b.slug,...b.aliasSlugs]){assert.ok(!routes.has(slug),'Route collision: '+slug);routes.set(slug,b);}}
 for(const d of result.decisions.filter(d=>d.action==='merge')){const source=input.bricks.find(b=>b.slug===d.source.slug),target=result.index.bricks.find(b=>b.slug===d.target.slug);for(const slug of [source.slug,...source.aliasSlugs])assert.equal(routes.get(slug),target);assert.ok(d.pairs.every(p=>p.supportStandards.length>=2));}
});
