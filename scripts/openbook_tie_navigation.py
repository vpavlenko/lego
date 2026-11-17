"""Two pinned, explicitly written ties across reviewed D.C./D.S.-to-coda jumps.

This opt-in does not infer ties by pitch. Every supported return, source byte,
written tie line and compiler note is fixed below; other event cuts still fail.
"""
from copy import deepcopy
import hashlib
import importlib.util
from pathlib import Path

_spec=importlib.util.spec_from_file_location('_whole_event_navigation',Path(__file__).with_name('openbook_navigation.py'))
_base=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_base)
EPS=1e-7
REVIEWS={
 'openbook-on-a-misty-night-wikifonia':{
  'sourcePath':'src/openbook/on_a_misty_night.ly.tera','sourceSha256':'16324f58973116627238d4b30adb50b7e29a97002becb5fe3a06468af965d8a3','sourceVersion':'Wikifonia','linearTotalBeats':284,'playbackRanges':[[0,256],[0,112],[256,284]],'playbackTotalBeats':396,'jumpRoute':1,
  'attack':{'pitch':63,'start':111.5,'duration':3.5,'velocity':90},'destination':{'pitch':63,'start':256.0,'duration':3.0,'velocity':90},
  'literalSourceLines':[{'line':134,'text':'\tr2 r4 f\'8 es\'8 ~ ^ "To Coda" |'},{'line':140,'text':'\t\\textMark \\markup { \\musicglyph "scripts.coda" } es\'2. f\'8 g\'8 ~ |'}]},
 'openbook-undecided-fake':{
  'sourcePath':'src/openbook/undecided.ly.tera','sourceSha256':'cb7b3c002063f0de34676ffc263b99d4502534205381cceb17ffddf3166a7f32','sourceVersion':'Fake','linearTotalBeats':104,'playbackRanges':[[0,96],[0,24],[96,104]],'playbackTotalBeats':128,'jumpRoute':1,
  'attack':{'pitch':72,'start':23.5,'duration':4.5,'velocity':90},'destination':{'pitch':72,'start':96.0,'duration':7.0,'velocity':90},
  'literalSourceLines':[{'line':94,'text':'\t\tb8 c b c a4. c8 | d8 d c4 ees4 d8 c~^\\markup {To Coda \\musicglyph #"scripts.coda"} |'},{'line':109,'text':'\tc1~ | c2. r4 |'}]}}

def reviewed_tie_plan(identifier):
 if identifier not in REVIEWS:raise ValueError('Unreviewed source tie navigation')
 return deepcopy(REVIEWS[identifier])

def apply_tie_navigation_plan(entry,plan,source_root):
 """Use exact source bytes and compiler events; merge only the actual jump tie."""
 if entry['id'] not in REVIEWS or plan!=REVIEWS[entry['id']]:raise ValueError('Unreviewed source tie navigation plan')
 p=entry['provenance']
 for key,actual in [('sourcePath',p['path']),('sourceSha256',p['sha256']),('sourceVersion',p['sourceVersion'])]:
  if plan[key]!=actual:raise ValueError('Tie navigation source identity mismatch: '+key)
 source=Path(source_root)/plan['sourcePath'];data=source.read_bytes()
 if hashlib.sha256(data).hexdigest()!=plan['sourceSha256']:raise ValueError('Tie navigation source bytes mismatch')
 lines=data.decode().splitlines()
 for evidence in plan['literalSourceLines']:
  if evidence['line']>len(lines) or lines[evidence['line']-1]!=evidence['text']:raise ValueError('Tie navigation written evidence mismatch')
 notes=entry['notes'];attack=plan['attack'];destination=plan['destination'];indices=[]
 for required in [attack,destination]:
  matches=[i for i,n in enumerate(notes) if n==required]
  if len(matches)!=1:raise ValueError('Tie navigation compiler note mismatch')
  indices.append(matches[0])
 attack_index,destination_index=indices;routes=plan['playbackRanges'];jump=plan['jumpRoute'];exit=routes[jump][1];arrival=routes[jump+1][0]
 if attack['pitch']!=destination['pitch'] or destination['start']!=arrival or not attack['start']<exit<attack['start']+attack['duration']:raise ValueError('Invalid reviewed tie connection')
 # Only this note at this end boundary is allowed to cross. All starts, other
 # route exits, harmony and measure boundaries remain whole-event strict.
 for route_index,(start,end) in enumerate(routes):
  for i,n in enumerate(notes):
   for boundary in [start,end]:
    if n['start']+EPS<boundary<n['start']+n['duration']-EPS:
     if not(route_index==jump and boundary==end and i==attack_index):raise ValueError('Tie navigation would crop an unreviewed note')
 shell=deepcopy(entry);shell['notes']=[]
 result=_base.apply_navigation_plan(shell,plan);result['notes']=[];offset=0;trace=[];merges=[]
 for route_index,(start,end) in enumerate(routes):
  selected=[]
  for i,n in enumerate(notes):
   if n['start']<start-EPS or n['start']>=end-EPS:continue
   if route_index==jump+1 and i==destination_index:continue
   copied=deepcopy(n);copied['start']=round(offset+n['start']-start,9)
   if route_index==jump and i==attack_index:
    copied['duration']=round(exit-n['start']+destination['duration'],9)
    merges.append({'route':route_index,'sourceAttackIndex':attack_index,'sourceDestinationIndex':destination_index,'sourceExit':exit,'sourceArrival':arrival,'performedAttack':copied['start'],'performedDuration':copied['duration'],'pitch':copied['pitch']})
   result['notes'].append(copied);selected.append(i)
  result['provenance']['reviewedNavigation']['trace'][route_index]['sourceEventIndexes']['notes']=selected
  trace.append({'route':route_index,'sourceIndexes':selected});offset=round(offset+end-start,9)
 if any(a['start']+a['duration']>b['start']+EPS for a,b in zip(result['notes'],result['notes'][1:])):raise ValueError('Tie navigation introduces melody overlap')
 if any(n['start']<0 or n['start']+n['duration']>offset+EPS for n in result['notes']):raise ValueError('Tie navigation note exceeds performed duration')
 audit=result['provenance']['reviewedNavigation'];audit['linearNotesSha256']=_base.digest(notes);audit['policy']='Whole compiler events copied except the explicitly written source-pinned outgoing tie at its reviewed coda jump; destination continuation merged without reattack. Initial pass unchanged.';audit['tieMerges']=merges;audit['tieTrace']=trace
 return result
