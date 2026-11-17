import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {visibleAnalysis} from '../src/music/visible-analysis.mjs';
import {realizeSong} from '../src/music/realization.mjs';
import {attachMelody} from '../src/music/melody.mjs';
import {encodeMidi} from '../src/music/midi.mjs';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const originals=read('../dist/data/roadmaps.json').songs;
const additional=read('../dist/data/additional-standards.json').songs;
const sourceSongs=[...originals,...additional];
const automatic=song=>/dictionary-parser|repeated-source-pattern|first-chord-reference/.test(song.provenance?.analysisBasis??'');
const automaticIds=new Set(sourceSongs.filter(automatic).map(song=>song.index));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function musicalSource({bricks,rows,...song}){return {...song,rows:rows.map(({bricks,keys,joins,...row})=>row)};}
function publicData(name){return read('../dist/data/'+name+'.json');}
function assertNoAutomaticReferences(value,label){
 if(!value||typeof value!=='object')return;
 if(Number.isInteger(value.song))assert.ok(!automaticIds.has(value.song),`${label}: automatic song ${value.song}`);
 if(value.previewSong)assert.ok(!automaticIds.has(value.previewSong.index),`${label}: automatic preview ${value.previewSong.index}`);
 for(const child of Object.values(value))assertNoAutomaticReferences(child,label);
}

test('visible analysis preserves every chart musical/source field and never edits its source input',()=>{
 const before=JSON.stringify(sourceSongs);
 freeze(sourceSongs);
 for(const source of sourceSongs){
  const visible=visibleAnalysis(source);
  assert.deepEqual(musicalSource(visible),musicalSource(source),source.title+' '+source.index);
  if(automatic(source)){
   assert.deepEqual(visible.bricks,[]);
   for(const row of visible.rows){
    assert.deepEqual(row.bricks,[]);assert.deepEqual(row.joins,[]);
    assert.deepEqual(row.keys,[{start:0,end:row.bars,root:source.tonic[0],mode:source.tonic[1],basis:'source-reference'}]);
   }
  }
 }
 assert.equal(JSON.stringify(sourceSongs),before);
});

test('all 242 printed roadmaps retain their source keys, joins and brick spans',()=>{
 assert.equal(originals.length,242);
 for(const source of originals){
  const visible=visibleAnalysis(source);
  assert.deepEqual(visible.rows,source.rows,source.title);
  for(let ri=0;ri<source.rows.length;ri++){
   assert.deepEqual(visible.rows[ri].keys,source.rows[ri].keys);
   assert.deepEqual(visible.rows[ri].joins,source.rows[ri].joins);
  }
 }
});

test('automatic basis markers are excluded even in otherwise sourced chart rows',()=>{
 const source=structuredClone(originals[4]),row=source.rows[0];
 row.bricks.push({start:7,end:8,name:'Automatic',basis:'repeated-source-pattern'});
 row.joins.push({at:3,from:'C',to:'F',delta:5,basis:'dictionary-parser'});
 row.keys.push({start:3,end:4,root:'F',mode:'Major',basis:'first-chord-reference'});
 const visible=visibleAnalysis(freeze(source));
 assert.deepEqual(visible.rows[0].bricks,originals[4].rows[0].bricks);
 assert.deepEqual(visible.rows[0].joins,originals[4].rows[0].joins);
 assert.deepEqual(visible.rows[0].keys,originals[4].rows[0].keys);
});

test('published standards and tonal contexts contain no automatic analyses',()=>{
 const songs=publicData('standards').songs,changes=publicData('modulations').changes;
 assert.equal(songs.length,sourceSongs.length);assert.equal(changes.length,songs.length);
 assert.ok(automaticIds.size>0);
 for(const source of sourceSongs){
  const song=songs[source.index];
  assert.deepEqual(musicalSource(song),musicalSource(source),source.title+' '+source.index);
  if(automaticIds.has(source.index)){
   assert.deepEqual(song.bricks,[]);
   assert.ok(song.rows.every(row=>!row.bricks.length&&!row.joins.length));
   assert.ok(song.rows.every(row=>row.keys.length===1&&row.keys[0].root===song.tonic[0]&&row.keys[0].mode===song.tonic[1]));
   assert.deepEqual(changes[source.index].map(({beat,tonic,root,join=false})=>({beat,tonic,root,join})),[{beat:0,tonic:0,root:'C',join:false}],source.title);
  }else for(let ri=0;ri<source.rows.length;ri++){
   assert.deepEqual(song.rows[ri].keys,source.rows[ri].keys);
   assert.deepEqual(song.rows[ri].joins,source.rows[ri].joins);
  }
 }
});

test('catalogue, source index, cadence diagrams and every brick variant exclude automatic usages',()=>{
 for(const name of ['source-bricks','bricks','atlas','cadences'])assertNoAutomaticReferences(publicData(name),name);
 const bricks=publicData('bricks').bricks;
 assert.ok(bricks.length>0);
 for(const brick of bricks){
  assert.ok(brick.standards.every(match=>!automaticIds.has(match.song)),brick.slug);
  assert.equal(brick.standardCount,new Set(brick.standards.map(match=>sourceSongs[match.song].arrangementOf??match.song)).size,brick.slug);
 }
 for(const directory of ['brick-variants','brick-performances'])for(const file of fs.readdirSync(new URL('../dist/data/'+directory+'/',import.meta.url)).filter(name=>name.endsWith('.json'))){
  assertNoAutomaticReferences(publicData(directory+'/'+file.slice(0,-5)),directory+'/'+file);
 }
});

test('Alice keeps the printed Autumn Leaves opening while both melody arrangements are unbricked',()=>{
 const songs=publicData('standards').songs,changes=publicData('modulations').changes;
 assert.ok(songs[4].rows[0].bricks.some(brick=>brick.name==='Autumn Leaves Opening'&&brick.start===0&&brick.end===7));
 for(const index of [242,274]){
  assert.equal(songs[index].arrangementOf,4);
  assert.deepEqual(songs[index].rows.flatMap(row=>row.bricks),[]);
  assert.deepEqual(changes[index].map(({beat,tonic,root})=>({beat,tonic,root})),[{beat:0,tonic:0,root:'C'}]);
 }
});

test('hiding automatic analyses preserves every original note, chord onset, melody and MIDI export',()=>{
 const qualities=read('../src/music/chord-vocabulary.json').qualities;
 const melodies=publicData('melody-sources'),entries=new Map(Object.values(melodies.entries).map(entry=>[entry.id,entry]));
 const matches=new Map((melodies.existingMatches??[]).map(match=>[match.song,match]));
 for(const source of sourceSongs){
  const id=String(source.index).padStart(3,'0'),actual=publicData('performances/'+id),alignment=matches.get(source.index);
  const expected=attachMelody(realizeSong(source,qualities),source,entries.get(source.melodyId??alignment?.melodyId),source.melodyId?null:alignment);
  for(const field of ['notes','chords','beats','barBeats','rows','meter','measureMap','midiPPQ','melody','voices'])assert.deepEqual(actual[field],expected[field],source.title+' '+field);
  assert.deepEqual(fs.readFileSync(new URL('../dist/midi/'+id+'.mid',import.meta.url)),Buffer.from(encodeMidi(actual)),source.title+' MIDI');
 }
});
