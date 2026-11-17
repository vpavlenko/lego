#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readImprovisorLeadsheet,parseImprovisorMelody,isExplicitHead,improvisorTonic} from '../src/music/improvisor-melody.mjs';
import {normalizeMelodyTitle,exactMelodyMatch} from './import-melodies.mjs';
import {encodeMidi} from '../src/music/midi.mjs';

const project=fileURLToPath(new URL('../',import.meta.url)),COMMIT='550bbb554962249aceb0e82a72142e3e5b3c0d4a',REPOSITORY='https://github.com/Impro-Visor/Impro-Visor';
const sha=value=>createHash('sha256').update(value).digest('hex');
const slug=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const baseTitle=title=>title.replace(/\s*\([^)]*\)\s*$/,'').trim();
function filesUnder(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?filesUnder(path.join(dir,item.name)):item.name.endsWith('.ls')?[path.join(dir,item.name)]:[]).sort();}
const normalize=normalizeMelodyTitle;
function classify(part,melody,relative){
 if(!melody.notes.length)return 'rest-only';
 if(isExplicitHead(part))return 'explicit-head';
 if(melody.notes.length<8)return 'placeholder-or-fragment';
 if(relative.startsWith('leadsheets/transcriptions/'))return 'transcription-not-head';
 if(relative.startsWith('leadsheets/solos/'))return 'solo-not-head';
 if(relative.startsWith('leadsheets/exercises/')||/grammar|transform|deep learning|guide|gt line|impro/i.test(part.metadata.title??''))return 'exercise-or-generated';
 if(relative.startsWith('leadsheets/basslines/'))return 'bassline';
 return 'unlabeled-notes';
}

