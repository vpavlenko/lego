#!/usr/bin/env python3.11
"""Inventory written dotted timing without changing source or performance data."""
from pathlib import Path
from fractions import Fraction
from concurrent.futures import ThreadPoolExecutor,as_completed
from collections import Counter,defaultdict
import argparse,hashlib,json,math,re,subprocess,importlib.util,xml.etree.ElementTree as ET,zipfile
EPS=1e-7
sha=lambda b:hashlib.sha256(b).hexdigest()
roundq=lambda x:round(float(x),9)
def close(a,b):return abs(float(a)-float(b))<EPS
def read(p):return json.loads(Path(p).read_text())
def note_signature(notes):return [(n['pitch'],roundq(n['start']),roundq(n['duration'])) for n in notes]
def active_inventory(project):
 pool=read(project/'dist/data/melody-sources.json');songs=read(project/'dist/data/standards.json')['songs'];usage=defaultdict(list);performances=[]
 for song in songs:
  path=project/f"dist/data/performances/{song['index']:03d}.json";data=read(path);assert data['song']==song['index'],path
  performances.append({'song':song['index'],'path':str(path.relative_to(project)),'sha256':sha(path.read_bytes()),'noteCount':len(data['notes']),'melodyId':(data.get('melody') or {}).get('id')})
  if song.get('melodyId'):usage[song['melodyId']].append({'song':song['index'],'title':song['title'],'composition':song.get('arrangementOf',song['index']),'basis':'explicit melodyId'})
 for match in pool['existingMatches']:
  song=songs[match['song']];usage[match['melodyId']].append({'song':song['index'],'title':song['title'],'composition':song.get('arrangementOf',song['index']),'basis':'existingMatches','transpose':match['transpose'],'beatOffset':match['beatOffset']})
 assert len(performances)==len(songs)==len(list((project/'dist/data/performances').glob('*.json')))
 assert {p['melodyId'] for p in performances if p['melodyId']}==set(usage),'active head mapping differs from stored performances'
 # Every active written source note must reach its stored performance unchanged,
 # apart from its explicitly pinned constant key/beat offset.
 for id,uses in usage.items():
  e=pool['entries'][id]
  for use in uses:
   perf=read(project/f"dist/data/performances/{use['song']:03d}.json");actual=[n for n in perf['notes'] if n.get('voice')==1];meta=perf['melody'];expected=[(n['pitch']+meta['transpose'],roundq(n['start']+meta['beatOffset']),roundq(n['duration'])) for n in e['notes']]
   assert note_signature(actual)==expected,(id,use['song'],'performance note identity')
 return pool,songs,dict(usage),performances

def note_rest_segments(entry):
 result=[];cursor=0;issues=[]
 for index,n in sorted(enumerate(entry['notes']),key=lambda x:(x[1]['start'],x[0])):
  start=n['start'];end=start+n['duration']
  if start<cursor-EPS:issues.append({'kind':'overlapping-selected-notes','noteIndex':index,'at':start})
  if start>cursor+EPS:result.append({'start':cursor,'end':start,'kind':'rest','noteIndex':None})
  result.append({'start':start,'end':end,'kind':'note','noteIndex':index,'pitch':n['pitch']});cursor=max(cursor,end)
 if cursor<entry['totalBeats']-EPS:result.append({'start':cursor,'end':entry['totalBeats'],'kind':'rest','noteIndex':None})
 return result,issues

def grid_starts(entry,unit):
 if not entry.get('measures'):return [i*unit for i in range(math.floor(entry['totalBeats']/unit+EPS))]
 starts=set()
 for m in entry['measures']:
  a=m['start'];b=a+m['duration'];origin=a
  if str(m['sourceNumber'])=='0' and m['duration']<entry['barBeats']-EPS:origin=b-math.floor(m['duration']/unit+EPS)*unit
  k=0
  while origin+k*unit+unit<=b+EPS:starts.add(roundq(origin+k*unit));k+=1
 return sorted(starts)

