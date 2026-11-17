import {createHash} from 'node:crypto';
import {parseMidi} from 'midi-file';
import {pitch,mod} from '../../dist/harmony.mjs';
const EPS=1e-6;
export const stableStringify=value=>JSON.stringify(value===null||typeof value!=='object'?value:Array.isArray(value)?value.map(v=>JSON.parse(stableStringify(v))):Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,JSON.parse(stableStringify(value[k]))])));
export const fingerprint=value=>createHash('sha256').update(stableStringify(value)).digest('hex');
export const byteHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const noteView=notes=>notes.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration,velocity:n.velocity}));
export const notesFingerprint=notes=>fingerprint(noteView(notes));
const fail=reason=>{throw Error('Reviewed melody: '+reason);};
const same=(a,b)=>stableStringify(a)===stableStringify(b),close=(a,b)=>Math.abs(a-b)<EPS;
export function validateMelodyMidi(entry,bytes){
 const midi=parseMidi(bytes);if(!midi.header.ticksPerBeat)fail('SMPTE MIDI is unsupported');
 const notes=[],meters=[];let end=0;const leadChannels=new Set();
 for(const track of midi.tracks){let at=0;const active=new Map(),programs=new Map();
  for(const e of track){at+=e.deltaTime;const beat=at/midi.header.ticksPerBeat;
   if(e.type==='programChange')programs.set(e.channel,e.programNumber);
   if(e.type==='timeSignature')meters.push({beat,meter:[e.numerator,e.denominator],metronome:e.metronome,thirtyseconds:e.thirtyseconds});
   if(e.type==='noteOn'&&e.velocity>0){if(e.channel===9||programs.get(e.channel)!==65)fail('source melody MIDI must use GM65');leadChannels.add(e.channel);const key=e.channel+':'+e.noteNumber;if(active.has(key))fail('overlapping same-pitch MIDI attacks');active.set(key,{pitch:e.noteNumber,start:beat,velocity:e.velocity});}
   if(e.type==='noteOff'||e.type==='noteOn'&&e.velocity===0){const key=e.channel+':'+e.noteNumber,n=active.get(key);if(!n)fail('unmatched MIDI note-off');notes.push({...n,duration:beat-n.start});active.delete(key);}
  }
  if(active.size)fail('unterminated MIDI note');end=Math.max(end,at/midi.header.ticksPerBeat);
 }
 if(leadChannels.size!==1||!close(end,entry.totalBeats))fail('MIDI voice or complete duration differs');
 const sorted=list=>[...list].sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.duration-b.duration),expected=sorted(entry.notes),actual=sorted(notes);
 if(actual.length!==expected.length)fail('MIDI note count differs');
 for(let i=0;i<actual.length;i++)if(actual[i].pitch!==expected[i].pitch||actual[i].velocity!==expected[i].velocity||!close(actual[i].start,expected[i].start)||!close(actual[i].duration,expected[i].duration))fail('MIDI melody differs from reviewed notes');
 const sourceMeters=entry.provenance?.midiMeterEvents;if(sourceMeters&&!same(meters,sourceMeters))fail('MIDI meter events differ');
 return {notes:actual.length,totalBeats:end,meters};
}
function validateHarmonicReference(entry,canonical,references){
 const p=entry.provenance,declared=p.sourceDeclaredKey??p.sourceKeySignature;
 if(!declared||declared.mode===entry.tonic[1]&&pitch(declared.root)===pitch(entry.tonic[0]))return;
 const ref=references.find(r=>r.melodyId===entry.id);if(!ref||!same(ref,p.harmonicTonicReference)||ref.canonicalSong!==canonical.index||ref.sourcePath!==p.path||ref.sourceSha256!==p.sha256||ref.sourceVersion!==p.sourceVersion||!same(ref.sourceDeclaredKey,declared)||!same(ref.normalizationTonic,{root:entry.tonic[0],mode:entry.tonic[1]})||entry.tonic[1]!=='Minor'||canonical.tonic[1]!=='Minor'||pitch(entry.tonic[0])!==pitch(canonical.tonic[0]))fail('harmonic normalization lacks a pinned reference');
 const tonic=pitch(entry.tonic[0]),checked=event=>{const c=entry.chords[event.index];if(!c||['symbol','start','end','sourceLine'].some(k=>c[k]!==event[k]))fail('harmonic reference event changed');const root=pitch(c.symbol),intervals=new Set((c.sourceCorePitches??c.sourcePitches??[]).map(n=>mod(n-root)));return {root,intervals};};
 if(ref.evidence.tonicChordEvents.length<2||!ref.evidence.dominantResolutions.length)fail('insufficient harmonic normalization evidence');
 for(const e of ref.evidence.tonicChordEvents){const c=checked(e);if(c.root!==tonic||!c.intervals.has(3)||c.intervals.has(4))fail('harmonic normalization tonic evidence differs');}
 for(const r of ref.evidence.dominantResolutions){const d=checked(r.dominant),t=checked(r.tonic);if(r.tonic.index!==r.dominant.index+1||!close(r.dominant.end,r.tonic.start)||d.root!==mod(tonic+7)||![4,10].every(n=>d.intervals.has(n))||t.root!==tonic||!t.intervals.has(3)||t.intervals.has(4))fail('harmonic normalization V7-i evidence differs');}
}
export function validateReviewedEntry(entry,review,{canonicalSongs,sourceBytes,midiBytes,proof,harmonicReferences=[],primaryVoiceReferences=[]}){
 if(!entry||!review||entry.id!==review.melodyId||!Number.isInteger(review.canonicalSong))fail('review identity missing');
 const canonical=canonicalSongs.find(s=>s.index===review.canonicalSong&&!Number.isInteger(s.arrangementOf));if(!canonical||canonical.title!==review.canonicalTitle)fail('canonical composition identity differs');
 const p=entry.provenance??{};
 if(!/^[a-zA-Z0-9._-]+$/.test(entry.id)||!p.path||!/^[a-f0-9]{64}$/.test(p.sha256??'')||!p.sourceVersion||!/^https:\/\//.test(p.url??''))fail('pinned source identity missing');
 for(const [key,value]of Object.entries({sourcePath:p.path,sourceSha256:p.sha256,sourceVersion:p.sourceVersion,sourceCommit:p.repositoryCommit??null}))if(review[key]!==value)fail('review source identity differs: '+key);
 if(byteHash(sourceBytes)!==p.sha256||review.entrySha256!==fingerprint(entry)||review.notesSha256!==notesFingerprint(entry.notes??[]))fail('reviewed source, entry or note digest differs');
 if(!proof||proof.status!=='PASS'||proof.melodyId!==entry.id||proof.sourceSha256!==p.sha256||proof.notesSha256!==review.notesSha256||proof.noteCount!==entry.notes?.length||proof.totalBeats!==entry.totalBeats)fail('compiler proof identity differs');
 if(review.noteCount!==entry.notes.length||review.totalBeats!==entry.totalBeats||!(entry.totalBeats>0)||!entry.notes.length)fail('reviewed duration or note count differs');
 let previousEnd=0;for(const n of [...entry.notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||!Number.isInteger(n.velocity)||n.velocity<1||n.velocity>127||!Number.isFinite(n.start)||!Number.isFinite(n.duration)||n.duration<=0||n.start<-EPS||n.start<previousEnd-EPS||n.start+n.duration>entry.totalBeats+EPS)fail('melody is polyphonic or outside the exact source timeline');previousEnd=n.start+n.duration;}
 let end=0;for(const c of entry.chords??[]){if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||!close(c.start,end)||!(c.end>c.start)||c.end>entry.totalBeats+EPS)fail('harmony does not cover the exact source timeline');end=c.end;}if(!close(end,entry.totalBeats))fail('incomplete source harmony');
 if(!entry.tonic||entry.tonic[1]!==canonical.tonic[1])fail('source and canonical mode require explicit review');
 validateHarmonicReference(entry,canonical,harmonicReferences);
 if(p.curatedPrimaryVoice){const ref=primaryVoiceReferences.find(r=>r.melodyId===entry.id);if(!ref||ref.sourcePath!==p.path||ref.sourceSha256!==p.sha256||ref.sourceVersion!==p.sourceVersion||!same(ref.events,p.curatedPrimaryVoice.events)||!same(ref.evidence,p.curatedPrimaryVoice.evidence))fail('primary voice choice lacks a pinned reference');for(const e of ref.events)if(!entry.notes.some(n=>n.pitch===e.selectedPitch&&close(n.start,e.start)&&close(n.duration,e.duration))||entry.notes.some(n=>e.omittedPitches.includes(n.pitch)&&close(n.start,e.start)&&close(n.duration,e.duration)))fail('primary voice selection differs');}
 const midi=validateMelodyMidi(entry,midiBytes);if(review.midiSha256!==byteHash(midiBytes))fail('reviewed MIDI digest differs');
 if(entry.compositionTitle&&entry.compositionTitle!==canonical.title||p.compositionIdentity&&p.compositionIdentity.canonicalSong!==canonical.index)fail('candidate carries a conflicting composition identity');
 return {canonical,midi};
}