export function importImprovisorMelodies({sourceDir=path.resolve(project,'../Impro-Visor'),outputRoot=project}={}){
 const original=JSON.parse(fs.readFileSync(path.join(project,'dist/data/roadmaps.json'),'utf8')).songs,byTitle=new Map();
 for(const song of original){byTitle.set(normalize(song.title),song);if(song.leadsheet)byTitle.set(normalize(decodeURIComponent(song.leadsheet.split('/').at(-1)).replace(/\.ls$/,'')),song);}
 const entries=[],dedup=new Map(),inventory=[],failures=[],headRejections=[],headFiles=new Set(),paths=filesUnder(path.join(sourceDir,'leadsheets'));let explicitHeadParts=0;
 for(const file of paths){
  const relative=path.relative(sourceDir,file).split(path.sep).join('/'),text=fs.readFileSync(file,'utf8');let score;
  try{score=readImprovisorLeadsheet(text);}catch(error){failures.push({path:relative,error:error.message});continue;}
  const sourceTitle=score.metadata.title??path.basename(file,'.ls'),chordPart=score.parts.find(p=>p.metadata.type==='chords'),partComposition=chordPart?.metadata.title,compositionTitle=partComposition&&!/^(?:Untitled Part)?$/i.test(partComposition)?baseTitle(partComposition):baseTitle(sourceTitle),song=byTitle.get(normalize(compositionTitle))??byTitle.get(normalize(baseTitle(sourceTitle))),records=[];
  for(let partIndex=0;partIndex<score.parts.length;partIndex++){
   const part=score.parts[partIndex];if(part.metadata.type!=='melody')continue;
   const tokens=part.tokens.filter(token=>typeof token==='string');let melody;
   try{melody=parseImprovisorMelody(tokens);}catch(error){records.push({partIndex,title:part.metadata.title??'',classification:'unreadable',error:error.message});if(isExplicitHead(part))headRejections.push({path:relative,partIndex,reason:error.message});continue;}
   const classification=classify(part,melody,relative);records.push({partIndex,title:part.metadata.title??'',composer:part.metadata.composer??'',notes:melody.notes.length,totalBeats:melody.totalBeats,classification});
   if(classification!=='explicit-head')continue;headFiles.add(relative);explicitHeadParts++;
   if(melody.notes.length<8||Math.abs(melody.totalBeats-score.totalBeats)>1e-7){headRejections.push({path:relative,partIndex,reason:'Head note/rest duration does not cover the chord arrangement',melodyBeats:melody.totalBeats,chordBeats:score.totalBeats});continue;}
   if(Number(score.metadata.transpose??0)!==0){headRejections.push({path:relative,partIndex,reason:'Source transpose directive requires separate decoding'});continue;}
   const source={repository:REPOSITORY,commit:COMMIT,path:relative,url:REPOSITORY+'/blob/'+COMMIT+'/'+relative,sha256:sha(text),partIndex,partTitle:part.metadata.title??'',partComposer:part.metadata.composer??''},fingerprint=sha(JSON.stringify({notes:melody.notes,rests:melody.rests,chords:score.chords,meter:score.meter})),duplicate=dedup.get(fingerprint);
   if(duplicate){duplicate.provenance.duplicateSources.push(source);continue;}
   const tonic=improvisorTonic(score),id='improvisor-'+slug(compositionTitle)+'-'+fingerprint.slice(0,10),entry={id,normalizedTitle:song?normalize(song.title):normalize(compositionTitle),title:sourceTitle,compositionTitle,composer:score.metadata.composer??'',tonic:tonic.tonic,tonicConfidence:tonic.confidence,meter:score.meter,barBeats:score.barBeats,bars:score.bars,totalBeats:score.totalBeats,pickupBeats:0,tempo:Number(score.metadata.tempo??120),notes:melody.notes,rests:melody.rests,chords:score.chords,midi:'melodies/'+id+'.mid',...(song?{existingSong:song.index}:{}),provenance:{...source,format:'Impro-Visor leadsheet',headEvidence:'Explicit source melody-part title beginning Head; other solo/generated parts excluded',sourceInstrument:Number(part.metadata.instrument??0),sourcePartVolume:Number(part.metadata.volume??85),sourceRights:score.metadata.show??null,sourceKeySignature:{fifths:Number(score.metadata.key??0),mode:null},sourcePlaybackTranspose:(score.metadata['playback-transpose']??'0').split(/\s+/).map(Number),tonicBasis:tonic.basis,timing:'Exact notated integer120-slot quarter beats; ties within one token remain one attack; no swing timing applied',sourceSwing:score.styles,unfoldStatus:'written-parts',sourceMeters:[score.meter.join('/')],irregularMeasures:[],leadOverfullMeasures:[],leadUnderfullMeasures:[],conflictingHarmonies:[],duplicateSources:[],titleMetadata:{selectedFrom:'leadsheet title',sourceTitle,compositionTitle,filenameTitle:path.basename(file,'.ls')}}};
   entries.push(entry);dedup.set(fingerprint,entry);
  }
  if(song)inventory.push({song:song.index,title:song.title,sourceTitle,path:relative,chordBars:score.bars,parts:records});
 }
 const existingComparisons=entries.filter(entry=>entry.existingSong!==undefined).map(entry=>{const song=original.find(song=>song.index===entry.existingSong),match=exactMelodyMatch(entry,song);return{song:song.index,melodyId:entry.id,sourceBars:entry.bars,roadmapBars:song.bars,matched:!!match,reason:match?'Exact coalesced chord-root boundaries and constant pitch shift':entry.bars!==song.bars?'Different source arrangement length':'Different complete chord-root boundary sequence'};});
 const existingMatches=entries.flatMap(entry=>{const song=original.find(song=>song.index===entry.existingSong),match=song&&exactMelodyMatch(entry,song);return match?[match]:[];});
 const data={version:1,timeUnit:'quarter-note',pitchBasis:'source-written',sources:[{name:'Impro-Visor explicit heads',repository:REPOSITORY,commit:COMMIT}],entries,existingMatches};
 const target=path.join(outputRoot,'dist/data/improvisor-melodies.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data)+'\n');
 for(const entry of entries){const performance={title:entry.title,meter:entry.meter,tempo:entry.tempo,beats:entry.totalBeats,notes:entry.notes.map((note,i)=>({...note,id:'n'+i,voice:1})),voices:[{voice:1,program:65,name:'Alto Sax'}]},target=path.join(outputRoot,'dist',entry.midi);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,encodeMidi(performance));}
 const bodyAndSoul=inventory.filter(item=>normalize(item.title)==='bodyandsoul'),pitched=inventory.filter(item=>item.parts.some(part=>part.notes)),heads=inventory.filter(item=>item.parts.some(part=>part.classification==='explicit-head'));
 const audit={version:1,repository:REPOSITORY,commit:COMMIT,counts:{sourceFiles:paths.length,explicitHeadSourceFiles:headFiles.size,explicitHeadSourceParts:explicitHeadParts,matchedOriginalFiles:inventory.length,matchedOriginalStandards:new Set(inventory.map(i=>i.song)).size,pitchedOriginalFiles:pitched.length,pitchedOriginalStandards:new Set(pitched.map(i=>i.song)).size,explicitHeadOriginalFiles:heads.length,explicitHeadOriginalStandards:new Set(heads.map(i=>i.song)).size,importedHeadEntries:entries.length,importedCompositions:new Set(entries.map(e=>e.normalizedTitle)).size,importedNotes:entries.reduce((n,e)=>n+e.notes.length,0),midiFiles:entries.length,exactExistingMatches:existingMatches.length},semantics:[{source:'src/imp/data/Duration.java',lines:'132-281',basis:'Integer480-slot whole note, tuplets(n-1)/n, dotted integerhalves, additive tie duration, default eighth note'},{source:'src/imp/data/NoteSymbol.java',lines:'163-255,609-631',basis:'C MIDI60, octave + / - / u, pitch class spelling aliases'},{source:'src/imp/data/PitchClass.java',lines:'115-136,667-713',basis:'Pitch class0..11 before octave; sourcecb mapsB in currentC-based octave andb# mapsC'},{source:'src/imp/data/Leadsheet.java',lines:'966-1004',basis:'Melody velocity startsMAX_VOLUME127 and respects inline volume symbols'}],policy:'Only explicitly labeled Head parts with complete chord-form duration are imported. A note-bearing file, named transcription, exercise or unlabeled chorus is not evidence of the original head.',bodyAndSoul,headRejections,failures,existingComparisons,existingMatches,entries:entries.map(({notes,rests,chords,...entry})=>({...entry,notes:notes.length,rests:rests.length,chordEvents:chords.length})),originalInventory:inventory};
 fs.mkdirSync(path.join(outputRoot,'evidence'),{recursive:true});fs.writeFileSync(path.join(outputRoot,'evidence/improvisor-melody-audit.json'),JSON.stringify(audit,null,2)+'\n');return {data,audit};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(importImprovisorMelodies().audit.counts));
