import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {CADENCE_SCHEME,classifyCadenceWindow,cadenceWindows,structuralSummary,buildCadenceSystem} from '../src/music/cadence-system.mjs';
const minor=[0,3,7,10],dominant=[0,4,7,10],make=roots=>roots.map((root,i)=>({symbol:['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][root]+(i%2?'7':'m7'),harmony:[root,i%2?dominant:minor,null]}));
test('each of the twelve supplied rows matches only its exact root/quality row',()=>{
 assert.equal(new Set(CADENCE_SCHEME.map(row=>row.roots.join())).size,12);
 for(const row of CADENCE_SCHEME){const chords=make(row.roots),before=JSON.stringify(chords),match=classifyCadenceWindow(chords);assert.equal(match.schemeRow,row.row);assert.equal(match.relation,'diagram');assert.equal(JSON.stringify(chords),before);}
});
test('classification is tonic-relative and records extensions/slash bass instead of discarding source distinctions',()=>{
 const row=CADENCE_SCHEME[0],chords=make(row.roots.map(root=>(root+5)%12));assert.equal(classifyCadenceWindow(chords,{tonic:5}).schemeRow,1);assert.equal(classifyCadenceWindow(chords),null);
 const extended=make(row.roots);extended[0]={symbol:'Em9/B',harmony:[4,[...minor,14],11]};extended[1]={symbol:'A7#9',harmony:[9,[...dominant,15],null]};const match=classifyCadenceWindow(extended);assert.equal(match.schemeRow,1);assert.equal(match.slashBasses[0],11);assert.equal(match.intervals[0].at(-1),14);assert.equal(match.intervals[1].at(-1),15);
});
test('unrelated or incomplete progressions never match merely because a brick has a cadence name',()=>{
 for(const chords of [[],make([4,9,2]),make([4,8,2,7]),make([4,9,3,7]),[{symbol:'NC',harmony:null},...make([4,9,2,7]).slice(1)]])assert.equal(classifyCadenceWindow(chords),null);
 const major=make([4,9,2,7]);major[0].harmony[1]=[0,4,7,11];assert.equal(classifyCadenceWindow(major),null);
 const sus=make([4,9,2,7]);sus[1].harmony[1]=[0,5,7,10];assert.equal(classifyCadenceWindow(sus),null);
});
test('generalization identifies dogleg/repetition/altered-minor cells without falsely claiming an illustrated row',()=>{
 const dogleg=classifyCadenceWindow(make([9,2,2,7]));assert.equal(dogleg.relation,'generalized');assert.equal(dogleg.schemeRow,null);assert.deepEqual(dogleg.cells,['ii–V','ii–V']);assert.equal(dogleg.link.symbol,'V→v');
 const altered=make([4,9,2,7]);altered[2].harmony[1]=[0,3,6,10];const match=classifyCadenceWindow(altered);assert.equal(match.relation,'generalized');assert.equal(match.qualities[2],'half-diminished');
});
test('all catalogue bricks have source-derived summaries; exact and generalized indexes retain every matching source window',()=>{
 const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')),bricks=read('dist/data/bricks.json').bricks,songs=read('dist/data/standards.json').songs,definitions=bricks.map(brick=>read('dist/data/brick-variants/'+brick.slug+'.json')),before=JSON.stringify(definitions),system=buildCadenceSystem(definitions,{songs});
 assert.equal(Object.keys(system.summaries).length,bricks.length);for(const definition of definitions){const summary=structuralSummary(definition,{songs});assert.ok(summary);const variant=definition.variants.find(v=>v.id===summary.variantId);assert.equal(summary.tokens.length,variant.structure.chords.length);assert.equal(summary.text,summary.tokens.map(t=>t.text).join('–'));}
 const expected=definitions.reduce((sum,d)=>sum+d.variants.reduce((n,v)=>n+cadenceWindows(v).length,0),0),actual=system.rows.reduce((sum,row)=>sum+row.matches.length,0)+system.generalized.reduce((sum,g)=>sum+g.matches.length,0);assert.equal(actual,expected);assert.equal(JSON.stringify(definitions),before);
 for(const row of system.rows)for(const match of row.matches)assert.deepEqual(match.roots,row.roots);
});
test('popular summary counts compositions rather than duplicate source arrangements',()=>{
 const variant=(id,standards)=>({id,structure:{chords:make([4,9,2,7])},standards:standards.map(song=>({song})),completeOccurrences:standards.length}),definitions={slug:'x',variants:[variant('many-arrangements',[0,2,3]),variant('many-standards',[0,1])]};
 assert.equal(structuralSummary(definitions,{songs:[{index:0},{index:1},{index:2,arrangementOf:0},{index:3,arrangementOf:0}]}).variantId,'many-standards');
});