def timeline_cells(entry,segments):
 cells={}
 for unit in [1,.5]:
  for start in grid_starts(entry,unit):
   mid=start+.75*unit;end=start+unit
   left=[s for s in segments if s['start']<=start+EPS and close(s['end'],mid)];right=[s for s in segments if close(s['start'],mid) and s['end']>=end-EPS]
   if left and right:
    cells[(roundq(start),unit)]={'start':start,'unit':unit,'gridAligned':True,'left':left,'right':right,'evidenceKinds':['stored-note/rest-quarter-cell']}
 return cells

def apply_source_routes(entry,units):
 navigation=entry['provenance'].get('reviewedNavigation')
 if not navigation:return units
 result=[]
 for route in navigation['trace']:
  for unit in units:
   a=max(unit['start'],route['sourceStart']);b=min(unit['end'],route['sourceEnd'])
   if b<=a+EPS:continue
   result.append({**unit,'linearStart':unit['start'],'linearEnd':unit['end'],'start':roundq(route['performedStart']+a-route['sourceStart']),'end':roundq(route['performedStart']+b-route['sourceStart']),'route':route['route'],'routeRestClipped':not(close(a,unit['start']) and close(b,unit['end']))})
 return result

def match_written_units(entry,units):
 """Keep explicit source units, including tie pieces/rests; never infer attacks."""
 issues=[];selected=[]
 for index,u in enumerate(units):
  matches=[i for i,n in enumerate(entry['notes']) if n['pitch'] in u.get('pitches',[]) and n['start']<=u['start']+EPS and n['start']+n['duration']>=u['end']-EPS]
  if u['kind']=='rest':
   overlap=[i for i,n in enumerate(entry['notes']) if min(n['start']+n['duration'],u['end'])-max(n['start'],u['start'])>EPS]
   if overlap:issues.append({'kind':'written-rest-overlaps-retained-note','writtenUnit':index,'noteIndexes':overlap})
   selected.append({**u,'unitIndex':index,'noteIndex':None})
  elif len(matches)==1:selected.append({**u,'unitIndex':index,'noteIndex':matches[0],'pitch':entry['notes'][matches[0]]['pitch'],'tiePiece':entry['notes'][matches[0]]['start']<u['start']-EPS or entry['notes'][matches[0]]['start']+entry['notes'][matches[0]]['duration']>u['end']+EPS})
  else:
   issues.append({'kind':'written-note-not-uniquely-covered','writtenUnit':index,'start':u['start'],'end':u['end'],'pitches':u.get('pitches',[]),'matches':matches});selected.append({**u,'unitIndex':index,'noteIndex':None,'unresolvedCoverage':True})
 for i,n in enumerate(entry['notes']):
  pieces=sorted((u for u in selected if u.get('noteIndex')==i),key=lambda u:u['start']);cursor=n['start']
  for u in pieces:
   if u['start']>cursor+EPS:break
   cursor=max(cursor,u['end'])
  if cursor<n['start']+n['duration']-EPS:issues.append({'kind':'stored-note-not-covered-by-written-units','noteIndex':i,'start':n['start'],'duration':n['duration']})
 return selected,issues

