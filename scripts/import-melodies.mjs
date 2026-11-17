#!/usr/bin/env node
/** Finalize import-melodies.py output. No downloads or source data mutation. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {pitch,mod} from '../dist/harmony.mjs';
import {parseChord} from '../src/music/realization.mjs';

const ROOTS=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export function normalizeMelodyTitle(value){return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replaceAll('&','and').replace(/^the\s+/,'').replace(/[^a-z0-9]/g,'');}
const rootOf=symbol=>{const root=/^([A-G][b#]*)/.exec(symbol);return root?pitch(root[1]):null;};
const qualityOf=symbol=>/^([A-G][b#]*)([^/]*)/.exec(symbol)?.[2]??null;
const close=(a,b)=>Math.abs(a-b)<1e-7;

export function tonicEvidence(entry){
 const fifths=entry.provenance.sourceKeySignature.fifths;
 const last=entry.chords.findLast(c=>rootOf(c.symbol)!==null);
 const estimated=entry.tonic.map((v,i)=>i===0&&typeof v==='number'?ROOTS[v]:i===1?v[0].toUpperCase()+v.slice(1):v);
 if(fifths===null||!last)return {tonic:estimated,confidence:'estimated',basis:'Melody pitch-distribution estimate; source mode absent'};
 const major=mod(fifths*7),minor=mod(major+9),root=rootOf(last.symbol),q=qualityOf(last.symbol);
 const minorQuality=/^m(?!aj)/.test(q??'');
 if(root===minor&&minorQuality)return {tonic:[/^([A-G][b#]*)/.exec(last.symbol)[1],'Minor'],confidence:'high',basis:'Final minor tonic agrees with source key signature'};
 if(root===major&&!minorQuality&&!/^(o|dim|sus)/.test(q??''))return {tonic:[/^([A-G][b#]*)/.exec(last.symbol)[1],'Major'],confidence:'high',basis:'Final major tonic agrees with source key signature'};
 return {tonic:estimated,confidence:'estimated',basis:'Melody pitch-distribution estimate; final chord does not confirm source key signature mode'};
}

export function melodyEligibility(entry,qualities){
 const p=entry.provenance,reasons=[];
 if(entry.pickupBeats)reasons.push('pickup');
 if(p.sourceMeters.length!==1)reasons.push('meter changes');
 if(p.unfoldStatus==='unresolved')reasons.push('unresolved repeats');
 if(p.irregularMeasures.length||p.leadOverfullMeasures?.length||p.leadUnderfullMeasures?.length)reasons.push('irregular source measures');
 if(!Number.isInteger(entry.bars)||!close(entry.totalBeats,entry.bars*entry.barBeats))reasons.push('incomplete bar grid');
 if(p.conflictingHarmonies?.length)reasons.push('conflicting harmonies');
 if(p.omittedHarmonyAnnotations.some(c=>c.kind!=='none'))reasons.push('unsupported source harmony');
 if(entry.chords.some(c=>c.symbol!=='NC'&&!parseChord(c.symbol,qualities,c)))reasons.push('unsupported chord vocabulary');
 if(!entry.chords.length)reasons.push('no harmony');
 if(entry.tonicConfidence!=='high')reasons.push('uncertain tonic');
 return [...new Set(reasons)];
}

function coalesced(chords,transpose=0){
 const result=[];
 for(const c of chords){
  const root=rootOf(c.symbol),value=root===null?null:mod(root+transpose),previous=result.at(-1);
  if(previous&&previous.root===value&&close(previous.end,c.start))previous.end=c.end;
  else result.push({root:value,start:c.start,end:c.end});
 }
 return result;
}
export function exactMelodyMatch(entry,song){
 const p=entry.provenance;
 if(entry.normalizedTitle!==normalizeMelodyTitle(song.title))return null;
 if(entry.pickupBeats||p.unfoldStatus==='unresolved'||p.sourceMeters.length!==1||p.irregularMeasures.length||p.leadOverfullMeasures?.length||p.leadUnderfullMeasures?.length||p.conflictingHarmonies?.length)return null;
 if(song.meter.join('/')!==entry.meter.join('/'))return null;
 const barBeats=song.meter[0]*4/song.meter[1],beats=song.bars*barBeats;
 if(!close(entry.totalBeats,beats))return null;
 const target=coalesced(song.rows.flatMap(r=>r.chords.map(c=>({symbol:c.symbol,start:(r.startBar+c.start)*barBeats,end:(r.startBar+c.end)*barBeats}))),-pitch(song.tonic[0]));
 const source=coalesced(entry.chords);
 if(source.length!==target.length)return null;
 const shifts=[];
 for(let shift=0;shift<12;shift++)if(source.every((c,i)=>close(c.start,target[i].start)&&close(c.end,target[i].end)&&(c.root===null?target[i].root===null:mod(c.root+shift)===target[i].root)))shifts.push(shift);
 if(shifts.length!==1)return null;
 const transpose=shifts[0]>6?shifts[0]-12:shifts[0];
 return {song:song.index,melodyId:entry.id,transpose,beatOffset:0,basis:'Coalesced chord roots and exact quarter-beat boundaries under one constant transposition',sourceBeats:entry.totalBeats,targetBeats:beats,sourceSegments:source.length};
}

export function finalizeMelodies(root=process.cwd()){
 const read=path=>JSON.parse(fs.readFileSync(resolve(root,path),'utf8'));
 const data=read('dist/data/melodies.json'),audit=read('evidence/melody-import-audit.json'),songs=read('dist/data/roadmaps.json').songs.slice(0,242),qualities=read('src/music/chord-vocabulary.json').qualities;
 const all=Object.values(data.entries),existingByTitle=new Map(songs.map(s=>[normalizeMelodyTitle(s.title),s])),matches=[],comparisons=[];
 for(const entry of all){
  const evidence=tonicEvidence(entry);entry.tonic=evidence.tonic;entry.tonicConfidence=evidence.confidence;entry.provenance.tonicBasis=evidence.basis;
  entry.provenance.repositoryCommit='b6a559e8bd2719c3279ed0e81554b5cdbab0da03';entry.provenance.url=entry.provenance.url.replace('/blob/main/','/blob/'+entry.provenance.repositoryCommit+'/');
  if(entry.chords.length&&entry.chords[0].start>0)entry.chords.unshift({symbol:'NC',start:0,end:entry.chords[0].start,sourceSymbol:null,basis:'No source harmony before first symbol'});
  entry.candidateExclusions=melodyEligibility(entry,qualities);
  const song=existingByTitle.get(entry.normalizedTitle);
  if(song){const match=exactMelodyMatch(entry,song);if(match)matches.push(match);comparisons.push({song:song.index,roadmapTitle:song.title,melodyId:entry.id,sourceTitle:entry.title,sourceBars:entry.bars,roadmapBars:song.bars,matched:!!match,reason:match?'Exact coalesced root/rhythm structure':'Title match alone does not establish arrangement compatibility'});}
 }
 data.existingMatches=matches;data.sources[0].commit='b6a559e8bd2719c3279ed0e81554b5cdbab0da03';
 const candidates={version:1,timeUnit:data.timeUnit,pitchBasis:data.pitchBasis,sources:data.sources,entries:all.filter(e=>!e.candidateExclusions.length).map(e=>({...e,melodyId:e.id}))};
 fs.writeFileSync(resolve(root,'dist/data/melodies.json'),JSON.stringify(data)+'\n');fs.writeFileSync(resolve(root,'dist/data/melody-leadsheets.json'),JSON.stringify(candidates)+'\n');
 audit.counts={...audit.counts,candidateEntries:candidates.entries.length,existingTitleComparisons:comparisons.length,existingAlignedEntries:matches.length,existingAlignedStandards:new Set(matches.map(m=>m.song)).size};
 audit.existingComparisons=comparisons;audit.existingMatches=matches;audit.candidateEntries=candidates.entries.map(e=>({id:e.id,title:e.title,bars:e.bars,tonic:e.tonic}));audit.excludedCandidates=all.filter(e=>e.candidateExclusions.length).map(e=>({id:e.id,title:e.title,reasons:e.candidateExclusions}));
 audit.entries=all.map(e=>({id:e.id,title:e.title,composer:e.composer,tonic:e.tonic,tonicConfidence:e.tonicConfidence,notes:e.notes.length,bars:e.bars,pickupBeats:e.pickupBeats,provenance:e.provenance}));
 audit.titleMetadataDifferences=all.filter(e=>normalizeMelodyTitle(e.title)!==normalizeMelodyTitle(e.provenance.titleMetadata.workTitle??'')).map(e=>({id:e.id,title:e.title,composer:e.composer,...e.provenance.titleMetadata}));
 audit.validation={midiRoundTrip:{files:all.length,ppq:10080,toleranceBeats:1/10080},primaryMelody:'First score part/staff; lowest-numbered notated voice; top pitch of written chord clusters',malformedLeadBars:'Notated meter grid retained; overfull and underfull selected lead bars audited and excluded from candidates/matches',pickupPolicy:'Raw pickup notes retained from beat zero; automatic candidates and existing matches require no pickup',tonicPolicy:'New candidates require final tonic chord agreeing with source key signature; existing match pitch shift derives from chord roots, independently of tonic estimate',titlePolicy:'Printed top-center title credit preferred; original work/movement/filename metadata retained to expose stale copied work titles',repeatPolicy:'music21 repeat unfolding and source measure map; malformed/unresolved repeats excluded from automatic candidates/matches',tests:'node --test tests/melody-import.test.mjs',decoder:'music21 10.5.2'};
 fs.writeFileSync(resolve(root,'evidence/melody-import-audit.json'),JSON.stringify(audit,null,2)+'\n');return audit.counts;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(finalizeMelodies()));
