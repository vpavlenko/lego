#!/usr/bin/env python3
"""Decode public PSjazzEval RealBook MusicXML into source-pitch melody events.

Requires music21 (tested 10.5.2). Raw inputs stay outside the published site.
Example: /tmp/venv/bin/python scripts/import-melodies.py --source-dir /tmp/PSjazzEval-main
"""
import argparse
import copy
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import struct
import unicodedata
import warnings
import xml.etree.ElementTree as ET
from music21 import bar, chord, converter, harmony, key, meter, note, repeat, stream
from music21 import duration as m21duration

REPO='https://github.com/florento/PSjazzEval'
KIND={'major':'','minor':'m','dominant':'7','dominant-seventh':'7','minor-seventh':'m7','major-seventh':'M7','major-sixth':'6','minor-sixth':'m6','diminished':'o','diminished-seventh':'o7','half-diminished':'m7b5','augmented':'aug','augmented-seventh':'7#5','major-minor':'mM7','minor-major-seventh':'mM7','suspended-fourth':'sus4','suspended-second':'sus2','dominant-ninth':'9','minor-ninth':'m9','major-ninth':'M9','dominant-11th':'11','minor-11th':'m11','major-11th':'M11','dominant-13th':'13','minor-13th':'m13','major-13th':'M13'}
KIND['half-diminished-seventh']='m7b5'

def normalize_title(value):
 value=unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower().replace('&','and')
 return re.sub('[^a-z0-9]','',re.sub(r'^the\s+','',value))

def slug(value):
 value=unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower().replace('&','and')
 return re.sub('[^a-z0-9]+','-',value).strip('-')

def rounded(value):
 return round(float(value),9)

def pitch_name(value):
 return value.name.replace('-','b')

def chord_symbol(c):
 if isinstance(c,harmony.NoChord) or c.root() is None:
  return 'NC' if re.sub(r'[^a-z]','',c.figure.lower()) in ('nc','nochord') else None
 quality=KIND.get(c.chordKind)
 if c.chordKind=='other' and c.chordKindStr=='°':quality='o'
 if quality is None:return None
 mods=sorted(c.chordStepModifications,key=lambda m:m.degree)
 for mod in mods:
  degree=int(mod.degree); alteration=round(mod.interval.chromatic.semitones) if mod.interval else 0
  token=('b'*-alteration if alteration<0 else '#' *alteration)+str(degree)
  if mod.modType=='subtract':quality+='no'+str(degree)
  elif alteration==0 and mod.modType=='add':
   if degree==7 and quality=='sus4':quality='7sus4'
   elif degree==7 and quality=='m':quality='mM7'
   elif degree==6 and quality=='m':quality='m6'
   elif degree==9 and quality in ('6','m6'):quality=quality+'9'
   elif degree==9 and quality=='7sus4':quality='9sus4'
   elif degree==9 and quality in ('7','m7','M7'):quality=quality[:-1]+'9'
   elif degree==11 and quality in ('9','m9'):quality=quality[:-1]+'11'
   elif degree==13 and quality in ('9','m9','M9'):quality=quality[:-1]+'13'
   else:quality+='add'+str(degree)
  elif degree==9 and quality=='9':quality='7'+token
  else:quality+=token
 bass=c.bass(); root=c.root()
 return pitch_name(root)+quality+('/'+pitch_name(bass) if bass is not None and bass.pitchClass!=root.pitchClass else '')

def variable_length(value):
 out=[value&127];value>>=7
 while value:out.insert(0,(value&127)|128);value>>=7
 return bytes(out)

def midi_bytes(notes,title,total_beats):
 # 10080 PPQ exactly represents all divisions/tuplets in the published corpus.
 ppq=10080;events=[(0,-3,b'\xff\x51\x03\x07\xa1\x20'),(0,-2,b'\xc0\x41')]
 name=title.encode('utf8');events.append((0,-1,b'\xff\x03'+variable_length(len(name))+name))
 for n in notes:
  start=round(n['start']*ppq);end=round((n['start']+n['duration'])*ppq)
  events.extend([(start,1,bytes([0x90,n['pitch'],n['velocity']])),(max(start+1,end),0,bytes([0x80,n['pitch'],0]))])
 events.sort(key=lambda e:(e[0],e[1],e[2]));track=bytearray();previous=0
 for tick,_,data in events:track.extend(variable_length(tick-previous)+data);previous=tick
 track.extend(variable_length(max(0,round(total_beats*ppq)-previous))+b'\xff\x2f\x00')
 return b'MThd'+struct.pack('>IHHH',6,0,1,ppq)+b'MTrk'+struct.pack('>I',len(track))+track