def lily_units(entry,args,module):
 p=entry['provenance'];source=args.openbook_source/p['path'];data=source.read_bytes();assert sha(data)==p['sha256'],source
 raw,line=module.section(data.decode(),'Voice'+p['sourceVersion']);voice=module.clean(raw);work=args.work_dir/'lily'/entry['id'];work.mkdir(parents=True,exist_ok=True)
 scheme=module.SCHEME.replace("((eq? name 'EventChord)","((eq? name 'GraceMusic) #f) ((eq? name 'MultiMeasureRestMusic) (emit \"REST\" start m)) ((eq? name 'NoteEvent) (emit \"NOTE\" start m)) ((eq? name 'EventChord)")
 old_ns="(ns (filter (lambda (x) (ly:pitch? (ly:music-property x 'pitch))) (ly:music-property m 'elements)))"
 new_ns="(ns (if (eq? (ly:music-property m 'name) 'NoteEvent) (list m) (filter (lambda (x) (ly:pitch? (ly:music-property x 'pitch))) (ly:music-property m 'elements))))"
 assert old_ns in scheme;scheme=scheme.replace(old_ns,new_ns)
 glyph=r'''(let ((d (if (pair? ns) (ly:music-property (car ns) 'duration) (ly:music-property m 'duration)))) (if (ly:duration? d) (format #t "GLYPH\t~a\t~a\t~a\t~a\t~a\n" start (ly:duration-log d) (ly:duration-dot-count d) (cadr loc) (caddr loc)))) '''
 scheme=scheme.replace('(let ((primary',glyph+'(let ((primary')
 prefix=scheme+'\n\\score { \\new Staff { \\set Staff.midiInstrument = "alto sax" \\dump "voice" \\unfoldRepeats \\relative c\' '
 generated=prefix+voice+' } \\midi {} }\n';ly=work/'source.ly';log=work/'source.log';expected=sha(generated.encode())
 if not ly.exists() or sha(ly.read_bytes())!=expected or not log.exists():
  ly.write_text(generated);result=subprocess.run([str(args.lilypond),'-dno-print-pages','-o',str(work/'source'),str(ly)],capture_output=True,text=True);log.write_text(result.stdout+'\n'+result.stderr)
  if result.returncode:raise RuntimeError('LilyPond failed '+entry['id']+': '+log.read_text()[-400:])
 units=[];glyphs={};total=None;lines=generated.splitlines();voice_line=prefix.count('\n')+1
 for text in log.read_text().splitlines():
  if text.startswith('TOTAL\tvoice\t'):total=roundq(Fraction(text.split('\t')[2]))
  if text.startswith('GLYPH\t'):
   _,at,log2,dots,lineno,char=text.split('\t');glyphs[(roundq(Fraction(at)),int(lineno),int(char))]={'sourceDenominator':2**int(log2),'dots':int(dots)};continue
  if not text.startswith('DATA\t'):continue
  _,kind,start,duration,lineno,char,pitches=text.split('\t');duration=Fraction(duration)
  if kind not in ['CHORD','NOTE','REST','SKIP'] or duration<=0:continue
  location=lines[int(lineno)-1][int(char):];token=re.match(r'[^\s{}|]+',location);token=token[0] if token else ''
  units.append({'start':roundq(Fraction(start)),'end':roundq(Fraction(start)+duration),'writtenDuration':str(duration),'kind':'rest' if kind in ['REST','SKIP'] else 'note','pitches':[int(v) for v in pitches.split(',') if v],'sourceLine':line+int(lineno)-voice_line,'sourceToken':token,'generatedLine':int(lineno),'generatedCharacter':int(char)})
 if total is None:raise RuntimeError('Missing compiler total '+entry['id'])
 for unit in units:unit.update(glyphs.get((unit['start'],unit['generatedLine'],unit['generatedCharacter']),{}))
 units=apply_source_routes(entry,units);selected,issues=match_written_units(entry,units)
 if not close(total,entry['provenance'].get('reviewedNavigation',{}).get('plan',{}).get('linearTotalBeats',entry['totalBeats'])):issues.append({'kind':'source-total-differs','compiledTotal':total,'entryTotal':entry['totalBeats']})
 literal=[{'sourceLine':line+raw[:m.start()].count('\n'),'token':m[0]} for m in re.finditer(r'(?<!\d)16\.+',raw)]
 return selected,{'format':'LilyPond','sourcePath':p['path'],'sourceSha256':sha(data),'localSource':str(source),'sourceVersion':p['sourceVersion'],'compiler':'LilyPond 2.26.0','generatedSha256':expected,'compilerLog':str(log),'compilerLogSha256':sha(log.read_bytes()),'linearTotalBeats':total,'writtenUnits':len(units),'selectedUnits':len(selected),'literalDotted16thTokens':literal,'graceCommands':len(re.findall(r'\\(?:grace|acciaccatura|appoggiatura|slashedGrace)\b',raw)),'issues':issues}

