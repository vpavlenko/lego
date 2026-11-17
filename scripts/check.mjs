import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pitch,mod,transposeRoot,transposeChord,roman,signedInterval} from '../dist/harmony.mjs';
const base=fileURLToPath(new URL('../dist/',import.meta.url));
const {songs}=JSON.parse(readFileSync(base+'data/roadmaps.json','utf8'));
assert.equal(songs.length,242);
assert.equal(transposeChord('F#m7b5/B','B'),'Gm7b5/C');
assert.equal(transposeChord('Cm7/G','Eb'),'Am7/E');
assert.equal(transposeChord('Gm7/C','G'),'Cm7/F');
assert.equal(roman('Dm7'),'ii7');assert.equal(roman('G7'),'V7');assert.equal(roman('CM7'),'IΔ7');assert.equal(roman('Bm7b5'),'viiø7');
assert.equal(roman('Am7','G'),'ii7');assert.equal(roman('Dm7b5','C'),'iiø7');assert.equal(roman('G7','C'),'V7');
assert.equal(signedInterval('C','Bb'),-2);assert.equal(signedInterval('Ab','C'),4);assert.equal(signedInterval('C','C'),0);
let chords=0,joins=0,clipped=0;
for(const [i,s] of songs.entries()){
 assert.equal(s.index,i);assert.ok(s.title);assert.ok(s.rows.length);assert.ok(existsSync(base+'source/'+s.image));assert.ok(s.page>=2&&s.page<=145);assert.equal(transposeRoot(s.tonic[0],s.tonic[0]),'C');
 let bars=0;
 for(const row of s.rows){
  assert.equal(row.startBar,bars);bars+=row.bars;assert.ok(row.keys.length);assert.ok(row.chords.length);
  for(const c of row.chords){
   chords++;if(c.clipped)clipped++;
   assert.ok(c.end>c.start,`${s.title}: ${c.symbol} has no duration`);assert.ok(c.start>=0&&c.end<=row.bars+.01,`${s.title}: invalid ${c.symbol} position ${c.start}–${c.end}/${row.bars}`);
   const result=transposeChord(c.symbol,s.tonic[0]);assert.equal(pitch(result),mod(pitch(c.symbol)-pitch(s.tonic[0])),`${s.title}: ${c.symbol}`);assert.ok(roman(result));
   for(const key of row.keys)assert.ok(roman(result,transposeRoot(key.root,s.tonic[0])));
  }
  for(const j of row.joins){joins++;assert.equal(j.delta,signedInterval(j.from,j.to));assert.ok(j.at>=0&&j.at<=row.bars);assert.ok(j.name);}
 }
 assert.equal(bars,s.bars);
}
console.log(JSON.stringify({songs:songs.length,chords,joins,clipped,status:'passed'}));
