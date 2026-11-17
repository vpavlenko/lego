import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const aliases=read('src/music/melody-title-aliases.json'),data=read('dist/data/melody-sources.json'),songs=read('dist/data/standards.json').songs,audit=read('evidence/melody-title-alias-audit.json');
test('explicit source title aliases identify compositions while retaining the real source title, composer and complete arrangement',()=>{
 assert.equal(aliases.sourceCommit,'adbe5c68ff59e20068dd754e7d227979fa628d33');assert.equal(aliases.entries.length,18);assert.equal(new Set(aliases.entries.map(a=>a.sourcePath)).size,18);
 const added=songs.filter(s=>s.index>=458);assert.equal(added.length,16);assert.equal(songs.filter(s=>s.arrangementOf===undefined).length,269);
 for(const song of added){
  const entry=data.entries[song.melodyId],alias=aliases.entries.find(a=>a.sourcePath===entry.provenance.path),proof=entry.provenance.compositionIdentity;assert.ok(alias,song.title);
  assert.equal(song.arrangementOf,alias.canonicalSong);assert.equal(songs[song.arrangementOf].title,alias.canonicalTitle);assert.equal(proof.canonicalSong,alias.canonicalSong);assert.equal(entry.compositionTitle,alias.canonicalTitle);
  assert.equal(song.title,alias.sourceTitle);assert.equal(entry.provenance.titleMetadata.printedTitle,alias.sourceTitle);assert.equal(song.composer,alias.sourceComposer);assert.equal(entry.provenance.sha256,alias.sourceSha256);assert.equal(entry.tonic[1],songs[song.arrangementOf].tonic[1]);
  const performance=read(`dist/data/performances/${song.index}.json`),melody=performance.notes.filter(n=>n.voice===1);assert.equal(performance.melody.beatOffset,0);assert.equal(performance.beats,entry.totalBeats);assert.equal(melody.length,entry.notes.length);
  entry.notes.forEach((n,i)=>{const m=melody.find(m=>m.id===`melody:${entry.id}:${i}`);assert.equal(m.start,n.start);assert.equal(m.duration,n.duration);assert.equal(m.pitch,n.pitch+performance.melody.transpose);});
  assert.equal(performance.chords.length,entry.chords.length,song.title+' source attacks are not duplicated at row cuts');entry.chords.forEach((c,i)=>{assert.ok(Math.abs(performance.chords[i].start-c.start)<1e-7);assert.ok(Math.abs(performance.chords[i].end-c.end)<1e-7);});
 }
 assert.equal(added.reduce((n,s)=>n+data.entries[s.melodyId].notes.length,0),2621);
 const rejected=audit.sourceCompilation.records.filter(r=>!r.selected);assert.equal(rejected.length,2);assert.ok(rejected.some(r=>r.song===72));assert.ok(rejected.some(r=>r.song===133));
});
test('all 458 prior performances retain their exact source bytes after the title-alias admissions',()=>{
 const baseline=audit.preservation.baselinePerformanceHashes;assert.equal(Object.keys(baseline).length,458);
 for(const [name,expected]of Object.entries(baseline))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('dist/data/performances/'+name,root))).digest('hex'),expected,name);
});
