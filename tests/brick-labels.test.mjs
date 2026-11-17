import test from 'node:test';import assert from 'node:assert/strict';
import {RAWL_COLORS} from 'librawl/palette';
import {brickNameParts,brickNameHTML} from '../src/music/brick-labels.mjs';
test('without brick context only standalone harmonic degrees and secondary functions have colors',()=>{
 assert.deepEqual(brickNameParts('IV and Bird'),[{text:'IV',degree:5},{text:' and Bird',degree:null}]);
 assert.deepEqual(brickNameParts('vii°7/ii–ii–V–I').filter(p=>p.degree!==null).map(p=>p.degree),[1,2,7,0]);
 for(const name of ['Diatonic','Dizzy','7 Chord Dropback','Dominant Cycle 3 Steps','CESH'])assert.deepEqual(brickNameParts(name),[{text:name,degree:null}]);
 assert.deepEqual(brickNameParts('To bVII').filter(p=>p.degree!==null).map(p=>p.degree),[10]);assert.ok(brickNameHTML('<IV>').startsWith('&lt;<span'));
});
test('the user-authored Autumn Leaves mapping preserves exact case, spaces and six two-letter chunks',()=>{
 for(const name of ['Autumn Leaves','autumn leaves','AUTUMN LEAVES']){
  const parts=brickNameParts(name,[2,7,0,11,4]);assert.equal(parts.map(p=>p.text).join(''),name);assert.deepEqual(parts.filter(p=>p.degree!==null).map(p=>p.degree),[5,10,3,2,7,0]);assert.deepEqual(parts.filter(p=>p.degree!==null).map(p=>p.text),[name.slice(0,2),name.slice(2,4),name.slice(4,6),name.slice(7,9),name.slice(9,11),name.slice(11,13)]);
 }
 const parts=brickNameParts('Autumn Leaves Opening',{nameColorRoots:[2,7,0,11,4]});assert.equal(parts.map(p=>p.text).join(''),'Autumn Leaves Opening');assert.deepEqual(parts.filter(p=>p.degree!==null).slice(6).map(p=>[p.text,p.degree]),[['Opening',0]]);
});
test('name colors fit the actual root sequence once rather than inventing repeated chord events',()=>{
 assert.deepEqual(brickNameParts('Dropback',[0,9]),[{text:'Drop',degree:0},{text:'back',degree:9}]);
 assert.deepEqual(brickNameParts('Pullback',[2,7,10,9]),[{text:'Pu',degree:2},{text:'ll',degree:7},{text:'ba',degree:10},{text:'ck',degree:9}]);
 assert.deepEqual(brickNameParts('Dizzy',[-1,14]),[{text:'Di',degree:11},{text:'zzy',degree:2}]);
 const name='Dominant Cycle 3 Steps',parts=brickNameParts(name,[2,7]);assert.equal(parts.map(p=>p.text).join(''),name);assert.deepEqual(parts.filter(p=>p.degree!==null).map(p=>[p.text,p.degree]),[['Dominant',2],['C',2],['ycle',7],['Steps',7]]);assert.ok(parts.some(p=>p.degree===null&&p.text.includes('3')));
 assert.deepEqual(brickNameParts('Dizzy',{roots:[-1,14]}),brickNameParts('Dizzy',[-1,14]));
 assert.equal(brickNameParts('7 Chord Dropback',[]).every(p=>p.degree===null),true);assert.deepEqual(brickNameParts('Dizzy',{nameColorRoots:[NaN,Infinity,'7']}),brickNameParts('Dizzy'));
 // An eight-event repeated SPOT excerpt cannot fit eight distinct chunks
 // into four letters: retain evenly sampled real roots and both endpoints.
 assert.deepEqual(brickNameParts('SPOT',[4,9,2,7,4,9,2,7]),[{text:'S',degree:4},{text:'P',degree:2},{text:'O',degree:9},{text:'T',degree:7}]);
});
test('explicit RN functions, extensions and quality symbols retain their semantic degree within colored names',()=>{
 for(const [name,expected]of [['IV and Bird',[5]],['vii°7/ii–ii–V–I',[1,2,7,0]],['♭IIIΔ7–V7–i',[3,7,0]],['♯iv(ø)–VII7',[6,11]]]){
  const rns=brickNameParts(name).filter(p=>p.degree!==null),colored=brickNameParts(name,[9]);assert.deepEqual(rns.map(p=>p.degree),expected);for(const rn of rns)assert.ok(colored.some(p=>p.text===rn.text&&p.degree===rn.degree));assert.equal(colored.map(p=>p.text).join(''),name);
 }
});
test('HTML uses only the canonical Rawl palette and escapes every name chunk',()=>{
 const name='<Dizzy & "IV">',parts=brickNameParts(name,[2,7]),html=brickNameHTML(name,[2,7]);assert.ok(html.includes('&lt;'));assert.ok(html.includes('&amp;'));assert.ok(html.includes('&quot;'));assert.ok(!html.includes('<Dizzy'));
 for(const part of parts.filter(p=>p.degree!==null))assert.ok(html.includes(`style="color:${RAWL_COLORS[part.degree].background}"`));
});
