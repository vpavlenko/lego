import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pitch,mod} from '../dist/harmony.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const references=read('src/music/melody-tonic-references.json'),manifest=read('dist/data/melody-sources.json'),songs=read('dist/data/standards.json').songs,audit=read('evidence/melody-tonic-reference-audit.json');
const core=c=>{const r=pitch(c.symbol);return new Set((c.sourceCorePitches??c.sourcePitches).map(p=>mod(p-r)));};
test('curated minor homes retain literal major source declarations and exact compiled tonic/cadence evidence',()=>{
 assert.equal(references.entries.length,5);assert.equal(references.sourceCommit,'adbe5c68ff59e20068dd754e7d227979fa628d33');let tonicEvents=0,cadences=0;
 for(const ref of references.entries){
  const entry=manifest.entries[ref.melodyId],song=songs.find(s=>s.melodyId===entry.id),tonic=pitch(ref.normalizationTonic.root);
  assert.equal(ref.sourceDeclaredKey.mode,'Major');assert.equal(ref.normalizationTonic.mode,'Minor');assert.deepEqual(entry.provenance.sourceKeySignature,ref.sourceDeclaredKey);assert.deepEqual(entry.provenance.sourceDeclaredKey,ref.sourceDeclaredKey);assert.deepEqual(entry.provenance.normalizationTonic,ref.normalizationTonic);assert.deepEqual(entry.tonic,[ref.normalizationTonic.root,'Minor']);assert.equal(song.arrangementOf,ref.canonicalSong);assert.equal(song.tonic[1],'Minor');assert.ok(ref.keyDirectives.every(k=>k.text.includes('\\major')));assert.equal(entry.provenance.sha256,ref.sourceSha256);
  const checked=e=>{const actual=entry.chords[e.index];for(const k of ['symbol','start','end','sourceLine'])assert.equal(actual[k],e[k]);return actual;};
  for(const event of ref.evidence.tonicChordEvents){const chord=checked(event),p=core(chord);assert.equal(pitch(chord.symbol),tonic);assert.ok(p.has(3)&&!p.has(4));tonicEvents++;}
  for(const {dominant,tonic:target}of ref.evidence.dominantResolutions){const d=checked(dominant),t=checked(target),p=core(d);assert.equal(target.index,dominant.index+1);assert.equal(d.end,t.start);assert.equal(pitch(d.symbol),mod(tonic+7));assert.ok(p.has(4)&&p.has(10));assert.equal(pitch(t.symbol),tonic);cadences++;}
 }
 assert.equal(tonicEvents,37);assert.equal(cadences,18);
 const beautiful=references.entries.find(r=>r.canonicalSong===15);assert.equal(beautiful.sourceVersion,'Laurent');assert.ok(beautiful.evidence.tonicChordEvents.every(c=>c.symbol==='Dm7'));
 for(const index of [3,124])assert.ok(!songs.some(s=>s.arrangementOf===index&&s.index>=474),'Ambiguous source modes stay excluded');
});
test('curated-reference decoder rejects identity changes, altered event times and unsupported mode choices',()=>{
 const ref=references.entries[0],entry=structuredClone(manifest.entries[ref.melodyId]);entry.tonic=[ref.sourceDeclaredKey.root,ref.sourceDeclaredKey.mode];
 const python=['/opt/homebrew/bin/python3.11','python3'].find(p=>spawnSync(p,['-c','import tomllib'],{encoding:'utf8'}).status===0);assert.ok(python);
 const code=`import sys,json,copy,importlib.util\nspec=importlib.util.spec_from_file_location('imp',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nd=json.load(sys.stdin);e=d['entry'];r=d['reference'];o=d['original'];before=json.dumps([e['notes'],e['chords']]);m.apply_harmonic_reference(e,r,o);assert json.dumps([e['notes'],e['chords']])==before\nfor kind in range(4):\n e=copy.deepcopy(d['entry']);r=copy.deepcopy(d['reference'])\n if kind==0:r['sourceSha256']='0'*64\n if kind==1:r['evidence']['tonicChordEvents'][0]['start']+=0.25\n if kind==2:r['normalizationTonic']['mode']='Major'\n if kind==3:e['provenance']['sourceKeySignature']['root']='C#'\n try:m.apply_harmonic_reference(e,r,o)\n except ValueError:continue\n raise AssertionError('Unsafe harmonic override accepted')\nprint('passed')`;
 const result=spawnSync(python,['-c',code,new URL('scripts/import-openbook-melodies.py',root).pathname],{input:JSON.stringify({entry,reference:ref,original:songs[ref.canonicalSong]}),encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/passed/);
});
test('nine new arrangements keep exact source notes/harmony and all 474 earlier performance bytes',()=>{
 const added=songs.filter(s=>s.index>=474&&s.index<483);assert.equal(added.length,9);let notes=0;
 for(const song of added){
  const entry=manifest.entries[song.melodyId],performance=read(`dist/data/performances/${song.index}.json`),melody=performance.notes.filter(n=>n.voice===1);assert.equal(performance.melody.beatOffset,0);assert.equal(performance.beats,entry.totalBeats);assert.equal(melody.length,entry.notes.length);assert.equal(performance.chords.length,entry.chords.length);
  entry.notes.forEach((n,i)=>{const m=melody.find(m=>m.id===`melody:${entry.id}:${i}`);assert.equal(m.start,n.start);assert.equal(m.duration,n.duration);assert.equal(m.pitch,n.pitch+performance.melody.transpose);});
  entry.chords.forEach((c,i)=>{assert.ok(Math.abs(c.start-performance.chords[i].start)<1e-7);assert.ok(Math.abs(c.end-performance.chords[i].end)<1e-7);});notes+=melody.length;
 }
 assert.equal(notes,1284);assert.equal(Object.keys(audit.preservation.baselinePerformanceHashes).length,474);
 for(const [name,hash]of Object.entries(audit.preservation.baselinePerformanceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('dist/data/performances/'+name,root))).digest('hex'),hash,name);
});
