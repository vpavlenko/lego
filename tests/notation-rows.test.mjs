import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {notationRows} from '../src/music/notation-rows.mjs';
import {analyzeForm} from '../src/music/forms.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')),{songs}=read('dist/data/roadmaps.json');
test('short House rows use the same measure scale as full rows on desktop and mobile',()=>{
 const song=songs[80],performance=read('dist/data/performances/080.json'),rows=notationRows({song,performance});assert.deepEqual(rows.map(r=>r.style.width),['50%','75%','50%','75%','100%','50%','75%']);
 for(const mobile of [false,true])for(const row of notationRows({song,performance,mobile}))assert.equal(parseFloat(row.style.width)/((row.end-row.start)/performance.barBeats),mobile?25:12.5);
});
test('every chart preserves timed row coverage and a uniform measure scale',()=>{
 for(const song of songs){const performance=read(`dist/data/performances/${String(song.index).padStart(3,'0')}.json`);for(const mobile of [false,true]){const form=analyzeForm(song),rows=notationRows({song,performance,form,mobile});assert.equal(rows[0].start,0);assert.equal(rows.at(-1).end,performance.beats);for(let i=1;i<rows.length;i++)assert.equal(rows[i-1].end,rows[i].start);if(!form.aligned){const scales=rows.map(r=>parseFloat(r.style.width)/((r.end-r.start)/performance.barBeats));assert.ok(scales.every(scale=>Math.abs(scale-scales[0])<1e-8));}}}
});
test('each brick remains one continuous line with fixed 100px measures',()=>{const song=songs[80],performance=read('dist/data/performances/080.json'),rows=notationRows({song,performance,compact:true,continuous:true,measureWidth:100});assert.equal(rows.length,1);assert.equal(rows[0].start,0);assert.equal(rows[0].end,performance.beats);assert.equal(rows[0].style.width,3800);});
