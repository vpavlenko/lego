import test from 'node:test';import assert from 'node:assert/strict';import {chordDisplay,roman,romanDisplayParts} from '../dist/harmony.mjs';
const figures=(symbol,tonic='C')=>chordDisplay(symbol,tonic).figures.filter(f=>/[0-9]/.test(f.text)).map(f=>[f.text,f.degree]);
test('jazz superscripts represent sounding pitches relative to the active tonic',()=>{assert.deepEqual(figures('C7'),[['7',10]]);assert.deepEqual(figures('Cm7'),[['7',10]]);assert.deepEqual(figures('CM7'),[['7',11]]);assert.deepEqual(figures('Co7'),[['7',9]]);assert.deepEqual(figures('C7b9'),[['7',10],['♭9',1]]);assert.deepEqual(figures('FM7#11'),[['7',4],['♯11',11]]);assert.deepEqual(figures('FM7#11','F'),[['7',11],['♯11',6]]);assert.deepEqual(figures('C13b9'),[['13',9],['♭9',1]]);assert.deepEqual(figures('Cm69'),[['6',9],['9',2]]);});
test('explicit bass has its own degree and stays outside the quality superscript',()=>{const a=chordDisplay('G7/C');assert.deepEqual(a.bass,{text:'C',degree:0});assert.equal(a.degree,7);assert.equal(a.figures.map(f=>f.text).join(''),'7');const b=chordDisplay('G7/Bb','F');assert.deepEqual(b.bass,{text:'B♭',degree:5});assert.equal(b.degree,2);assert.equal(chordDisplay('FM7#11').bass,null);});
test('letter qualities join the baseline root while figures and slash bass keep their pitch colors',()=>{
 const major=chordDisplay('CM7');
 assert.equal(major.root,'C');
 assert.equal(major.rootSuffix,'M');
 assert.deepEqual(major.figures,[{text:'7',degree:11}]);
 const minor=chordDisplay('Em7');
 assert.equal(minor.root,'E');
 assert.equal(minor.rootSuffix,'m');
 assert.deepEqual(minor.figures,[{text:'7',degree:2}]);
 const inversion=chordDisplay('F#mM7/Bb');
 assert.equal(inversion.root,'F♯');
 assert.equal(inversion.rootSuffix,'mM');
 assert.deepEqual(inversion.figures,[{text:'7',degree:5}]);
 assert.deepEqual(inversion.bass,{text:'B♭',degree:10});
 const longMajor=chordDisplay('Cmaj7');
 assert.equal(longMajor.rootSuffix,'');
 assert.deepEqual(longMajor.figures,[{text:'maj',degree:0},{text:'7',degree:11}]);
 const capitalMajor=chordDisplay('CMaj7');
 assert.equal(capitalMajor.rootSuffix,'');
 assert.equal(capitalMajor.figures.map(f=>f.text).join(''),'Maj7');
 const minorTriad=chordDisplay('Em/G');
 assert.equal(minorTriad.rootSuffix,'m');
 assert.deepEqual(minorTriad.figures,[]);
 assert.deepEqual(minorTriad.bass,{text:'G',degree:7});
});
test('explicit Roman slash basses use outlined circled degrees without changing canonical numerals',()=>{
 const letters=['C','D','E','F','G','A','B'],degrees=['①','②','③','④','⑤','⑥','⑦'];
 for(const [i,pitch] of letters.entries()){
  const chord='G7/'+pitch,notation=roman(chord);
  const before=['I','II','III','IV','V','VI','VII'][i];
  assert.equal(notation,'V7/'+before);
  assert.deepEqual(romanDisplayParts(notation,chordDisplay(chord).bass),{numeral:'V7',bass:degrees[i],label:'V7/'+degrees[i]});
 }
 assert.deepEqual(romanDisplayParts(roman('Cm7/Bb'),chordDisplay('Cm7/Bb').bass),{numeral:'i7',bass:'♭⑦',label:'i7/♭⑦'});
 assert.deepEqual(romanDisplayParts(roman('C6/9/F#'),chordDisplay('C6/9/F#').bass),{numeral:'I6/9',bass:'♯④',label:'I6/9/♯④'});
 for(const notation of ['V7/ii','V7/II','I6/9','IΔ7']){
  assert.deepEqual(romanDisplayParts(notation,null),{numeral:notation,bass:null,label:notation});
 }
});
