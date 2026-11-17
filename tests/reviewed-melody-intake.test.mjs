import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeMidi} from 'midi-file';
import {importReviewedMelodies,fingerprint,notesFingerprint,byteHash} from '../scripts/import-reviewed-melodies.mjs';
import {validateReviewedEntry} from '../src/music/reviewed-melodies.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'reviewed-intake-')),files=['dist/data/roadmaps.json','dist/data/additional-standards.json','dist/data/standards.json','dist/data/melody-sources.json','dist/data/openbook-melodies.json','dist/data/discovered-bricks.json','src/music/chord-vocabulary.json','src/music/melody-tonic-references.json','src/music/melody-primary-voices.json','evidence/openbook-melody-audit.json','evidence/melody-source-intake.json'];
 for(const file of files){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(project,file),path.join(root,file));}
 const canonicalSongs=read(path.join(root,'dist/data/standards.json')).songs,canonical=canonicalSongs[0],sourceBytes=Buffer.from('Pinned compiler source fixture\n'),sha=byteHash(sourceBytes),entry={id:'reviewed-fixture',title:canonical.title,compositionTitle:canonical.title,composer:canonical.composer,normalizedTitle:canonical.title.toLowerCase().replace(/[^a-z]/g,''),tonic:['C','Major'],meter:[4,4],barBeats:4,bars:1,totalBeats:4,pickupBeats:0,notes:[{pitch:60,start:0,duration:2,velocity:90},{pitch:64,start:2,duration:2,velocity:90}],chords:[{symbol:'C',start:0,end:2,sourceSymbol:'c2',sourceLine:1,sourcePitches:[48,52,55]},{symbol:'G7',start:2,end:4,sourceSymbol:'g2:7',sourceLine:1,sourcePitches:[55,59,62,65]}],midi:'melodies/reviewed-fixture.mid',provenance:{format:'LilyPond',path:'src/fixture.ly.tera',sha256:sha,sourceVersion:'Fixture',repositoryCommit:'1'.repeat(40),url:'https://example.org/fixture.ly.tera',sourceKeySignature:{root:'C',mode:'Major'},titleMetadata:{selectedFrom:'source attributes.title',printedTitle:canonical.title},midiMeterEvents:[{beat:0,meter:[4,4],metronome:24,thirtyseconds:8}]}};
 const midiBytes=Buffer.from(writeMidi({header:{format:0,numTracks:1,ticksPerBeat:100},tracks:[[{deltaTime:0,type:'programChange',channel:0,programNumber:65},{deltaTime:0,type:'timeSignature',numerator:4,denominator:4,metronome:24,thirtyseconds:8},{deltaTime:0,type:'noteOn',channel:0,noteNumber:60,velocity:90},{deltaTime:200,type:'noteOff',channel:0,noteNumber:60,velocity:0},{deltaTime:0,type:'noteOn',channel:0,noteNumber:64,velocity:90},{deltaTime:200,type:'noteOff',channel:0,noteNumber:64,velocity:0},{deltaTime:0,type:'endOfTrack'}]]}));
 const proof={status:'PASS',melodyId:entry.id,sourceSha256:sha,notesSha256:notesFingerprint(entry.notes),noteCount:2,totalBeats:4},proofBytes=Buffer.from(JSON.stringify(proof));
 const review={melodyId:entry.id,canonicalSong:canonical.index,canonicalTitle:canonical.title,sourcePath:entry.provenance.path,sourceSha256:sha,sourceVersion:'Fixture',sourceCommit:'1'.repeat(40),entrySha256:fingerprint(entry),notesSha256:notesFingerprint(entry.notes),noteCount:2,totalBeats:4,sourceFile:'fixture.ly.tera',midiFile:'fixture.mid',midiSha256:byteHash(midiBytes),proofFile:'proof.json',proofSha256:byteHash(proofBytes)};
 for(const [file,value]of [['fixture.ly.tera',sourceBytes],['fixture.mid',midiBytes],['proof.json',proofBytes],['candidates.json',JSON.stringify({entries:[entry]})],['review.json',JSON.stringify({version:1,entries:[review]})]])fs.writeFileSync(path.join(root,file),value);
 return {root,entry,review,proof,canonicalSongs,sourceBytes,midiBytes,opts:{root,inputPaths:[path.join(root,'candidates.json')],reviewPath:path.join(root,'review.json'),dictionaryPath:path.join(project,'../Impro-Visor/vocab/My.dictionary')},close(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('review pins exact source, compiler proof, melody timing/velocity, GM65 bytes and canonical identity',()=>{
 const f=fixture();try{const options={canonicalSongs:f.canonicalSongs,sourceBytes:f.sourceBytes,midiBytes:f.midiBytes,proof:f.proof};assert.equal(validateReviewedEntry(f.entry,f.review,options).midi.notes,2);
 for(const patch of [{canonicalSong:1},{sourcePath:'different.ly'},{entrySha256:'0'.repeat(64)},{notesSha256:'0'.repeat(64)},{midiSha256:'0'.repeat(64)}])assert.throws(()=>validateReviewedEntry(f.entry,{...f.review,...patch},options));
 assert.throws(()=>validateReviewedEntry(f.entry,f.review,{...options,sourceBytes:Buffer.from('changed')}));assert.throws(()=>validateReviewedEntry(f.entry,f.review,{...options,proof:{...f.proof,totalBeats:8}}));
 const altered=structuredClone(f.entry);altered.notes[1].start=1;const review={...f.review,entrySha256:fingerprint(altered),notesSha256:notesFingerprint(altered.notes)},proof={...f.proof,notesSha256:review.notesSha256};assert.throws(()=>validateReviewedEntry(altered,review,{...options,proof}),/polyphonic/);
 }finally{f.close();}
});
test('only supplied IDs enter the batch; old 486 chart identities, pool entries and performance files are preserved',()=>{
 const f=fixture();try{const additional=read(path.join(f.root,'dist/data/additional-standards.json')).songs,priorPool=read(path.join(f.root,'dist/data/melody-sources.json')).entries,unused={...structuredClone(f.entry),id:'unreviewed-unused'};const pool=read(path.join(f.root,'dist/data/openbook-melodies.json'));pool.entries.push(unused);fs.writeFileSync(path.join(f.root,'dist/data/openbook-melodies.json'),JSON.stringify(pool));
 const sentinel=path.join(f.root,'dist/data/performances/000.json');fs.mkdirSync(path.dirname(sentinel),{recursive:true});fs.writeFileSync(sentinel,'original-performance');const before=fs.readFileSync(path.join(f.root,'dist/data/additional-standards.json'));
 const dry=importReviewedMelodies(f.opts);assert.equal(dry.dryRun,true);assert.equal(dry.added,1);assert.deepEqual(fs.readFileSync(path.join(f.root,'dist/data/additional-standards.json')),before);
 const result=importReviewedMelodies({...f.opts,apply:true});assert.deepEqual(result.ids,[f.entry.id]);assert.equal(result.indexStart,486);const after=read(path.join(f.root,'dist/data/additional-standards.json')).songs;assert.deepEqual(after.slice(0,additional.length),additional);assert.equal(after.at(-1).arrangementOf,0);assert.equal(after.at(-1).index,486);assert.equal(after.at(-1).sourceTimeline,'compiled-quarter-beats');assert.equal(fs.readFileSync(sentinel,'utf8'),'original-performance');
 const merged=read(path.join(f.root,'dist/data/melody-sources.json')).entries;for(const [id,entry]of Object.entries(priorPool))assert.deepEqual(merged[id],entry,id);assert.ok(!merged[unused.id]);assert.ok(read(path.join(f.root,'dist/data/openbook-melodies.json')).entries.some(e=>e.id===unused.id));assert.ok(!after.some(s=>s.melodyId===unused.id));assert.deepEqual(importReviewedMelodies({...f.opts,apply:true}).alreadyPresent,[f.entry.id]);
 }finally{f.close();}
});
test('a bad proof or extra review cannot partially write a batch',()=>{
 const f=fixture();try{const before=fs.readFileSync(path.join(f.root,'dist/data/additional-standards.json'));fs.writeFileSync(path.join(f.root,'proof.json'),JSON.stringify({...f.proof,status:'FAILED'}));assert.throws(()=>importReviewedMelodies({...f.opts,apply:true}),/proof bytes/);assert.deepEqual(fs.readFileSync(path.join(f.root,'dist/data/additional-standards.json')),before);
 fs.writeFileSync(path.join(f.root,'review.json'),JSON.stringify({entries:[f.review,{...f.review,melodyId:'unrequested'}]}));assert.throws(()=>importReviewedMelodies({...f.opts,apply:true}),/IDs differ/);assert.deepEqual(fs.readFileSync(path.join(f.root,'dist/data/additional-standards.json')),before);
 }finally{f.close();}
});
test('mode overrides and polyphonic voice choices require permanent exact references',()=>{
 const f=fixture();try{const options={canonicalSongs:f.canonicalSongs,sourceBytes:f.sourceBytes,midiBytes:f.midiBytes,proof:f.proof};const e=structuredClone(f.entry);e.provenance.sourceDeclaredKey={root:'A',mode:'Minor'};const review={...f.review,entrySha256:fingerprint(e)};assert.throws(()=>validateReviewedEntry(e,review,options),/pinned reference/);
 const voice=structuredClone(f.entry);voice.provenance.curatedPrimaryVoice={events:[{start:0,duration:2,selectedPitch:60,omittedPitches:[48]}],evidence:{source:'review'}};assert.throws(()=>validateReviewedEntry(voice,{...f.review,entrySha256:fingerprint(voice)},options),/primary voice/);
 const ref={melodyId:voice.id,sourcePath:voice.provenance.path,sourceSha256:voice.provenance.sha256,sourceVersion:voice.provenance.sourceVersion,...voice.provenance.curatedPrimaryVoice};assert.equal(validateReviewedEntry(voice,{...f.review,entrySha256:fingerprint(voice)},{...options,primaryVoiceReferences:[ref]}).midi.notes,2);
 }finally{f.close();}
});