def xml_fingerprint(path):
 root=ET.parse(path).getroot()
 # Ignore enharmonic spelling, note colors, text annotations and key estimates.
 events=[]
 for part in root.findall('part'):
  for m in part.findall('measure'):
   for child in m:
    if child.tag=='note':
     p=child.find('pitch');midi=None
     if p is not None:midi=(int(p.findtext('octave'))+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[p.findtext('step')]+float(p.findtext('alter','0'))
     events.append(('note',midi,child.findtext('duration'),child.findtext('voice'),child.find('chord') is not None,tuple(t.get('type') for t in child.findall('tie'))))
    elif child.tag in ('backup','forward'):events.append((child.tag,child.findtext('duration')))
    elif child.tag=='barline':events.append(('barline',ET.tostring(child,encoding='unicode')))
 return hashlib.sha256(json.dumps(events).encode()).hexdigest()

def decode(path,source_root):
 xml=ET.parse(path).getroot();score=converter.parse(path);source_part=score.parts[0];part=copy.deepcopy(source_part)
 voice_ids=sorted({str(v.id) for v in part.recurse().getElementsByClass(stream.Voice)},key=lambda value:(not value.isdigit(),int(value) if value.isdigit() else value))
 selected_voice=voice_ids[0] if voice_ids else None;auxiliary_notes=0
 for m in part.getElementsByClass(stream.Measure):
  for voice in list(m.getElementsByClass(stream.Voice)):
   if str(voice.id)!=selected_voice:
    auxiliary_notes+=sum(len(n.pitches) for n in voice.recurse().notes if not isinstance(n,harmony.Harmony));m.remove(voice)
 printed_titles=[c.text.strip() for c in xml.findall('credit/credit-words') if c.text and c.get('justify')=='center' and float(c.get('default-y','0'))>1000 and c.get('valign')=='top']
 title=(printed_titles or [xml.findtext('work/work-title') or xml.findtext('movement-title') or path.stem])[0].removesuffix('.musicxml')
 creators=[c.text for c in xml.findall('identification/creator') if c.get('type')=='composer' and c.text not in ('Music21','music21')]
 credits=[c.text for c in xml.findall('credit/credit-words') if c.get('justify')=='right' and c.text and not re.search(r'copyright|cc-by|http|@',c.text,re.I)]
 composer=(creators or credits or [''])[0]
 ts=next(iter(part.recurse().getElementsByClass(meter.TimeSignature)),None)
 if ts is None:raise ValueError('No source meter')
 meters=sorted(set(t.ratioString for t in part.recurse().getElementsByClass(meter.TimeSignature)))
 time=[ts.numerator,ts.denominator];bar_beats=ts.barDuration.quarterLength
 original_measures=list(part.getElementsByClass(stream.Measure));repeat_marks=bool(xml.findall('.//repeat') or xml.findall('.//ending') or xml.findall('.//sound[@dacapo]') or xml.findall('.//sound[@dalsegno]'))
 # Place notated bars on their meter grid before repeat expansion. Auxiliary
 # piano voices must never lengthen a bar and shift all subsequent melody.
 at=0;current_meter=ts;lead_overfull=[];lead_underfull=[]
 for i,m in enumerate(original_measures):
  if m.timeSignature is not None:current_meter=m.timeSignature
  expected=float(current_meter.barDuration.quarterLength);actual=float(m.highestTime)
  implicit_first=xml.find('part/measure').get('implicit')=='yes' if xml.find('part/measure') is not None else False
  pickup=i==0 and 0<actual<expected-1e-8 and (float(m.paddingLeft)>0 or implicit_first)
  if actual>expected+1e-8:lead_overfull.append({'sourceNumber':str(m.number),'duration':rounded(actual),'barBeats':expected})
  if actual<expected-1e-8 and not pickup:lead_underfull.append({'sourceNumber':str(m.number),'duration':rounded(actual),'barBeats':expected})
  m.duration=m21duration.Duration(actual if pickup else expected);part.setElementOffset(m,at);at+=float(m.duration.quarterLength)
 try:
  expanded=part.expandRepeats();unfold_status='expanded' if repeat_marks else 'written'
 except Exception as error:
  expanded=part;unfold_status='unresolved';unfold_error=str(error)
 # Ties become one sounding event; rests retain their offsets without attacks.
 tied=expanded.stripTies(inPlace=False,matchByPitch=True)
 notes=[];grace_count=0;polyphony=0
 for m in tied.getElementsByClass(stream.Measure):
  for element in m.recurse().notes:
   if isinstance(element,harmony.Harmony):continue
   source_voice=element.getContextByClass(stream.Voice)
   if source_voice is not None and str(source_voice.id)!=selected_voice:
    auxiliary_notes+=len(element.pitches);continue
   duration=rounded(element.duration.quarterLength)
   if duration<=0:grace_count+=1;continue
   pitches=element.pitches if isinstance(element,chord.Chord) else [element.pitch]
   # The sax follows the upper melody pitch, not the piano's chord cluster.
   if len(pitches)>1:polyphony+=1;auxiliary_notes+=len(pitches)-1
   p=max(pitches,key=lambda value:value.ps)
   if abs(p.midi-round(p.midi))>1e-8:raise ValueError('Microtonal source pitch')
   notes.append({'pitch':int(round(p.midi)),'start':rounded(m.offset+element.getOffsetInHierarchy(m)),'duration':duration,'velocity':90})
 notes.sort(key=lambda n:(n['start'],n['pitch'],n['duration']))
 measures=[];first_chords=[];omitted=[]
 for i,m in enumerate(expanded.getElementsByClass(stream.Measure)):
  duration=rounded(m.duration.quarterLength)
  measures.append({'sourceNumber':str(m.number)+(m.numberSuffix or ''),'start':rounded(m.offset),'duration':duration,'paddingLeft':rounded(m.paddingLeft)})
  for c in m.recurse().getElementsByClass(harmony.ChordSymbol):
   symbol=chord_symbol(c);start=rounded(m.offset+c.getOffsetInHierarchy(m))
   if symbol is None:omitted.append({'at':start,'figure':c.figure,'kind':c.chordKind});continue
   first_chords.append({'symbol':symbol,'start':start,'sourceSymbol':c.figure,'kind':c.chordKind})
 first_chords.sort(key=lambda c:c['start']);chords=[];conflicts=[]
 for c in first_chords:
  if chords and c['start']==chords[-1]['start']:
   if c['symbol']!=chords[-1]['symbol']:conflicts.append({'at':c['start'],'symbols':[chords[-1]['symbol'],c['symbol']],'sourceSymbols':[chords[-1]['sourceSymbol'],c['sourceSymbol']]})
   continue
  chords.append(c)
 total=rounded(max(float(expanded.highestTime),max((n['start']+n['duration'] for n in notes),default=0)))
 for i,c in enumerate(chords):c['end']=chords[i+1]['start'] if i+1<len(chords) else total
 # Mode is absent in this corpus; estimate explicitly rather than mislabel a
 # relative-major key signature as the source's asserted musical tonic.
 estimated=part.analyze('key');tonic=[pitch_name(estimated.tonic),estimated.mode.capitalize()]
 fifths=xml.findtext('.//key/fifths');pickup=measures[0]['duration'] if measures and measures[0]['duration']<float(bar_beats)-1e-8 else 0
 irregular=[i for i,m in enumerate(measures) if abs(m['duration']-float(bar_beats))>1e-8 and not(i==0 and pickup)]
 local=path.relative_to(source_root).as_posix();identifier='psjazz-realbook-'+slug(title)
 provenance={'repository':REPO,'path':local,'url':REPO+'/blob/main/'+local,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceRights':xml.findtext('identification/rights'),'unfoldStatus':unfold_status,'writtenMeasures':len(original_measures),'unfoldedMeasures':len(measures),'measureMap':[m['sourceNumber'] for m in measures],'tiesMerged':True,'graceNotesOmitted':grace_count,'writtenChordClusters':polyphony,'omittedHarmonyAnnotations':omitted,'sourceKeySignature':{'fifths':int(fifths) if fifths is not None else None,'mode':xml.findtext('.//key/mode')},'tonicBasis':'music21 Krumhansl-Schmuckler estimate; source mode omitted','irregularMeasures':irregular,'sourceMeters':meters}
 provenance['conflictingHarmonies']=conflicts
 provenance['leadOverfullMeasures']=lead_overfull;provenance['leadUnderfullMeasures']=lead_underfull
 provenance['melodySelection']={'partId':str(part.id),'partName':part.partName,'partIndex':0,'sourceParts':len(score.parts),'staff':'first score part/staff','voice':selected_voice,'availableVoices':voice_ids,'auxiliaryPitchesOmitted':auxiliary_notes,'chordClusterPolicy':'highest notated pitch','unvoicedNotesRetained':True}
 provenance['titleMetadata']={'selectedFrom':'printed title credit' if printed_titles else 'work/movement title','printedTitle':printed_titles[0] if printed_titles else None,'workTitle':xml.findtext('work/work-title'),'movementTitle':xml.findtext('movement-title'),'filenameTitle':path.stem}
 if unfold_status=='unresolved':provenance['unfoldError']=unfold_error
 return {'id':identifier,'normalizedTitle':normalize_title(title),'title':title,'composer':composer,'tonic':tonic,'meter':time,'barBeats':rounded(bar_beats),'bars':rounded((total-pickup)/float(bar_beats)),'totalBeats':total,'pickupBeats':pickup,'notes':notes,'chords':chords,'measures':measures,'provenance':provenance,'midi':'melodies/'+identifier+'.mid'}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('dist/data/melodies.json'));args=parser.parse_args()
 paths=sorted((args.source_dir/'RealBook').rglob('*.musicxml'));by_title=defaultdict(list)
 for path in paths:by_title[path.stem].append(path)
 entries={};errors=[];duplicates=[]
 warnings.filterwarnings('ignore')
 for index,(name,versions) in enumerate(sorted(by_title.items())):
  selected=None
  for path in versions:
   try:selected=decode(path,args.source_dir);break
   except Exception as error:errors.append({'path':str(path.relative_to(args.source_dir)),'error':str(error)})
  if selected is None:continue
  key_name=selected['normalizedTitle']
  if key_name in entries:
   # Some public source files explicitly encode alternate keys/arrangements
   # (Emily vs Emily-G). Keep both actual renditions under stable variant keys.
   key_name+='--'+slug(name)
   selected['id']+='--'+slug(name)
   selected['midi']='melodies/'+selected['id']+'.mid'
  fingerprints=defaultdict(list)
  for path in versions:fingerprints[xml_fingerprint(path)].append(str(path.relative_to(args.source_dir)))
  selected['provenance']['evaluationCopies']=len(versions);selected['provenance']['pitchRhythmVariants']=len(fingerprints)
  if len(fingerprints)>1:duplicates.append({'title':name,'variants':dict(fingerprints)})
  entries[key_name]=selected
  target=args.output.parent.parent/selected['midi'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(midi_bytes(selected['notes'],selected['title'],selected['totalBeats']))
  if index%15==0:print(index+1,'/',len(by_title),selected['title'],flush=True)
 output={'version':1,'timeUnit':'quarter-note','pitchBasis':'source','sources':[{'name':'PSjazzEval RealBook','repository':REPO,'branch':'main','format':'MusicXML','downloaded':'2026-11-17','repositoryLicense':'MIT','scoreRights':'Per-score sourceRights retained; underlying compositions retain their own rights.'}],'entries':entries}
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(output,separators=(',',':'),ensure_ascii=False)+'\n')
 current_midis={Path(e['midi']).name for e in entries.values()}
 for old in (args.output.parent.parent/'melodies').glob('psjazz-realbook-*.mid'):
  if old.name not in current_midis:old.unlink()
 audit={'version':1,'sources':output['sources'],'counts':{'xmlFiles':len(paths),'distinctSourceTitles':len(by_title),'importedEntries':len(entries),'notes':sum(len(e['notes']) for e in entries.values()),'midiFiles':len(entries)},'parseFailures':errors,'evaluationVariants':duplicates,'entries':[{'id':e['id'],'title':e['title'],'composer':e['composer'],'notes':len(e['notes']),'bars':e['bars'],'pickupBeats':e['pickupBeats'],'provenance':e['provenance']} for e in entries.values()],'openBook':{'repository':'https://github.com/veltzer/book-openbook','inspected':True,'imported':False,'reason':'LilyPond source requires compiler; no existing MIDI artifacts in downloaded source archive. MusicXML prioritized.'}}
 Path('evidence/melody-import-audit.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps(audit['counts']),flush=True)

if __name__=='__main__':main()
