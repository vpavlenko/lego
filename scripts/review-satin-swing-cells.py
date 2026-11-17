#!/usr/bin/env python3
"""Reproduce the bounded Satin Doll performance review; never edit melody data."""
import argparse,hashlib,importlib.util,io,json,subprocess,zipfile
from fractions import Fraction
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
IDENTIFIER='openbook-satin-doll-laurent'
SOURCE_PATH='src/openbook/satin_doll.ly.tera'
SOURCE_SHA='bc81849b766df62a5825a53c4bd70437877f1a1e69dbb6a3aa417ca9a1e722f5'
ARCHIVE_SHA='e7bce509462a73cee175308b6a3cdafa9effd6e8958b3ce03b4edb293cc6b691'
MEMBER='Wikifonia/Billy Strayhorn, Duke Ellington - Satin Doll.mxl'
MEMBER_SHA='5f42c3fd67ee40929a699fb4e4cfc6580558dee676dffd3e0abae4f8e3e72d05'
XML_SHA='0a91e013e1519a19c4fc0ac1d59a47c661e36ade5ace4a4e94c71d748728e6d1'
CELLS=[0,8,32,40,65,66,69,70,80,82,84,86,96,104]
NOTATION={0:"a'8. g16",8:'b8. a16',32:"a'8. g16",40:'b8. a16',65:'bes8. a16',66:'g8. a16',69:'bes8. a16',70:'g8. a16',80:'d8. c16',82:'a~ a8. b16',84:'d8. c16',86:'a~ a8. b16',96:'a8. g16',104:'b8. a16'}
sha=lambda data:hashlib.sha256(data).hexdigest()
def json_sha(value):return sha(json.dumps(value,sort_keys=True,separators=(',',':')).encode())
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=Path,required=True);parser.add_argument('--lilypond',required=True);parser.add_argument('--wikifonia-archive',type=Path,required=True);parser.add_argument('--work-dir',type=Path,required=True);parser.add_argument('--check',action='store_true');a=parser.parse_args();a.work_dir.mkdir(parents=True,exist_ok=True)
 assert subprocess.check_output([a.lilypond,"--version"],text=True).splitlines()[0].startswith("GNU LilyPond 2.26.0 ")
 source=(a.source_dir/SOURCE_PATH).read_bytes();assert sha(source)==SOURCE_SHA;source_lines=source.decode().splitlines()
 spec=importlib.util.spec_from_file_location('openbook_review_importer',ROOT/'scripts/import-openbook-melodies.py');ob=importlib.util.module_from_spec(spec);spec.loader.exec_module(ob);qualities=json.loads((ROOT/'src/music/chord-vocabulary.json').read_text())['qualities']
 decoded=[]
 for diagnostic in [False,True]:
  work=a.work_dir/('diagnostic'if diagnostic else'normal');work.mkdir(exist_ok=True);decoded.append(ob.decode(a.source_dir/SOURCE_PATH,'Laurent',a.lilypond,qualities,a.source_dir,work,reviewed_navigation=diagnostic))
 assert decoded[0]['notes']==decoded[1]['notes'];e=decoded[0]
 entries=json.loads((ROOT/'dist/data/openbook-melodies.json').read_text())['entries'];entries=entries.values()if isinstance(entries,dict)else entries;stored=next(v for v in entries if v['id']==IDENTIFIER);assert stored['notes']==e['notes'];assert len(e['notes'])==97 and e['totalBeats']==128
 stem='satin-doll-ly-laurent';normal_midi=a.work_dir/'normal'/(stem+'.midi');diag_midi=a.work_dir/'diagnostic'/(stem+'.midi');assert ob.decode_midi(normal_midi)==ob.decode_midi(diag_midi)
 generated=(a.work_dir/'diagnostic'/(stem+'.ly')).read_text();line_offset=e['provenance']['sections']['melody']['startLine']-(generated[:generated.index('\\dump "voice"')].count('\n')+1)
 raw=[];stream=None
 for line in(a.work_dir/'diagnostic'/(stem+'.log')).read_text().splitlines():
  if line.startswith('BEGIN\t'):stream=line.split('\t')[1]
  elif stream=='voice'and line.startswith('DATA\tNOTE\t'):
   _,_,start,duration,lineno,char,_=line.split('\t');raw.append({'start':float(Fraction(start)),'duration':float(Fraction(duration)),'sourceLine':int(lineno)+line_offset,'sourceColumn':int(char)})
 archive=a.wikifonia_archive.read_bytes();assert sha(archive)==ARCHIVE_SHA;mxl=zipfile.ZipFile(io.BytesIO(archive)).read(MEMBER);assert sha(mxl)==MEMBER_SHA;z=zipfile.ZipFile(io.BytesIO(mxl));container=ET.fromstring(z.read('META-INF/container.xml'));inner=next(v.attrib['full-path']for v in container.iter()if v.tag.endswith('rootfile'));xml=z.read(inner);assert sha(xml)==XML_SHA;score=ET.fromstring(xml);assert len(score.findall('part'))==1 and not score.findall('.//backup')and not score.findall('.//forward')and not score.findall('.//note/chord');assert not score.findall('.//transpose')
 measures=score.findall('part/measure');assert len(measures)==26
 expected_marks={1:[('repeat',{'direction':'forward'})],7:[('ending',{'type':'start','number':'1'})],8:[('ending',{'type':'stop','number':'1'}),('repeat',{'direction':'backward'})],9:[('ending',{'type':'start','number':'2'})],10:[('ending',{'type':'discontinue','number':'2'})]}
 actual_marks={i+1:[(v.tag,v.attrib)for v in m.iter()if v.tag in['repeat','ending']]for i,m in enumerate(measures)if any(v.tag in['repeat','ending']for v in m.iter())};assert actual_marks==expected_marks
 written=[];div=None
 for m in measures:
  if m.findtext('attributes/divisions'):div=int(m.findtext('attributes/divisions'))
  at=0;notes=[]
  for n in m.findall('note'):
   duration=int(n.findtext('duration','0'))/div;p=n.find('pitch');pitch=None if p is None else(int(p.findtext('octave'))+1)*12+dict(C=0,D=2,E=4,F=5,G=7,A=9,B=11)[p.findtext('step')]+int(p.findtext('alter','0'))
   notes.append({'start':at,'duration':duration,'pitch':pitch,'writtenType':n.findtext('type'),'dots':len(n.findall('dot')),'sourceDuration':n.findtext('duration'),'divisions':div});at+=duration
  assert at==4;written.append(notes)
 route=list(range(8))+list(range(6))+list(range(8,26));assert len(route)==32
 all_edges={q:sorted({n["start"]-q for n in e["notes"]if q<n["start"]<q+1}|{n["start"]+n["duration"]-q for n in e["notes"]if q<n["start"]+n["duration"]<q+1})for q in range(128)}
 assert [q for q,edges in all_edges.items()if edges==[.75]]==CELLS
 assert all(edges in [[],[.5],[.75]]for edges in all_edges.values())
 rows=[];audits=[]
 for q in CELLS:
  bounds=sorted({n['start']-q for n in e['notes']if q<n['start']<q+1}|{n['start']+n['duration']-q for n in e['notes']if q<n['start']+n['duration']<q+1});assert bounds==[.75]
  whole=[dict(index=i,**{k:n[k]for k in['pitch','start','duration']})for i,n in enumerate(e['notes'])if n['start']<q+1 and n['start']+n['duration']>q];assert len(whole)==2
  physical=[v for v in raw if q<=v['start']<q+1];assert[(v['start'],v['duration'])for v in physical]==[(q,.75),(q+.75,.25)];line=physical[0]['sourceLine'];assert all(v['sourceLine']==line for v in physical);literal=NOTATION[q];assert literal in source_lines[line-1]
  source_bar=route[q//4];within=q%4;w=[v for v in written[source_bar]if within<=v['start']<within+1];assert len(w)==2 and[v['start']-within for v in w]==[0,.5]and[v['duration']for v in w]==[.5,.5]and[v['writtenType']for v in w]==['eighth','eighth']and all(v['dots']==0 for v in w);assert[w[0]['pitch'],w[1]['pitch']]==[whole[0]['pitch'],whole[1]['pitch']]
  rows.append({'start':q,'sourceSplit':.75,'notes':whole,'sourceLine':line,'sourceNotation':literal})
  audits.append({'start':q,'performedBar':q//4+1,'kind':'tied-first-segment'if whole[0]['start']<q else'dotted-eighth-sixteenth-pair','compiledWrittenSegments':physical,'compiledMergedEvents':whole,'sourceLiteralLine':source_lines[line-1],'witness':{'writtenMeasureNumber':measures[source_bar].attrib['number'],'withinMeasure':within,'notes':w},'targetSplit':.67})
 source_evidence={'repository':'https://github.com/veltzer/book-openbook','commit':'adbe5c68ff59e20068dd754e7d227979fa628d33','path':SOURCE_PATH,'sha256':SOURCE_SHA,'version':'Laurent','writtenMeter':[4,4],'writtenTempo':'\\tempo "Andante" 4 = 60','style':'Jazz','piece':'Smoothly','explicitSwingMark':False}
 witness_evidence={'archiveUrl':'https://web.archive.org/web/20140701055029id_/http://www.synthzone.com/files/Wikifonia/Wikifonia.zip','archiveSha256':ARCHIVE_SHA,'member':MEMBER,'memberSha256':MEMBER_SHA,'xmlSha256':XML_SHA,'writtenMeter':[4,4],'writtenMeasures':26,'performedSourceMeasureNumbers':[str(i+1)for i in route],'explicitSwingMark':False}
 evidence={'source':source_evidence,'witness':witness_evidence,'policy':'Curated performance interpretation at the user-requested 0.67 split. The source literally writes dotted eighth plus sixteenth; the independent matching-pitch witness writes two undotted eighths in all reviewed cells. This is not a claim that every dotted rhythm encodes swing.','literalNotation':sorted(set(NOTATION.values())),'audit':'evidence/satin-doll-swing-cells.json'}
 review={'version':1,'entries':[{'melodyId':IDENTIFIER,'sourceSha256':SOURCE_SHA,'cells':rows,'evidence':evidence}]}
 midi=ROOT/'dist/melodies'/(IDENTIFIER+'.mid');assert midi.exists()
 audit={'version':1,'melodyId':IDENTIFIER,'performanceIndexAtReview':332,'source':source_evidence,'witness':witness_evidence,'compiler':{'version':'LilyPond 2.26.0','sourceNotes':97,'sourceQuarterBeats':128,'sourceNotesSha256':json_sha(e['notes']),'normalAndDiagnosticMidiEventsIdentical':True,'committedSourceNotesEqualFreshCompiler':True},'counts':{'reviewedCells':14,'ordinaryPairs':12,'tiedFirstSegments':2,'ordinaryHalfSplitCells':sum(edges==[.5]for edges in all_edges.values()),'unreviewedThreeQuarterSplitCells':0,'otherRhythmicGridCells':0,'ambiguousHeldOffCells':0},'sourceMidi':{'path':midi.relative_to(ROOT).as_posix(),'sha256':sha(midi.read_bytes())},'cells':audits,'scope':'Performance-only data review. No source entry, note, MIDI, lyric, chord, or arrangement is edited. Only the pinned source and listed cells qualify; two held first segments remain one MIDI attack.'}
 for path,data in[(ROOT/'src/music/swing-cell-reviews.json',review),(ROOT/'evidence/satin-doll-swing-cells.json',audit)]:
  encoded=json.dumps(data,indent=2)+'\n'
  if a.check:assert path.read_text()==encoded,str(path)+' differs'
  else:path.write_text(encoded)
 print(json.dumps({'melodyId':IDENTIFIER,'sourceHash':SOURCE_SHA,'cells':CELLS,'ordinaryPairs':12,'tiedCases':[82,86],'target':.67,'freshCompilerNotes':97,'witnessCellsPitchAndPlainEighthsVerified':14}))
if __name__=='__main__':main()
