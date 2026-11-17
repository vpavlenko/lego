import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {analyzeForm,sectionRows} from '../src/music/forms.mjs';
const {songs}=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8'));
test('confirmed AABA forms align repeated A vertically and append B beside the middle A',()=>{
 for(const index of [0,35,54,70,20]){const f=analyzeForm(songs[index]);assert.equal(f.pattern,'AABA');assert.ok(f.aligned);assert.deepEqual(f.sections.map(s=>[s.label,s.layoutRow]),[['A',0],['A',1],['B',1],['A',2]]);assert.equal(f.sections[0].layoutColumn,0);assert.equal(f.sections[1].layoutColumn,0);assert.equal(f.sections[3].layoutColumn,0);assert.equal(f.sections[2].layoutColumn,f.sections[1].bars);}
 const expanded=analyzeForm(songs[7]);assert.equal(expanded.pattern,'AABA');assert.equal(expanded.sections[3].bars,12);
});
test('family grouping distinguishes blues and rhythm-like structures without length-only or partial-bridge matches',()=>{
 for(const i of [24,25,26,27])assert.equal(analyzeForm(songs[i]).family,'12-bar blues');assert.notEqual(analyzeForm(songs[188]).family,'12-bar blues');
 for(const i of [82,99,100,167,179])assert.equal(analyzeForm(songs[i]).family,'Rhythm-like');for(const i of [2,94,140,192,211])assert.notEqual(analyzeForm(songs[i]).family,'Rhythm-like');
});
test('form layout preserves chronological coverage and exact chord spans for every standard',()=>{
 for(const song of songs){const form=analyzeForm(song);if(!form.aligned)continue;assert.equal(form.sections[0].start,0);assert.equal(form.sections.at(-1).end,song.bars);for(let i=1;i<form.sections.length;i++)assert.equal(form.sections[i].start,form.sections[i-1].end);
 const original=song.rows.flatMap(r=>r.chords.map(c=>({...c,start:r.startBar+c.start,end:r.startBar+c.end}))),sliced=sectionRows(song,form).flatMap(r=>r.chords.map(c=>({...c,start:r.startBar+c.start,end:r.startBar+c.end})));
 for(const c of original){const spans=sliced.filter(x=>x.symbol===c.symbol&&x.start>=c.start&&x.end<=c.end);assert.ok(spans.some(x=>x.start===c.start));assert.ok(spans.some(x=>x.end===c.end));assert.equal(spans.reduce((n,s)=>n+s.end-s.start,0),c.end-c.start);}
 }
});