def xml_units(entry,args,xml_paths):
 p=entry['provenance'];id=entry['id']
 if id.startswith('psjazz-'):
  source=Path(xml_paths[id]['path']);data=source.read_bytes();container_sha=sha(data);xml=data;local=str(source)
 else:
  with zipfile.ZipFile(args.wikifonia_archive) as archive:data=archive.read(p['path'])
  container_sha=sha(data)
  from io import BytesIO
  with zipfile.ZipFile(BytesIO(data)) as packed:
   names=[n for n in packed.namelist() if n.lower().endswith(('.xml','.musicxml')) and not n.startswith('META-INF/')];assert len(names)==1;xml=packed.read(names[0])
  local=str(args.wikifonia_archive)+'!'+p['path']
 assert container_sha==p['sha256'],id
 root=ET.fromstring(xml)
 for node in root.iter():node.tag=node.tag.rsplit('}',1)[-1]
 selection=p.get('melodySelection',{});part=root.findall('part')[selection.get('partIndex',0)];voice=selection.get('voice');divisions=Fraction(1);written={};literal=[]
 for measure_index,measure in enumerate(part.findall('measure')):
  cursor=Fraction(0);previous=Fraction(0);units=[]
  for child_index,node in enumerate(measure):
   if node.tag=='attributes' and node.find('divisions') is not None:divisions=Fraction(node.findtext('divisions'))
   elif node.tag in ['backup','forward']:cursor+=(-1 if node.tag=='backup' else 1)*Fraction(node.findtext('duration','0'))/divisions
   elif node.tag=='note':
    duration=Fraction(node.findtext('duration','0'))/divisions;is_chord=node.find('chord') is not None;start=previous if is_chord else cursor
    if not is_chord:previous=start;cursor+=duration
    if node.find('grace') is not None or duration<=0:continue
    note_voice=node.findtext('voice')
    if voice is not None and note_voice not in [None,str(voice)]:continue
    pitch=node.find('pitch');kind='rest' if node.find('rest') is not None else 'note';pitches=[]
    if pitch is not None:pitches=[12*(int(pitch.findtext('octave'))+1)+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[pitch.findtext('step')]+int(pitch.findtext('alter','0'))]
    u={'start':roundq(start),'end':roundq(start+duration),'writtenDuration':str(duration),'kind':kind,'pitches':pitches,'sourceMeasure':measure.attrib.get('number'),'sourceMeasureIndex':measure_index,'sourceChildIndex':child_index,'sourceVoice':note_voice,'sourceType':node.findtext('type'),'dots':len(node.findall('dot')),'ties':sorted({n.attrib['type'] for n in node.findall('tie')+node.findall('notations/tied') if 'type' in n.attrib})}
    if is_chord and units and close(units[-1]['start'],u['start']) and close(units[-1]['end'],u['end']) and units[-1]['kind']==u['kind']=='note' and units[-1]['sourceVoice']==u['sourceVoice']:
     units[-1]['pitches']=sorted(set(units[-1]['pitches']+u['pitches']));units[-1].setdefault('sourceChordChildren',[]).append(child_index)
    else:units.append(u)
    if u['sourceType']=='16th' and u['dots']:literal.append({k:u[k] for k in ['sourceMeasure','sourceMeasureIndex','sourceChildIndex','dots','writtenDuration']})
  written.setdefault(measure.attrib.get('number',str(measure_index+1)),[]).append(units)
 units=[]
 mapping_reviews=[]
 for m in entry['measures']:
  label=str(m.get('writtenSourceNumber',m['sourceNumber']));choices=written.get(label,[]) or written.get(re.sub(r'[a-zA-Z]+$','',label),[])
  if len(choices)!=1:
   compatible=[]
   for group in [g for groups in written.values() for g in groups]:
    transformed=[{**u,'start':u['start']+m['start'],'end':u['end']+m['start']} for u in group]
    good=True
    for u in transformed:
     overlap=[n for n in entry['notes'] if min(n['start']+n['duration'],u['end'])-max(n['start'],u['start'])>EPS]
     if u['kind']=='rest':good=good and not overlap
     else:good=good and any(n['pitch'] in u['pitches'] and n['start']<=u['start']+EPS and n['start']+n['duration']>=u['end']-EPS for n in overlap)
    if good:compatible.append(group)
   signatures={json.dumps([{k:u.get(k) for k in ['start','end','kind','pitches','sourceType','dots','ties']} for u in group],sort_keys=True) for group in compatible}
   if not compatible or len(signatures)!=1:raise RuntimeError('XML measure label ambiguous '+id+' '+str(m['sourceNumber']))
   choices=compatible;mapping_reviews.append({'performedMeasure':m['sourceNumber'],'performedStart':m['start'],'physicalSourceMeasureIndexes':[g[0]['sourceMeasureIndex'] for g in choices if g],'basis':'Every physical duration/pitch/rest equals retained melody; all possible matching physical units have identical glyph/tie syntax'})
  for u in choices[0]:units.append({**u,'start':roundq(u['start']+m['start']),'end':roundq(u['end']+m['start'])})
 selected,issues=match_written_units(entry,units)
 return selected,{'format':'MusicXML','sourcePath':p['path'],'sourceSha256':container_sha,'localSource':local,'xmlSha256':sha(xml),'writtenUnits':len(units),'selectedUnits':len(selected),'literalDotted16thTokens':literal,'measureMappingReviews':mapping_reviews,'issues':issues}

