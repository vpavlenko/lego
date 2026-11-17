#!/usr/bin/env node
/**
 * Append only an explicitly reviewed batch, never every unused source entry.
 * node scripts/import-reviewed-melodies.mjs --input candidates.json --review review.json --apply
 * Review entries pin melodyId/canonicalSong/canonicalTitle, sourcePath/sourceSha256/
 * sourceVersion/sourceCommit, entrySha256, notesSha256/noteCount/totalBeats,
 * sourceFile, midiFile/midiSha256 and proofFile/proofSha256. Each JSON proof is
 * {status:'PASS',melodyId,sourceSha256,notesSha256,noteCount,totalBeats,...}.
 * Paths are resolved relative to the review manifest; source and MIDI bytes are
 * checked before any file is written. Default is dry-run. --project and
 * --dictionary allow an isolated checkout/fixture without changing cwd.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareAdditionalStandards} from './import-standards.mjs';
import {parseBrickDictionary} from '../src/music/brick-parser.mjs';
import {fingerprint,notesFingerprint,byteHash,validateReviewedEntry} from '../src/music/reviewed-melodies.mjs';
export {fingerprint,notesFingerprint,byteHash} from '../src/music/reviewed-melodies.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const entriesOf=data=>Array.isArray(data.entries)?data.entries:Object.values(data.entries??{});
const mergeUnique=(old,added,key)=>{const result=new Map(old.map(value=>[key(value),value]));for(const value of added){const id=key(value),prior=result.get(id);if(prior&&fingerprint(prior)!==fingerprint(value))throw Error('Conflicting existing source identity '+id);if(!prior)result.set(id,value);}return [...result.values()];};
function mergeDictionary(old,added){const byName=new Map(old.map(value=>[value.name,structuredClone(value)]));for(const value of added){const prior=byName.get(value.name);if(!prior){byName.set(value.name,value);continue;}prior.definitions=mergeUnique(prior.definitions,value.definitions,d=>d.id);prior.standards=mergeUnique(prior.standards,value.standards,s=>s.song);prior.support=new Set(prior.standards.map(s=>s.composition)).size;}return [...byName.values()].sort((a,b)=>b.support-a.support||a.name.localeCompare(b.name));}
export function importReviewedMelodies({root=project,inputPaths,reviewPath,dictionaryPath=path.join(root,'../Impro-Visor/vocab/My.dictionary'),apply=false}={}){
 if(!inputPaths?.length||!reviewPath)throw Error('Supply --input and --review');
 const file=relative=>path.join(root,relative),optional=(relative,fallback)=>fs.existsSync(file(relative))?read(file(relative)):fallback,review=read(reviewPath),base=path.dirname(path.resolve(reviewPath)),resolve=relative=>path.resolve(base,relative);
 const input=inputPaths.flatMap(input=>entriesOf(read(input))),reviews=review.entries??[];if(new Set(input.map(e=>e.id)).size!==input.length||new Set(reviews.map(e=>e.melodyId)).size!==reviews.length)throw Error('Duplicate reviewed source ID');
 if(input.length!==reviews.length||input.some(e=>!reviews.some(r=>r.melodyId===e.id)))throw Error('Candidate/review IDs differ; no implicit source intake');
 const originals=read(file('dist/data/roadmaps.json')).songs,priorData=read(file('dist/data/additional-standards.json')),prior=priorData.songs,runtime=optional('dist/data/standards.json',{songs:[...originals,...prior]}).songs,qualities=read(file('src/music/chord-vocabulary.json')).qualities,merged=read(file('dist/data/melody-sources.json')),openbook=read(file('dist/data/openbook-melodies.json')),openAudit=read(file('evidence/openbook-melody-audit.json')),intake=optional('evidence/melody-source-intake.json',{records:{records:[]}}),discovery=read(file('dist/data/discovered-bricks.json'));
 const harmonic=optional('src/music/melody-tonic-references.json',{entries:[]}).entries,primary=optional('src/music/melody-primary-voices.json',{entries:[]}).entries;
 const candidates=[],accepted=[],alreadyPresent=[],midiCopies=[],proofCopies=[];
 for(const sourceEntry of input){
  const record=reviews.find(r=>r.melodyId===sourceEntry.id);for(const key of ['sourceFile','midiFile','proofFile','proofSha256'])if(typeof record[key]!=='string')throw Error('Review file identity missing: '+key);
  const sourceBytes=fs.readFileSync(resolve(record.sourceFile)),midiBytes=fs.readFileSync(resolve(record.midiFile)),proofBytes=fs.readFileSync(resolve(record.proofFile));if(byteHash(proofBytes)!==record.proofSha256)throw Error('Reviewed compiler proof bytes differ');
  const proof=JSON.parse(proofBytes),validated=validateReviewedEntry(sourceEntry,record,{canonicalSongs:runtime,sourceBytes,midiBytes,proof,harmonicReferences:harmonic,primaryVoiceReferences:primary});
  const entry=structuredClone(sourceEntry);entry.compositionTitle=validated.canonical.title;entry.midi='melodies/'+entry.id+'.mid';
  const existing=merged.entries[entry.id];if(existing&&fingerprint(existing)!==fingerprint(entry))throw Error('Existing melody source changed: '+entry.id);
  if(prior.some(song=>song.melodyId===entry.id)){if(!existing)throw Error('Existing arrangement lacks its source');alreadyPresent.push(entry.id);continue;}
  candidates.push(entry);accepted.push({melodyId:entry.id,canonicalSong:validated.canonical.index,canonicalTitle:validated.canonical.title,sourcePath:record.sourcePath,sourceSha256:record.sourceSha256,sourceVersion:record.sourceVersion,inputEntrySha256:record.entrySha256,entrySha256:fingerprint(entry),notesSha256:notesFingerprint(entry.notes),noteCount:entry.notes.length,totalBeats:entry.totalBeats,midiSha256:record.midiSha256,proofSha256:record.proofSha256,proof:'evidence/reviewed-melody-proofs/'+entry.id+'.json'});
  midiCopies.push([file('dist/melodies/'+entry.id+'.mid'),midiBytes]);proofCopies.push([file('evidence/reviewed-melody-proofs/'+entry.id+'.json'),proofBytes]);
 }
 const result=prepareAdditionalStandards(candidates,{originalSongs:originals,priorSongs:prior,dictionary:parseBrickDictionary(fs.readFileSync(dictionaryPath,'utf8')),qualities,existingMatches:merged.existingMatches??[]});
 if(result.audit.rejected.length||result.songs.length!==candidates.length)throw Error('Reviewed batch rejected: '+JSON.stringify(result.audit.rejected));
 const expected=new Set(accepted.map(r=>r.melodyId));for(const song of result.songs){const record=accepted.find(r=>r.melodyId===song.melodyId);if(!expected.has(song.melodyId)||song.arrangementOf!==record.canonicalSong)throw Error('Reviewed arrangement identity changed');}
 const songs=[...prior,...result.songs];if(songs.some((song,i)=>song.index!==242+i)||fingerprint(songs.slice(0,prior.length))!==fingerprint(prior))throw Error('Previous chart addresses/source data changed');
 if(!candidates.length)return {added:0,alreadyPresent,dryRun:!apply,ids:[]};
 const all=mergeUnique(Object.values(merged.entries),candidates,e=>e.id),lily=candidates.filter(e=>e.provenance.format==='LilyPond'),other=candidates.filter(e=>e.provenance.format!=='LilyPond'),openEntries=mergeUnique(entriesOf(openbook),lily,e=>e.id),otherData=optional('dist/data/reviewed-melodies.json',{version:1,timeUnit:'quarter-note',pitchBasis:'source',sources:[],entries:[]}),otherEntries=mergeUnique(entriesOf(otherData),other,e=>e.id);
 const summary={version:1,added:result.songs.length,indexStart:result.audit.indexStart,ids:accepted.map(r=>r.melodyId),arrangements:result.songs.map(s=>({song:s.index,canonicalSong:s.arrangementOf,melodyId:s.melodyId})),reviews:accepted,priorCharts:242+prior.length,priorAdditionalSha256:fingerprint(prior),priorPoolEntries:Object.keys(merged.entries).length,priorPoolEntriesSha256:fingerprint(merged.entries)};
 const journal=optional('evidence/reviewed-melody-intake.json',{version:1,batches:[]});journal.batches.push(summary);
 const auditEntries=mergeUnique(openAudit.entries,lily.map(e=>{const r=accepted.find(r=>r.melodyId===e.id);return{id:e.id,title:e.title,originalSong:r.canonicalSong,originalBars:runtime[r.canonicalSong].bars,sourceBars:e.bars,notes:e.notes.length,chords:e.chords.length,provenance:e.provenance};}),e=>e.id);
 const nextOpenAudit={...openAudit,counts:{...openAudit.counts,validatedArrangements:openEntries.length,notes:openEntries.reduce((n,e)=>n+e.notes.length,0)},entries:auditEntries,excludedAttempts:(openAudit.excludedAttempts??[]).filter(r=>!lily.some(e=>e.id===r.id)),reviewedBatches:[...(openAudit.reviewedBatches??[]),{ids:lily.map(e=>e.id),review:'evidence/reviewed-melody-intake.json'}]};
 const allRecords=mergeUnique(intake.records?.records??[],result.audit.records,r=>r.melodyId).sort((a,b)=>a.song-b.song),nextIntake={...intake,totalAdditionalCharts:songs.length,importedCharts:(intake.importedCharts??0)+result.songs.length,attachedCompositions:new Set([...(merged.existingMatches??[]).map(m=>m.song),...songs.map(s=>s.arrangementOf??s.index)]).size,reviewedBatches:[...(intake.reviewedBatches??[]),{ids:summary.ids,indexStart:summary.indexStart,added:summary.added}],records:{...intake.records,records:allRecords}};
 const writes=[
  [file('dist/data/openbook-melodies.json'),{...openbook,entries:openEntries}],
  [file('dist/data/melody-sources.json'),{...merged,entries:Object.fromEntries(all.map(e=>[e.id,e]))}],
  [file('dist/data/additional-standards.json'),{...priorData,songs}],
  [file('dist/data/discovered-bricks.json'),{...discovery,patterns:mergeUnique(discovery.patterns,result.patterns,p=>p.id),dictionaryAdditions:mergeDictionary(discovery.dictionaryAdditions,result.dictionaryAdditions)}],
  [file('evidence/openbook-melody-audit.json'),nextOpenAudit],
  [file('evidence/melody-source-intake.json'),nextIntake],
  [file('evidence/reviewed-melody-intake.json'),journal]
 ];if(other.length)writes.push([file('dist/data/reviewed-melodies.json'),{...otherData,entries:otherEntries}]);
 if(apply){for(const [target,data]of writes){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data));}for(const [target,bytes]of [...midiCopies,...proofCopies]){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}}
 return {...summary,alreadyPresent,dryRun:!apply};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),values=key=>args.flatMap((a,i)=>a===key?[args[i+1]]:[]),arg=(key,fallback)=>values(key)[0]??fallback;
 try{const result=importReviewedMelodies({root:path.resolve(arg('--project',project)),inputPaths:values('--input').map(p=>path.resolve(p)),reviewPath:path.resolve(arg('--review','')),dictionaryPath:path.resolve(arg('--dictionary',path.join(path.resolve(arg('--project',project)),'../Impro-Visor/vocab/My.dictionary'))),apply:args.includes('--apply')});console.log(JSON.stringify(result));}catch(error){console.error(error.message);process.exitCode=1;}
}
