import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {orderBrickVariants,variantDistance} from '../src/music/variant-order.mjs';

const major=[0,4,7],major7=[0,4,7,11],minor7=[0,3,7,10],dominant=[0,4,7,10];
const chord=(root,quality=major,bass=null)=>[root,quality,bass];
function variant(id,harmonies,{durations=null,keys=[['0/1',0,'major']],symbols=null}={}){
 const ds=durations??harmonies.map(()=>1),total=ds.reduce((n,d)=>n+d,0);let at=0;
 const chords=harmonies.map((harmony,i)=>{const value={symbol:symbols?.[i]??'ignored',harmony,at:`${at}/${total}`,duration:`${ds[i]}/${total}`};at+=ds[i];return value;});
 return {id,signature:'immutable-'+id,structure:{chords,keys},source:{title:'Source '+id}};
}
const ids=variants=>variants.map(v=>v.id);
function contiguous(order,members){const indices=order.flatMap((v,i)=>members.includes(v.id)?[i]:[]);assert.equal(indices.length,members.length);assert.equal(indices.at(-1)-indices[0]+1,members.length,JSON.stringify(ids(order)));}

test('simple core leads, and the same added-chord families stay together across rhythm, core quality and insertion location',()=>{
 const core=[chord(2,minor7),chord(7,dominant),chord(0,major)];
 const base=variant('base',core),a=chord(9,minor7),b=chord(5,minor7);
 const additions=[variant('a-middle',[core[0],a,core[1],core[2]]),variant('a-first',[a,...core]),variant('a-rhythm',[core[0],a,core[1],core[2]],{durations:[1,1,1,3]}),variant('a-major7',[core[0],a,core[1],chord(0,major7)]),variant('b-middle',[core[0],b,core[1],core[2]]),variant('b-rhythm',[core[0],b,core[1],core[2]],{durations:[2,1,1,2]})];
 const result=orderBrickVariants([additions[4],additions[1],additions[5],additions[3],base,additions[0],additions[2]]);
 assert.equal(result[0],base);contiguous(result,['a-middle','a-first','a-rhythm','a-major7']);contiguous(result,['b-middle','b-rhythm']);
 // Identical chord sequences receive a contiguous rhythm block inside the
 // larger shared-extra family, before moving to a changed tonic quality.
 contiguous(result,['a-middle','a-rhythm']);
});

test('fewest-tone rooted form precedes slash bass and extensions, without hiding any distinction',()=>{
 const base=variant('triad',[chord(0)]),seventh=variant('seventh',[chord(0,major7)]),slash=variant('slash',[chord(0,major,7)]),ninth=variant('ninth',[chord(0,[0,4,7,11,14])]);
 const order=orderBrickVariants([ninth,slash,seventh,base]);assert.equal(order[0],base);
 assert.ok(variantDistance(base,slash)<variantDistance(base,variant('different-root',[chord(6)])));
 assert.ok(variantDistance(seventh,ninth)<variantDistance(seventh,variant('different-root',[chord(6,major7)])));
 assert.ok(variantDistance(variant('add2',[chord(0,[0,2,4,7])]),variant('add9',[chord(0,[0,4,7,14])]))>0);
 assert.ok(variantDistance(base,slash)>0);
 assert.equal(new Set(order).size,4);
});

test('rhythm changes stay closer than root substitutions and distance is symmetric',()=>{
 const harmonies=[chord(2,minor7),chord(7,dominant),chord(0,major7)];
 const a=variant('a',harmonies,{durations:[1,1,2]}),rhythm=variant('rhythm',harmonies,{durations:[1,2,1]}),changed=variant('changed',[chord(3,minor7),harmonies[1],harmonies[2]],{durations:[1,1,2]});
 assert.ok(variantDistance(a,rhythm)<variantDistance(a,changed));
 for(const left of [a,rhythm,changed])for(const right of [a,rhythm,changed])assert.ok(Math.abs(variantDistance(left,right)-variantDistance(right,left))<1e-10);
 assert.equal(variantDistance(a,a),0);
});

test('ordering depends on normalized structure, not source spellings, names, IDs or source transposition',()=>{
 const harmonies=[chord(2,minor7),chord(7,dominant),chord(0,major7)];
 const c=variant('base',harmonies,{symbols:['Dm7','G7','CM7']}),fSharp=variant('base',harmonies,{symbols:['G#m7','C#7','F#maj7']});fSharp.source={title:'Other source',tonic:['F#','Major']};
 assert.equal(variantDistance(c,fSharp),0);
 const extra=variant('extra',[...harmonies,chord(9,dominant)]),extended=variant('extended',[harmonies[0],chord(7,[0,4,7,10,14]),harmonies[2]]);
 assert.deepEqual(ids(orderBrickVariants([extra,c,extended])),ids(orderBrickVariants([extended,fSharp,extra])));
 const renamed=[c,extended,extra].map((v,i)=>({...v,id:'unrelated-'+[9,1,2][i],signature:'hash-'+i}));
 assert.deepEqual(orderBrickVariants(renamed).map(v=>v.structure),orderBrickVariants([extra,c,extended]).map(v=>v.structure));
});

test('stable input permutations return the same untouched objects and preserve rational equivalence',()=>{
 const a=variant('a',[chord(0),chord(9,minor7)]),b=variant('b',[chord(0),chord(2,minor7)]),c=variant('c',[chord(0)]);
 const original=[a,b,c],before=JSON.stringify(original),expected=ids(orderBrickVariants(original));
 for(const permutation of [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]])assert.deepEqual(ids(orderBrickVariants(permutation)),expected);
 assert.equal(JSON.stringify(original),before);for(const item of orderBrickVariants(original))assert.ok(original.includes(item));
 const equivalent=structuredClone(a);equivalent.structure.chords[1].at='2/4';equivalent.structure.chords[1].duration='2/4';assert.equal(variantDistance(a,equivalent),0);
 assert.deepEqual(orderBrickVariants([]),[]);assert.deepEqual(orderBrickVariants([a]),[a]);assert.notEqual(orderBrickVariants(original),original);
});

test('every generated corpus definition retains identity and data under semantic order',()=>{
 const directory=new URL('../dist/data/brick-variants/',import.meta.url),files=fs.readdirSync(directory).filter(name=>name.endsWith('.json'));let definitions=0;
 assert.ok(files.length>0);
 for(const file of files){
  const variants=JSON.parse(fs.readFileSync(new URL(file,directory),'utf8')).variants,before=JSON.stringify(variants),ordered=orderBrickVariants(variants);definitions+=variants.length;
  assert.equal(ordered.length,variants.length,file);assert.equal(new Set(ordered).size,variants.length,file);assert.ok(ordered.every(v=>variants.includes(v)),file);
  assert.equal(JSON.stringify(variants),before,file);assert.deepEqual(ids(ordered),ids(orderBrickVariants([...variants].reverse())),file);
  if(ordered.length)assert.equal(ordered[0].structure.chords.length,Math.min(...variants.map(v=>v.structure.chords.length)),file);
 }
 assert.ok(definitions>0);
});