def improvisor_units(entries,args):
 js=r'''import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';const [project,corpus]=process.argv.slice(1),{readImprovisorLeadsheet,parseImprovisorMelody,parseImprovisorDuration}=await import(pathToFileURL(path.join(project,'src/music/improvisor-melody.mjs')));const entries=JSON.parse(fs.readFileSync(0,'utf8')),result={};for(const entry of entries){const p=entry.provenance,text=fs.readFileSync(path.join(corpus,p.path),'utf8'),score=readImprovisorLeadsheet(text),part=score.parts[p.partIndex],decoded=parseImprovisorMelody(part.tokens.filter(t=>typeof t==='string')),units=[];for(const [index,item]of decoded.sourceTokens.entries()){const m=/^([a-gr])([#bs]?)([+u-]*)(.*)$/i.exec(item.token),terms=(m[4]||'8').split(/[+u]/);let start=item.start;const note=decoded.notes.find(n=>Math.abs(n.start-item.start)<1e-7);for(const term of terms){const duration=parseImprovisorDuration(term)/120;units.push({start,end:start+duration,writtenDuration:String(duration),kind:m[1]==='r'?'rest':'note',pitches:note?[note.pitch]:[],sourceToken:item.token,sourceDurationTerm:term,partTokenIndex:index,additiveTie:terms.length>1,dots:(term.match(/\.+$/)||[''])[0].length});start+=duration;}}result[entry.id]={units,decodedNotes:decoded.notes};}process.stdout.write(JSON.stringify(result));'''
 result=subprocess.run([str(args.node),'--input-type=module','-e',js,str(args.project),str(args.improvisor_source)],input=json.dumps(entries),text=True,capture_output=True,check=True);return json.loads(result.stdout)

def add_written_cells(entry,cells,units):
 for size in [1,.5]:
  for left in units:
   if not close(left['end']-left['start'],.75*size):continue
   rights=[u for u in units if close(u['start'],left['end']) and close(u['end']-u['start'],.25*size)]
   for right in rights:
    start=left['start'];key=(roundq(start),size)
    if key not in cells:cells[key]={'start':start,'unit':size,'gridAligned':any(close(start,s) for s in grid_starts(entry,size)),'left':[left],'right':[right],'evidenceKinds':[]}
    cells[key]['evidenceKinds']=sorted(set(cells[key]['evidenceKinds']+['adjacent-written-duration-units']))
 return cells

