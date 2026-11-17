#!/usr/bin/env python3
"""Compile source OpenBook LilyPond arrangements; never infer missing notes.

Python >=3.11 and LilyPond >=2.24. No pip dependencies.
Raw source/compiler scratch stay outside the site. Only validated complete,
regular, monophonic arrangements with explicit initial key/meter are emitted.
An opt-in decoder path preserves source pickup durations and actual measure
boundaries; it does not pad, stretch or admit them to a regular-grid runtime.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import tarfile
import tomllib
import unicodedata

REPO='https://github.com/veltzer/book-openbook'
COMMIT='adbe5c68ff59e20068dd754e7d227979fa628d33'
ROOT=Path(__file__).resolve().parents[1]
SCHEME=r'''\version "2.26.0"
#(define (dur m) (* 4 (ly:moment-main (ly:music-length m))))
#(define (emit kind start m)
 (let* ((origin (ly:music-property m 'origin)) (loc (if (ly:input-location? origin) (ly:input-file-line-char-column origin) '("" 0 0 0))) (ns (filter (lambda (x) (ly:pitch? (ly:music-property x 'pitch))) (ly:music-property m 'elements))))
 (format #t "DATA\t~a\t~a\t~a\t~a\t~a\t~a\n" kind start (dur m) (cadr loc) (caddr loc) (string-join (map (lambda (n) (number->string (+ 60 (ly:pitch-semitones (ly:music-property n 'pitch))))) ns) ","))))
#(define (walk m start)
 (let ((name (ly:music-property m 'name)) (es (ly:music-property m 'elements)) (e (ly:music-property m 'element)))
 (cond ((eq? name 'EventChord) (emit "CHORD" start m))
 ((eq? name 'SequentialMusic) (fold (lambda (x at) (walk x at) (+ at (dur x))) start es))
 ((eq? name 'BarCheckEvent) (emit "BAR" start m))
 ((eq? name 'PartialSet) (let* ((d (ly:music-property m 'duration)) (origin (ly:music-property m 'origin)) (loc (if (ly:input-location? origin) (ly:input-file-line-char-column origin) '("" 0 0 0)))) (format #t "DATA\tPARTIAL\t~a\t~a\t~a\t~a\t\n" start (* 4 (ly:moment-main (ly:duration->moment d))) (cadr loc) (caddr loc))))
 ((eq? name 'RestEvent) (emit "REST" start m))
 ((eq? name 'SkipEvent) (emit "SKIP" start m))
 ((ly:music? e) (walk e start))
 ((pair? es) (for-each (lambda (x) (walk x start)) es)))))
dump = #(define-music-function (label m) (string? ly:music?)
 (format #t "BEGIN\t~a\n" label)
 (let ((expanded (unfold-repeats-fully m))) (walk expanded 0) (format #t "TOTAL\t~a\t~a\n" label (dur expanded))) m)
'''
LAYOUT_MACROS=['startChords','endChords','startSong','endSong','startPart','endPart','myEndLineVoltaNotLast','myEndLineVoltaLast','myEndLineVolta','myEndLine','myBreak','OPC','LPC','RPC','partBar','endBar','startBar','startRepeat','endRepeat','endTune','mySegno','myCoda']

def normalize(value):
 value=unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower().replace('&','and')
 return re.sub('[^a-z0-9]','',re.sub(r'^the\s+','',value))

def slug(value):
 value=unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower().replace('&','and')
 return re.sub('[^a-z0-9]+','-',value).strip('-')

def rounded(value):return round(float(value),9)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def section(text,name):
 match=re.search(r'{%\s*if part == "'+re.escape(name)+r'"\s*%}(.*?){%\s*endif\s*%}',text,re.S)
 if not match:raise ValueError('Missing source section '+name)
 if '{%' in match[1] or '{{' in match[1]:raise ValueError('Nested template directives')
 return match[1],text[:match.start(1)].count('\n')+1

def clean(text):
 for name in LAYOUT_MACROS:text=re.sub(r'\\'+name+r'\b','',text)
 text=re.sub(r'\\myMark\s+"[^"]*"','',text)
 return text

def root_name(value):
 match=re.fullmatch(r'([a-g])((?:is|es)*|s)',value)
 if not match:raise ValueError('Unknown LilyPond pitch '+value)
 letter,acc=match.groups();acc='es' if acc=='s' else acc
 suffix='#'*(acc.count('is'))+'b'*(acc.count('es'))
 return letter.upper()+suffix

def pc(value):return ({'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[value[0]]+value.count('#')-value.count('b'))%12

def quality(value):
 # Direct syntax translation, not a best-fit pitch-class quality guess.
 if not value:return ''
 value={'sus4.7':'7sus4','sus.7':'7sus4','6.9':'69','m6.9':'m69','7.9':'9','m7.9':'m9','maj7.9':'M9','dim5m7':'m7b5','m5+':'m#5'}.get(value,value)
 base,*mods=value.split('.')
 base={'maj':'M7','maj7':'M7','maj9':'M9','maj13':'M13','dim':'o','dim7':'o7','aug':'aug','sus':'sus4','m7+':'mM7'}.get(base,base)
 result=base
 for mod in mods:
  alteration=re.fullmatch(r'(\d+)([+-]?)',mod)
  if not alteration:raise ValueError('Unsupported LilyPond chord modifier '+value)
  degree,sign=alteration.groups();result+=('b' if sign=='-' else '#' if sign=='+' else 'add')+degree
 return result

def symbol_for(token,pitches,qualities,allow_source_intervals=False):
 token=re.split(r'[_^\\]',token,maxsplit=1)[0].rstrip('|{}')
 if re.match(r'^[rs](?:\d|\.|$)',token):return 'NC'
 match=re.match(r'^([a-g](?:(?:is|es)*|s))[,\']*(?:\d+\.*(?:\*\d+(?:/\d+)?)?)?(?::([^/\s]+))?(?:/\+?([a-g](?:(?:is|es)*|s)))?',token)
 if not match:raise ValueError('Unsupported chord token '+token)
 root=root_name(match[1]);q=quality(match[2] or '');bass=root_name(match[3]) if match[3] else None
 if q not in qualities and not allow_source_intervals:raise ValueError('Unsupported chord quality '+token+' -> '+q)
 actual={(int(p)-pc(root))%12 for p in pitches}
 expected={int(p)%12 for p in qualities.get(q,[])}
 if bass:expected.add((pc(bass)-pc(root))%12)
 if actual!=expected and not allow_source_intervals:raise ValueError('Source/compiler chord mismatch '+token+' '+str(sorted(actual))+' != '+str(sorted(expected)))
 return root+q+('/'+bass if bass and pc(bass)!=pc(root) else '')

def vlq(value):
 result=[value&127];value>>=7
 while value:result.insert(0,(value&127)|128);value>>=7
 return bytes(result)

def midi_bytes(notes,title,total):
 ppq=10080;name=title.encode();events=[(0,-2,b'\xff\x51\x03\x07\xa1\x20'),(0,-1,b'\xc0\x41'),(0,0,b'\xff\x03'+vlq(len(name))+name)]
 for n in notes:
  start=round(n['start']*ppq);end=round((n['start']+n['duration'])*ppq)
  events.extend([(start,2,bytes([0x90,n['pitch'],n['velocity']])),(max(start+1,end),1,bytes([0x80,n['pitch'],0]))])
 events.sort(key=lambda e:(e[0],e[1],e[2]));track=bytearray();previous=0
 for at,_,data in events:track.extend(vlq(at-previous)+data);previous=at
 track.extend(vlq(max(0,round(total*ppq)-previous))+b'\xff\x2f\x00')
 return b'MThd'+struct.pack('>IHHH',6,0,1,ppq)+b'MTrk'+struct.pack('>I',len(track))+track

def decode_midi(path):
 data=path.read_bytes();length,fmt,tracks,ppq=struct.unpack('>IHHH',data[4:14]);offset=8+length;notes=[]
 def read_vlq(buf,pos):
  n=0
  while True:
   b=buf[pos];pos+=1;n=(n<<7)+(b&127)
   if b<128:return n,pos
 for _ in range(tracks):
  if data[offset:offset+4]!=b'MTrk':raise ValueError('Invalid MIDI track')
  size=struct.unpack('>I',data[offset+4:offset+8])[0];buf=data[offset+8:offset+8+size];offset+=8+size;pos=0;tick=0;running=None;active={}
  while pos<len(buf):
   dt,pos=read_vlq(buf,pos);tick+=dt;status=buf[pos]
   if status>=128:pos+=1;running=status
   else:status=running
   if status==255:
    pos+=1;n,pos=read_vlq(buf,pos);pos+=n;continue
   if status in (240,247):n,pos=read_vlq(buf,pos);pos+=n;continue
   kind=status>>4;channel=status&15;n=1 if kind in (12,13) else 2;values=buf[pos:pos+n];pos+=n
   if kind==9 and values[1]:active.setdefault((channel,values[0]),[]).append((tick,values[1]))
   elif kind==8 or kind==9 and not values[1]:
    key=(channel,values[0])
    if not active.get(key):raise ValueError('Unpaired MIDI release')
    start,velocity=active[key].pop(0);notes.append({'pitch':values[0],'start':rounded(Fraction(start,ppq)),'duration':rounded(Fraction(tick-start,ppq)),'velocity':velocity})
  if any(active.values()):raise ValueError('Unclosed MIDI notes')
 return sorted(notes,key=lambda n:(n['start'],n['pitch'],n['duration'])),ppq

def compiled_measure_grid(events,total,bar_beats,allow_pickups=False):
 """Use compiler duration events, never the spelling of a duration token.

 Only one matching initial PartialSet in melody and chord streams is accepted.
 Repeat-local or later pickups are deliberately not interpreted as a new meter.
 """
 declarations={stream:[e for e in events if e['stream']==stream and e['kind']=='PARTIAL'] for stream in ('chords','voice')}
 pickup=Fraction(0)
 if any(declarations.values()):
  if not allow_pickups:raise ValueError('Source pickup requires explicit source review')
  if any(len(items)!=1 or items[0]['start']!=0 for items in declarations.values()):raise ValueError('Pickup must be one matching initial compiler declaration in both streams')
  durations={items[0]['duration'] for items in declarations.values()}
  if len(durations)!=1:raise ValueError('Chord/melody pickup duration mismatch')
  pickup=durations.pop()
  if not 0<pickup<bar_beats or total<=pickup:raise ValueError('Invalid source pickup duration')
 if not pickup and total%bar_beats:raise ValueError('Incomplete regular bar grid')
 for event in events:
  if event['kind']=='BAR' and event['start'] and (event['start']-pickup)%bar_beats:raise ValueError('Source barcheck off '+('pickup-aligned' if pickup else 'regular')+' meter grid')
 boundaries=[Fraction(0)]
 if pickup:boundaries.append(pickup)
 cursor=pickup+bar_beats
 while cursor<total:
  boundaries.append(cursor);cursor+=bar_beats
 boundaries.append(total)
 measures=[{'sourceNumber':str(i if pickup else i+1),'start':rounded(start),'duration':rounded(end-start)} for i,(start,end) in enumerate(zip(boundaries,boundaries[1:]))]
 if pickup and not any(end-start==bar_beats for start,end in zip(boundaries,boundaries[1:])):raise ValueError('Pickup source contains no complete measure')
 return pickup,measures

def decode(path,version,lilypond,qualities,source_root,work_dir,allow_source_intervals=False,allow_pickups=False):
 text=path.read_text();meta=tomllib.loads(re.search(r'{#(.*?)#}',text,re.S)[1]);attrs=meta['attributes'];raw_chords,chord_line=section(text,'Chords'+version);raw_voice,voice_line=section(text,'Voice'+version)
 combined=raw_chords+'\n'+raw_voice
 if r'\transpose' in combined:raise ValueError('Source transposition wrapper requires explicit key review')
 navigation=r'(?i)D\s*\.\s*[CS]\s*\.|al\s+coda|dal\s+segno|da\s+capo|\\(?:segno|coda|repeat\s+segno)\b'
 if re.search(navigation,combined) or not allow_pickups and re.search(r'\\partial\b',combined):raise ValueError('Textual navigation or pickup requires explicit source review')
 keys=re.findall(r'\\key\s+([a-g](?:(?:is|es)*|s))\s+\\(major|minor)',raw_voice)
 meters=re.findall(r'\\time\s+(\d+)\s*/\s*(\d+)',raw_voice)
 if not keys:raise ValueError('No explicit source tonic/mode')
 if not meters or len(set(meters))!=1:raise ValueError('Missing or changing source meter')
 tonic=[root_name(keys[0][0]),keys[0][1].capitalize()];meter=list(map(int,meters[0]));bar_beats=Fraction(meter[0]*4,meter[1])
 chords=clean(raw_chords);voice=clean(raw_voice);prefix=SCHEME+'\nchords = \\dump "chords" '+chords+'\n'
 if allow_source_intervals:
  core_chords=re.sub(r'/\+?[a-g](?:(?:is|es)*|s)[,\']*','',chords)
  prefix+='\ncoreChords = \\dump "coreChords" '+core_chords+'\n'
 generated=prefix+'\n\\score { \\new Staff { \\set Staff.midiInstrument = "alto sax" \\dump "voice" \\unfoldRepeats \\relative c\' '+voice+' } \\midi {} }\n'
 stem=slug(path.stem)+ '-'+slug(version);target=work_dir/(stem+'.ly');target.write_text(generated)
 result=subprocess.run([lilypond,'-dno-print-pages','-o',str(work_dir/stem),str(target)],capture_output=True,text=True)
 log=result.stdout+'\n'+result.stderr;(work_dir/(stem+'.log')).write_text(log)
 if result.returncode:raise ValueError('LilyPond compilation failed: '+next((l for l in log.splitlines() if 'error:' in l),'unknown error'))
 if re.search(r'warning:.*(?:barcheck failed|strange time|unterminated|cannot find|unknown|not enough|too many|duplicate|music is polyphonic)',log):raise ValueError('LilyPond structural warning')
 raw_events=[];totals={};current=None
 for line in log.splitlines():
  if line.startswith('BEGIN\t'):current=line.split('\t')[1]
  elif line.startswith('TOTAL\t'):
   _,label,value=line.split('\t');totals[label]=Fraction(value)
  elif line.startswith('DATA\t'):
   _,kind,start,duration,lineno,char,pitches=line.split('\t');raw_events.append({'stream':current,'kind':kind,'start':Fraction(start),'duration':Fraction(duration),'line':int(lineno),'char':int(char),'pitches':[int(x) for x in pitches.split(',') if x]})
 if totals.get('chords')!=totals.get('voice') or not totals.get('voice'):raise ValueError('Chord/melody source length mismatch '+str(totals))
 total=totals['voice']
 pickup,measures=compiled_measure_grid(raw_events,total,bar_beats,allow_pickups)
 lines=generated.splitlines();chord_events=[]
 # Prefix adds one line before the extracted chord section. All clean operations
 # preserve newlines, so source line provenance is exact even after unfolding.
 generated_chord_line=SCHEME.count('\n')+2
 for event in raw_events:
  if event['stream']!='chords' or event['kind'] not in ('CHORD','REST','SKIP'):continue
  line=lines[event['line']-1];token=re.split(r'\s|[|{}]',line[event['char']:],maxsplit=1)[0]
  if not event['duration']:continue
  source_line=chord_line+event['line']-generated_chord_line
  if event['kind']=='SKIP' and chord_events:
   previous=chord_events[-1]
   if abs(previous['end']-float(event['start']))>1e-8:raise ValueError('Skip does not follow harmony continuously')
   previous.setdefault('sourceContinuations',[]).append({'sourceSymbol':token,'sourceLine':source_line,'start':rounded(event['start']),'end':rounded(event['start']+event['duration'])})
   previous['end']=rounded(event['start']+event['duration']);continue
  symbol='NC' if event['kind'] in ('REST','SKIP') else symbol_for(token,event['pitches'],qualities,allow_source_intervals)
  source_override={}
  if allow_source_intervals and symbol!='NC':
   try:symbol_for(token,event['pitches'],qualities)
   except ValueError as mismatch:
    core=[e for e in raw_events if e['stream']=='coreChords' and e['kind']=='CHORD' and e['start']==event['start'] and e['duration']==event['duration']]
    if len(core)!=1:raise ValueError('Ambiguous independently compiled chord core')
    root=pc(re.match(r'^([A-G][b#]*)',symbol)[1]);roots=[p for p in core[0]['pitches'] if p%12==root]
    if not roots:raise ValueError('Compiled chord core has no explicit root')
    base=min(roots);intervals=sorted(set(p-base for p in core[0]['pitches']))
    if any(i<0 or i>48 for i in intervals):raise ValueError('Invalid compound source chord interval')
    bass_match=re.search(r'/([A-G][b#]*)$',symbol);expected_core={p%12 for p in core[0]['pitches']}
    if bass_match:expected_core.add(pc(bass_match[1]))
    if expected_core!={p%12 for p in event['pitches']}:raise ValueError('Original compiled slash chord disagrees with independently compiled core plus bass')
    source_override={'sourceIntervals':intervals,'realizationBasis':'source-compiled-chord','sourceCorePitches':core[0]['pitches'],'vocabularyDifference':str(mismatch)}
  chord_events.append({**source_override,'symbol':symbol,'start':rounded(event['start']),'end':rounded(event['start']+event['duration']),'sourceSymbol':token,'sourceLine':chord_line+event['line']-generated_chord_line,'sourcePitches':event['pitches']})
 chord_events.sort(key=lambda c:c['start'])
 if not chord_events or chord_events[0]['start']!=0 or abs(chord_events[-1]['end']-float(total))>1e-8:raise ValueError('Incomplete harmony coverage')
 for a,b in zip(chord_events,chord_events[1:]):
  if abs(a['end']-b['start'])>1e-8:raise ValueError('Harmony gap or overlap')
 notes,ppq=decode_midi(work_dir/(stem+'.midi'))
 if not notes or any(n['duration']<=0 or n['start']<0 or n['start']+n['duration']>float(total)+1e-7 for n in notes):raise ValueError('Invalid source MIDI bounds')
 for a,b in zip(notes,notes[1:]):
  if a['start']+a['duration']>b['start']+1e-7:raise ValueError('Polyphonic source melody requires voice selection review')
 local=path.relative_to(source_root).as_posix();identifier='openbook-'+slug(attrs['title'])+'-'+slug(version)
 provenance={'format':'LilyPond','repository':REPO,'repositoryCommit':COMMIT,'path':local,'url':REPO+'/blob/'+COMMIT+'/'+local,'rawUrl':'https://raw.githubusercontent.com/veltzer/book-openbook/'+COMMIT+'/'+local,'sha256':sha(path),'sourceRights':attrs.get('copyright'),'sourceRightsExtra':attrs.get('copyrightextra'),'sourceVersion':version,'sourceStructure':attrs.get('structure'),'sourceKeySignature':{'root':tonic[0],'mode':tonic[1]},'tonicBasis':'Explicit initial LilyPond key and mode; no pitch-distribution estimate','sourceMeters':['/'.join(map(str,meter))],'unfoldStatus':'expanded by LilyPond unfold-repeats-fully and matching MIDI unfoldRepeats','tiesMerged':True,'decoder':'LilyPond 2.26.0','sourcePPQ':ppq,'sections':{'chords':{'name':'Chords'+version,'startLine':chord_line},'melody':{'name':'Voice'+version,'startLine':voice_line}},'irregularMeasures':[],'leadOverfullMeasures':[],'leadUnderfullMeasures':[],'conflictingHarmonies':[],'omittedHarmonyAnnotations':[],'titleMetadata':{'selectedFrom':'source attributes.title','printedTitle':attrs['title'],'workTitle':attrs['title'],'movementTitle':None,'filenameTitle':path.name},'skipPolicy':'SkipEvent omits a chord label and continues preceding explicit harmony; RestEvent is NC; initial skip is unharmonized. Continuation locations retained per chord.','sourceIntervalPolicy':'Independently compiled slash-free chord core supplies explicit compound intervals only where vocabulary differs; slash bass remains separate. No inferred tones.' if allow_source_intervals else None,'validation':'Exact source compiler durations, regular bar checks, complete harmony coverage, monophonic note bounds, chord-token versus compiled pitch-class validation'}
 if not allow_source_intervals:provenance.pop('sourceIntervalPolicy',None)
 if pickup:
  provenance['irregularMeasures']=[{**measure,'kind':'pickup' if i==0 else 'source-tail'} for i,measure in enumerate(measures) if abs(measure['duration']-float(bar_beats))>1e-8]
  provenance['pickupPolicy']='One matching initial LilyPond PartialSet in both compiled streams. MIDI onsets and durations remain unchanged; source measure0 is the pickup. No padding, cropping or stretching.'
  provenance['validation']='Exact source compiler durations, pickup-aligned bar checks, complete harmony coverage, monophonic note bounds, chord-token versus compiled pitch-class validation'
 return {'id':identifier,'melodyId':identifier,'normalizedTitle':normalize(attrs['title']),'title':attrs['title'],'composer':attrs.get('composer',''),'tonic':tonic,'tonicConfidence':'high','meter':meter,'barBeats':rounded(bar_beats),'bars':len(measures),'totalBeats':rounded(total),'pickupBeats':rounded(pickup),'notes':notes,'chords':chord_events,'measures':measures,'provenance':provenance,'midi':'melodies/'+identifier+'.mid'}

def apply_harmonic_reference(entry,reference,original):
 """Curated home tonic is distinct from the literal LilyPond key declaration.
 Only pinned, explicit source chord evidence may establish this exception.
 No melody, source harmony, duration or declared-key provenance is rewritten.
 """
 p=entry['provenance'];declared=reference['sourceDeclaredKey'];target=reference['normalizationTonic']
 if (entry['id']!=reference['melodyId'] or p['path']!=reference['sourcePath'] or p['sourceVersion']!=reference['sourceVersion'] or p['sha256']!=reference['sourceSha256'] or entry['tonic']!=[declared['root'],declared['mode']] or p['sourceKeySignature']!=declared):raise ValueError('Harmonic reference source identity mismatch')
 if original['index']!=reference['canonicalSong'] or target['mode']!='Minor' or original['tonic'][1]!='Minor' or pc(target['root'])!=pc(original['tonic'][0]):raise ValueError('Harmonic reference canonical identity mismatch')
 chords=entry['chords'];tonic=pc(target['root'])
 def checked(event):
  index=event['index']
  if not isinstance(index,int) or index<0 or index>=len(chords):raise ValueError('Harmonic reference event missing')
  c=chords[index]
  if any(c.get(key)!=event.get(key) for key in ['symbol','start','end','sourceLine']):raise ValueError('Harmonic reference event changed')
  match=re.match(r'^([A-G][b#]*)',c['symbol'])
  if not match:raise ValueError('Harmonic reference event is silent')
  root=pc(match[1]);intervals={(pitch-root)%12 for pitch in c.get('sourceCorePitches',c['sourcePitches'])}
  return root,intervals
 evidence=reference['evidence'];events=evidence['tonicChordEvents'];resolutions=evidence['dominantResolutions']
 if len(events)<2 or not resolutions:raise ValueError('Insufficient harmonic reference evidence')
 for event in events:
  root,intervals=checked(event)
  if root!=tonic or 3 not in intervals or 4 in intervals:raise ValueError('Harmonic reference tonic is not compiled minor')
 for resolution in resolutions:
  d,t=resolution['dominant'],resolution['tonic'];root,intervals=checked(d);tr,ti=checked(t)
  if t['index']!=d['index']+1 or abs(d['end']-t['start'])>1e-7 or root!=(tonic+7)%12 or not {4,10}<=intervals or tr!=tonic or 3 not in ti or 4 in ti:raise ValueError('Harmonic reference resolution is not an adjacent source V7-i')
 p['sourceDeclaredKey']=dict(declared);p['normalizationTonic']=dict(target);p['harmonicTonicReference']=reference
 p['tonicBasis']='Explicit curated harmonic reference: recurring compiled minor tonic, source V7-i resolution and canonical roadmap tonic; literal source key retained separately'
 entry['tonic']=[target['root'],target['mode']];entry['tonicConfidence']='high'
 return entry

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=Path,required=True);parser.add_argument('--lilypond',required=True);parser.add_argument('--work-dir',type=Path,default=Path(tempfile.gettempdir())/'insights-openbook-build');parser.add_argument('--archive',type=Path);parser.add_argument('--only',default=None);parser.add_argument('--jobs',type=int,default=4);parser.add_argument('--append-missing',action='store_true');parser.add_argument('--source-intervals',action='store_true');parser.add_argument('--pickups',action='store_true');args=parser.parse_args();args.work_dir.mkdir(parents=True,exist_ok=True)
 prior=json.loads((ROOT/'dist/data/openbook-melodies.json').read_text()) if args.append_missing else None
 prior_audit=json.loads((ROOT/'evidence/openbook-melody-audit.json').read_text()) if args.append_missing else None
 existing_titles={e['normalizedTitle'] for e in prior['entries']} if prior else set()
 originals=json.loads((ROOT/'dist/data/roadmaps.json').read_text())['songs'];by_title={normalize(s['title']):s for s in originals};qualities=json.loads((ROOT/'src/music/chord-vocabulary.json').read_text())['qualities'];paths=[];metadata_errors=[]
 aliases_file=ROOT/'src/music/melody-title-aliases.json';aliases={}
 if aliases_file.exists():
  alias_data=json.loads(aliases_file.read_text())
  if alias_data['sourceCommit']!=COMMIT:raise ValueError('Title alias source commit mismatch')
  for alias in alias_data['entries']:
   song=originals[alias['canonicalSong']];key=normalize(alias['sourceTitle'])
   if song['title']!=alias['canonicalTitle'] or song.get('composer','')!=alias['canonicalComposer'] or key in by_title and by_title[key]['index']!=song['index'] or key in aliases:raise ValueError('Ambiguous title alias')
   by_title[key]=song;aliases[key]=alias
 references_file=ROOT/'src/music/melody-tonic-references.json';references={}
 if references_file.exists():
  references_data=json.loads(references_file.read_text())
  if references_data['sourceCommit']!=COMMIT:raise ValueError('Harmonic reference source commit mismatch')
  references={r['melodyId']:r for r in references_data['entries']}
  if len(references)!=len(references_data['entries']):raise ValueError('Duplicate harmonic reference')
 archive=args.archive or args.source_dir.parent/'openbook.tar.gz'
 with tarfile.open(archive) as packed:
  if packed.pax_headers.get('comment')!=COMMIT:raise ValueError('Source archive commit does not match pinned OpenBook revision')
  archive_hashes={member.name.split('/',1)[1]:hashlib.sha256(packed.extractfile(member).read()).hexdigest() for member in packed.getmembers() if member.isfile() and '/src/openbook/' in member.name}
 for path in sorted((args.source_dir/'src/openbook').glob('*.ly.tera')):
  try:
   local=path.relative_to(args.source_dir).as_posix()
   if archive_hashes.get(local)!=sha(path):raise ValueError('Extracted source differs from pinned archive')
   meta=tomllib.loads(re.search(r'{#(.*?)#}',path.read_text(),re.S)[1]);title=meta['attributes']['title']
   alias=aliases.get(normalize(title))
   if alias and (alias['sourcePath']!=local or alias['sourceSha256']!=sha(path) or alias['sourceComposer']!=meta['attributes'].get('composer')):raise ValueError('Title alias source identity mismatch')
   if normalize(title) in by_title and normalize(title) not in existing_titles and (not args.only or normalize(args.only)==normalize(title)):paths.append((path,meta))
  except Exception as error:metadata_errors.append({'path':str(path.relative_to(args.source_dir)),'reason':str(error)})
 def run(item):
  path,meta=item;versions=list(dict.fromkeys(['Real',meta.get('default_version')]+list(meta.get('versions',{}))));attempts=[]
  for version in versions:
   if version not in meta.get('versions',{}):continue
   try:
    entry=decode(path,version,args.lilypond,qualities,args.source_dir,args.work_dir,args.source_intervals,args.pickups)
    original=by_title[entry['normalizedTitle']]
    alias=aliases.get(entry['normalizedTitle'])
    if alias:entry['compositionTitle']=alias['canonicalTitle'];entry['provenance']['compositionIdentity']={'canonicalSong':alias['canonicalSong'],'canonicalTitle':alias['canonicalTitle'],'sourceTitle':entry['title'],'canonicalComposer':alias['canonicalComposer'],'sourceComposer':entry['composer'],'basis':'Explicit reviewed title alias; source title and credits retained without rewriting'}
    if entry['id'] in references:entry=apply_harmonic_reference(entry,references[entry['id']],original)
    if entry['tonic'][1].lower()!=original['tonic'][1].lower():raise ValueError('Source key declaration mode disagrees with original harmonic mode; requires tonic review')
    return entry,attempts
   except Exception as error:attempts.append({'title':meta['attributes']['title'],'path':str(path.relative_to(args.source_dir)),'version':version,'reason':str(error)})
  return None,attempts
 entries=list(prior['entries']) if prior else [];failures=[]
 with ThreadPoolExecutor(max_workers=args.jobs) as pool:
  for i,(entry,attempts) in enumerate(pool.map(run,paths)):
   failures.extend(attempts)
   if entry:
    entries.append(entry);target=ROOT/'dist'/entry['midi'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(midi_bytes(entry['notes'],entry['title'],entry['totalBeats']))
   print(str(i+1)+'/'+str(len(paths)),entry['title'] if entry else 'excluded',flush=True)
 entries.sort(key=lambda e:(e['normalizedTitle'],e['id']));source={'archiveSha256':sha(archive),'archivePaxCommit':COMMIT,'name':'OpenBook','repository':REPO,'commit':COMMIT,'format':'LilyPond','downloaded':'2026-11-17','repositoryLicenseFile':(args.source_dir/'LICENSE').read_text(),'repositoryReadmeRights':'README states GPL version 3; current LICENSE file is MIT. Source compositions retain individual copyright notices.','licenseFileSha256':sha(args.source_dir/'LICENSE')}
 if not args.only:
  current_midis={Path(e['midi']).name for e in entries}
  for old in (ROOT/'dist/melodies').glob('openbook-*.mid'):
   if old.name not in current_midis:old.unlink()
 output={'version':1,'timeUnit':'quarter-note','pitchBasis':'source','sources':[source],'entries':entries};(ROOT/'dist/data/openbook-melodies.json').write_text(json.dumps(output,separators=(',',':'),ensure_ascii=False)+'\n')
 audit={'version':1,'sources':[source],'counts':{'originalTitleSources':(prior_audit['counts']['originalTitleSources'] if prior_audit else len(paths)),'validatedArrangements':len(entries),'notes':sum(len(e['notes']) for e in entries),'attemptsExcluded':len(failures),'sourceIntervalOverrides':sum('sourceIntervals' in c for e in entries for c in e['chords'])},'policy':{'selection':'Only original-catalogue titles or pinned explicit title aliases. Prefer complete Real version, then declared default, then remaining encoded versions; first fully validated arrangement per composition.','tonic':'Literal source key/mode retained. Pinned curated harmonic references may select the canonical minor home only with recurring compiled minor-tonic chords and explicit V7-i source resolutions. All other source/canonical mode conflicts remain excluded; no blind relative-major fallback.','skips':'Blank chord-label skips hold preceding harmony with explicit continuation provenance; rests are NC and initial blanks remain NC.','navigation':'Textual DC/DS/Coda excluded. One matching initial source-compiled pickup and final partial measure map are admitted only with --pickups; no inferred return or invented note. Written volta and alternatives unfolded by LilyPond.','timing':'Compiled melody MIDI and independently unfolded chord AST must have equal total duration; every explicit barcheck must be on the source meter grid after any admitted pickup. Exact source measure durations retained without padding, cropping or stretching.','sourceChordValidation':'Direct syntax agrees exactly with compiled pitches. Where vocabulary differs, independently compiled slash-free source chord cores provide explicit compound intervals; original and core pitch-class sets plus explicit bass must agree.','alignment':'Entries are whole source arrangements. Existing roadmap compatibility still requires exact root/rhythm check; title match alone never authorizes melody overlay.'},'entries':[{'id':e['id'],'title':e['title'],'originalSong':by_title[e['normalizedTitle']]['index'],'originalBars':by_title[e['normalizedTitle']]['bars'],'sourceBars':e['bars'],'notes':len(e['notes']),'chords':len(e['chords']),'provenance':e['provenance']} for e in entries],'excludedAttempts':failures,'metadataErrors':metadata_errors}
 (ROOT/'evidence/openbook-melody-audit.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False)+'\n');print(json.dumps(audit['counts']))

if __name__=='__main__':main()
