import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {realizeSong} from '../src/music/realization.mjs';
const require=createRequire(import.meta.url),{parseMidi}=require('midi-file');
const dist=new URL('../dist/',import.meta.url),json=p=>JSON.parse(fs.readFileSync(new URL(p,dist),'utf8'));
const {qualities}=JSON.parse(fs.readFileSync(new URL('../src/music/chord-vocabulary.json',import.meta.url),'utf8'));
const numeric=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};

test('all generated variant performances and MIDI files match complete source definitions exactly',()=>{
 const files=fs.readdirSync(new URL('data/brick-variants/',dist)).filter(n=>n.endsWith('.json')).sort(),index=json('data/bricks.json');
 assert.equal(files.length,index.bricks.length);assert.deepEqual(files,index.bricks.map(b=>b.slug+'.json').sort());
 const assets=new Set();let definitions=0,unknownOnly=0;
 for(const file of files){
  const brick=json('data/brick-variants/'+file);assert.equal(file,brick.slug+'.json');
  if(!brick.variants.length){
   unknownOnly++;assert.ok(brick.unresolvedStandards.length>0);assert.ok(brick.stats.unknownOccurrences>0||brick.stats.partialOccurrences>0);
   assert.equal(fs.readdirSync(new URL('midi/brick-variants/',dist)).some(n=>n.startsWith(brick.slug+'--')),false,'unresolved-only brick has an invented MIDI definition');
  }
  for(const variant of brick.variants){
   definitions++;assert.ok(variant.completeOccurrences>0);assert.ok(variant.previewSong.rows.every(row=>row.chords.every(c=>!c.clipped)));
   const fresh=realizeSong(variant.previewSong,qualities),expectedPerformance={...fresh,previewSong:variant.previewSong,source:variant.source};
   assert.deepEqual(variant.performance,expectedPerformance,brick.name+' '+variant.id);
   assert.equal(variant.midi,`./midi/brick-variants/${brick.slug}--${variant.id}.mid`);assert.ok(!assets.has(variant.midi));assets.add(variant.midi);
   const target=new URL(variant.midi,dist);assert.ok(target.pathname.startsWith(new URL('midi/brick-variants/',dist).pathname));
   const midi=parseMidi(fs.readFileSync(target));assert.equal(midi.header.ticksPerBeat,480);assert.equal(midi.tracks.length,2);
   const actual=[];
   for(const track of midi.tracks){let tick=0;const active=new Map();
    for(const event of track){assert.ok(event.deltaTime>=0);tick+=event.deltaTime;
     if(event.type==='noteOn'&&event.velocity){const key=event.channel+':'+event.noteNumber;assert.ok(!active.has(key),'overlapping MIDI pitch '+variant.midi);active.set(key,{tick,velocity:event.velocity});}
     if(event.type==='noteOff'||event.type==='noteOn'&&!event.velocity){const key=event.channel+':'+event.noteNumber,on=active.get(key);assert.ok(on,'unmatched note-off '+variant.midi);actual.push([event.channel,event.noteNumber,on.tick,tick-on.tick,on.velocity]);active.delete(key);}
    }
    assert.equal(active.size,0,'hanging MIDI note '+variant.midi);assert.equal(tick,Math.round(fresh.beats*480));
   }
   const expected=fresh.notes.map(n=>[n.voice,n.pitch,Math.round(n.start*480),Math.round(n.duration*480),n.velocity]);
   assert.deepEqual(actual.sort(numeric),expected.sort(numeric),variant.midi);
  }
  for(const standard of brick.unresolvedStandards)for(const passage of standard.passages){assert.ok(['partial','unknown'].includes(passage.status));assert.equal(passage.variantId,undefined);assert.equal(passage.performance,undefined);assert.equal(passage.midi,undefined);}
 }
 assert.ok(definitions>0);
 const onDisk=fs.readdirSync(new URL('midi/brick-variants/',dist)).filter(n=>n.endsWith('.mid')).sort();
 assert.equal(onDisk.length,definitions);assert.deepEqual(onDisk,[...assets].map(p=>p.split('/').at(-1)).sort());
});