def written_figure(entry,unit,units):
 denominator=unit.get('sourceDenominator',{'eighth':8,'16th':16}.get(unit.get('sourceType')));dots=unit.get('dots',0)
 if denominator not in [8,16] or dots<1:return None
 aligned=any(close(unit['start'],start) for start in grid_starts(entry,1));complement=[v for v in units if close(v['start'],unit['end']) and close(v['end']-v['start'],.25 if denominator==8 else .125)]
 kind='genuine-written-dotted-sixteenth' if denominator==16 else 'written-dotted-eighth'
 if denominator==8 and not aligned:kind='syncopated-dotted-eighth'
 elif denominator==8 and not complement:kind='isolated-or-tied-dotted-fragment'
 return {'sourceDenominator':denominator,'dots':dots,'gridAligned':aligned,'classification':kind,'hasExactComplementaryWrittenUnit':bool(complement)}

def audit(args):
 pool,songs,usage,performances=active_inventory(args.project);strong_cells=set()
 if args.cross_source_proposals:
  for entry in read(args.cross_source_proposals)['entries']:
   for cell in entry['cells']:strong_cells.add((entry['melodyId'],roundq(cell['start'])))
 entries=[pool['entries'][id] for id in sorted(usage)];args.work_dir.mkdir(parents=True,exist_ok=True)
 spec=importlib.util.spec_from_file_location('openbook_dotted_import',args.project/'scripts/import-openbook-melodies.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 xml_paths={x['melodyId']:x for x in read(args.psjazz_dir/'xml-downloads.json')};source_pins=[]
 with zipfile.ZipFile(args.wikifonia_archive) as archive:
  for e in entries:
   provenance=e['provenance'];id=e['id']
   if provenance.get('format')=='LilyPond':data=(args.openbook_source/provenance['path']).read_bytes()
   elif provenance.get('format')=='Impro-Visor leadsheet':data=(args.improvisor_source/provenance['path']).read_bytes()
   elif id.startswith('psjazz-'):data=Path(xml_paths[id]['path']).read_bytes()
   else:data=archive.read(provenance['path'])
   assert sha(data)==provenance['sha256'],('source hash differs',id)
   source_pins.append({'melodyId':id,'sourcePath':provenance['path'],'sourceSha256':sha(data)})
 impro=[e for e in entries if e['provenance'].get('format')=='Impro-Visor leadsheet'];impro_decoded=improvisor_units(impro,args);sources={};units_by_id={};failures=[]
 def one(entry):
  id=entry['id'];p=entry['provenance']
  if p.get('format')=='LilyPond':return lily_units(entry,args,module)
  if p.get('format')=='Impro-Visor leadsheet':
   source=args.improvisor_source/p['path'];assert sha(source.read_bytes())==p['sha256'];decoded=impro_decoded[id];assert note_signature(decoded['decodedNotes'])==note_signature(entry['notes']);units,issues=match_written_units(entry,decoded['units']);return units,{'format':p['format'],'sourcePath':p['path'],'sourceSha256':p['sha256'],'localSource':str(source),'writtenUnits':len(decoded['units']),'selectedUnits':len(units),'literalDotted16thTokens':[u for u in units if re.search(r'^16\.+$',u['sourceDurationTerm'])],'issues':issues}
  return xml_units(entry,args,xml_paths)
 with ThreadPoolExecutor(max_workers=args.workers) as executor:
  futures={executor.submit(one,entry):entry for entry in entries}
  for future in as_completed(futures):
   entry=futures[future];id=entry['id']
   try:units,source=future.result();units_by_id[id]=units;sources[id]=source
   except Exception as error:failures.append({'melodyId':id,'error':str(error)});sources[id]={'format':entry['provenance'].get('format','MusicXML'),'sourcePath':entry['provenance']['path'],'sourceSha256':entry['provenance']['sha256'],'issues':[{'kind':'unresolved-source-to-performance-map' if 'XML measure label ambiguous' in str(error) else 'source-unavailable-or-parse-failed','error':str(error)}]};units_by_id[id]=[]
   if id.startswith('psjazz-'):
    raw_xml=Path(xml_paths[id]['path']).read_bytes();assert sha(raw_xml)==entry['provenance']['sha256'];tree=ET.fromstring(raw_xml);literal_notes=tree.findall('./part/measure/note');sources[id]['independentLiteralGlyphAudit']={'sourceSha256':sha(raw_xml),'dottedEighthGlyphs':sum(n.findtext('type')=='eighth' and n.find('dot') is not None for n in literal_notes),'dottedSixteenthGlyphs':sum(n.findtext('type')=='16th' and n.find('dot') is not None for n in literal_notes)}
   print(json.dumps({'completed':len(sources),'total':len(entries),'melodyId':id,'sourceIssues':len(sources[id]['issues'])}),flush=True)
 heads=[];all_cells=[];all_figures=[]
 for entry in entries:
  id=entry['id'];segments,timeline_issues=note_rest_segments(entry);cells=add_written_cells(entry,timeline_cells(entry,segments),units_by_id[id]);source=sources[id];literal_quarter=sum(close(u['end']-u['start'],.75) for u in units_by_id[id]);literal_sixteenth=sum(close(u['end']-u['start'],.375) for u in units_by_id[id]);canonical=sorted({u['composition'] for u in usage[id]})
  for (start,size),cell in sorted(cells.items()):
   end=start+size;written=[u for u in units_by_id[id] if min(u['end'],end)-max(u['start'],start)>EPS];note_indexes=sorted({u['noteIndex'] for side in ['left','right'] for u in cell[side] if u.get('noteIndex') is not None});rest_edge=any(u['kind']=='rest' for side in ['left','right'] for u in cell[side]);held_edge=any(u['start']<start-EPS or u['end']>end+EPS for side in ['left','right'] for u in cell[side]);source_confirmed=bool(written) and not source['issues'];classification='unresolved'
   # Written ratios alone never establish performed swing. Exact classifications
   # are evidence labels, not admission/normalization instructions.
   if source_confirmed and size==.5 and any(u.get('dots',0) or re.search(r'16\.',u.get('sourceToken','')) for u in written):classification='genuine-written-dotted-sixteenth'
   elif source_confirmed and (id,roundq(start)) in strong_cells:classification='probable-swing-encoding'
   record={**cell,'id':id+':'+str(roundq(start))+':'+str(size),'melodyId':id,'canonicalCompositions':canonical,'sourceSha256':entry['provenance']['sha256'],'sourceFormat':source['format'],'sourcePath':source['sourcePath'],'start':roundq(start),'end':roundq(end),'ratio':[.75,.25],'longDuration':.75*size,'shortDuration':.25*size,'noteIndexes':note_indexes,'notes':[{'noteIndex':i,**entry['notes'][i]} for i in note_indexes],'restEdge':rest_edge,'heldOrTieEdge':held_edge,'writtenUnits':written,'sourceConfirmed':source_confirmed,'classification':classification,'normalizationApproved':False};all_cells.append(record)
  figure_indexes=[]
  for u in units_by_id[id]:
   figured=written_figure(entry,u,units_by_id[id])
   if figured is None:continue
   denominator=figured['sourceDenominator'];dots=figured['dots'];grid_aligned=figured['gridAligned'];complement=figured['hasExactComplementaryWrittenUnit'];base_kind=figured['classification']
   linked=next((c for c in all_cells if c['melodyId']==id and close(c['start'],u['start']) and c['unit']==1),None)
   if denominator==8 and grid_aligned and linked and linked['classification']=='probable-swing-encoding':base_kind='probable-swing-encoding'
   figure_indexes.append(len(all_figures));all_figures.append({'melodyId':id,'canonicalCompositions':canonical,'sourceSha256':entry['provenance']['sha256'],'sourcePath':source['sourcePath'],'sourceFormat':source['format'],'sourceDenominator':denominator,'dots':dots,'gridAligned':grid_aligned,'classification':base_kind,'hasExactComplementaryWrittenUnit':bool(complement),'normalizationApproved':False,'sourceConfirmed':not source['issues'],'unit':u})
  heads.append({'melodyId':id,'title':entry['title'],'composer':entry.get('composer'),'canonicalCompositions':canonical,'usage':usage[id],'source':source,'noteCount':len(entry['notes']),'totalBeats':entry['totalBeats'],'measures':len(entry.get('measures',[])),'quarterCellsScanned':len(grid_starts(entry,1)),'halfQuarterCellsScanned':len(grid_starts(entry,.5)),'candidateCells':len(cells),'writtenDottedFigureIndexes':figure_indexes,'writtenDottedFigures':len(figure_indexes),'literalQuarterDottedDurationUnits':literal_quarter,'literalDottedSixteenthDurationUnits':literal_sixteenth,'timelineIssues':timeline_issues,'sourceConfirmed':not source['issues']})
 unique_figures={(f['sourceSha256'],f['unit'].get('sourceLine'),f['unit'].get('generatedCharacter'),f['unit'].get('sourceMeasureIndex'),f['unit'].get('sourceChildIndex'),f['unit'].get('partTokenIndex'),f['unit'].get('sourceDurationTerm'),f['sourceDenominator'],f['dots']) for f in all_figures}
 counts={'performances':len(performances),'melodyCharts':sum(bool(p['melodyId']) for p in performances),'activeHeads':len(entries),'existingMatches':len(pool['existingMatches']),'sourceAuditedHeads':sum(not h['source']['issues'] for h in heads),'sourceIssueHeads':sum(bool(h['source']['issues']) for h in heads),'candidateHeads':sum(h['candidateCells']>0 for h in heads),'candidateCells':len(all_cells),'quarter75_25Cells':sum(c['unit']==1 for c in all_cells),'dottedSixteenthCells':sum(c['unit']==.5 for c in all_cells),'restEdgeCells':sum(c['restEdge'] for c in all_cells),'heldOrTieEdgeCells':sum(c['heldOrTieEdge'] for c in all_cells),'literalDottedSixteenthTokens':sum(len(h['source'].get('literalDotted16thTokens',[])) for h in heads),'literalDottedSixteenthDurationUnits':sum(h['literalDottedSixteenthDurationUnits'] for h in heads),'classifications':dict(Counter(c['classification'] for c in all_cells)),'writtenDottedFigures':len(all_figures),'writtenDottedEighthFigures':sum(f['sourceDenominator']==8 for f in all_figures),'writtenDottedSixteenthFigures':sum(f['sourceDenominator']==16 for f in all_figures),'offbeatWrittenDottedFigures':sum(not f['gridAligned'] for f in all_figures),'writtenFigureClassifications':dict(Counter(f['classification'] for f in all_figures)),'sourceHashVerifiedHeads':len(source_pins),'uniquePhysicalDottedGlyphs':len(unique_figures),'fractionalAbsoluteStartFigures':sum(not close(f['unit']['start'],round(f['unit']['start'])) for f in all_figures)}
 inputs={str(p.relative_to(args.project)):sha(p.read_bytes()) for p in [args.project/'dist/data/melody-sources.json',args.project/'dist/data/standards.json']};output={'version':1,'policy':'Source inventory only; no timing changes or normalization approvals','counts':counts,'inputs':inputs,'performances':performances,'heads':heads,'sourcePins':source_pins,'failures':failures};candidates={'version':1,'policy':'Unapproved source timing candidates; literal dotted values are not proof of swing','inputs':inputs,'counts':counts,'cells':all_cells,'writtenDottedFigures':all_figures}
 for path,data in [(args.output,output),(args.candidates,candidates)]:path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps(counts),flush=True);return output,candidates

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--openbook-source',type=Path,required=True);p.add_argument('--lilypond',type=Path,required=True);p.add_argument('--psjazz-dir',type=Path,required=True);p.add_argument('--improvisor-source',type=Path,required=True);p.add_argument('--wikifonia-archive',type=Path,required=True);p.add_argument('--node',type=Path,default=Path('/Users/chipfocus/.nvm/versions/node/v24.12.0/bin/node'));p.add_argument('--work-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--candidates',type=Path,required=True);p.add_argument('--cross-source-proposals',type=Path);p.add_argument('--workers',type=int,default=4);a=p.parse_args();a.project=a.project.resolve();audit(a)
if __name__=='__main__':main()
