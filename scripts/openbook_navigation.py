"""Perform only explicitly reviewed, source-pinned navigation routes.

Ranges select complete compiler events. They never crop, stretch or infer a
melody/harmony event. Written source coordinates remain in the route audit.
"""
from copy import deepcopy
import hashlib
import json
import math
import re

EPS=1e-7
def same(a,b):return abs(a-b)<EPS
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def apply_navigation_plan(entry,plan):
 p=entry['provenance']
 for key,actual in [('sourcePath',p['path']),('sourceSha256',p['sha256']),('sourceVersion',p['sourceVersion'])]:
  if plan.get(key)!=actual:raise ValueError('Navigation source identity mismatch: '+key)
 if not same(plan['linearTotalBeats'],entry['totalBeats']):raise ValueError('Navigation linear source length mismatch')
 marks=p.get('compilerNavigationMarks',[])
 for required in plan.get('compilerLandmarks',[]):
  matches=[m for m in marks if re.search(required['pattern'],m['text'],re.I) and (same(m['start'],required['at']) if 'at' in required else same(m['start']+m['duration'],required['end']))]
  if not matches:raise ValueError('Navigation landmark not confirmed by compiler: '+str(required))
 ranges=plan['playbackRanges']
 if not ranges or not same(ranges[0][0],0):raise ValueError('Navigation must retain the source opening')
 edges=[m['start'] for m in entry['measures']]+[entry['totalBeats']]
 for start,end in ranges:
  if not all(math.isfinite(n) for n in [start,end]) or start<0 or end<=start or end>entry['totalBeats']+EPS:raise ValueError('Invalid navigation range')
  if not all(any(same(boundary,edge) for edge in edges) for boundary in [start,end]):raise ValueError('Navigation cut is not a source measure boundary')
  for field in ['notes','chords','measures']:
   for event in entry[field]:
    a=event['start'];b=event.get('end',a+event.get('duration',0))
    if any(a+EPS<boundary<b-EPS for boundary in [start,end]):raise ValueError('Navigation would crop a source '+field+' event')
 result=deepcopy(entry);result.update(notes=[],chords=[],measures=[])
 offset=0;trace=[];measure_number=1;meter_events=[]
 for route_index,(start,end) in enumerate(ranges):
  selected={}
  for field in ['notes','chords','measures']:
   indexes=[]
   for index,event in enumerate(entry[field]):
    if event['start']<start-EPS or event['start']>=end-EPS:continue
    copied=deepcopy(event);copied['start']=round(offset+event['start']-start,9)
    if 'end' in copied:copied['end']=round(offset+event['end']-start,9)
    if field=='measures':
     copied['sourceNumber']='0' if not result['measures'] and entry.get('pickupBeats',0)>0 else str(measure_number)
     if copied['sourceNumber']!='0':measure_number+=1
    result[field].append(copied);indexes.append(index)
   selected[field]=indexes
  source_meters=p.get('midiMeterEvents',[])
  active=next((m for m in reversed(source_meters) if m['beat']<=start+EPS),None)
  if active:meter_events.append({**active,'beat':round(offset,9)})
  for event in source_meters:
   if event['beat']>start+EPS and event['beat']<end-EPS:meter_events.append({**event,'beat':round(offset+event['beat']-start,9)})
  trace.append({'route':route_index,'sourceStart':start,'sourceEnd':end,'performedStart':offset,'performedEnd':round(offset+end-start,9),'sourceEventIndexes':selected})
  offset=round(offset+end-start,9)
 if not same(offset,plan['playbackTotalBeats']):raise ValueError('Navigation performed length mismatch')
 for field in ['chords','measures']:
  events=result[field]
  if not events or not same(events[0]['start'],0):raise ValueError('Navigation source coverage is incomplete')
  for left,right in zip(events,events[1:]):
   end=left.get('end',left['start']+left.get('duration',0))
   if not same(end,right['start']):raise ValueError('Navigation source coverage has a gap/overlap')
  if not same(events[-1].get('end',events[-1]['start']+events[-1].get('duration',0)),offset):raise ValueError('Navigation source ending mismatch')
 if any(left['start']+left['duration']>right['start']+EPS for left,right in zip(result['notes'],result['notes'][1:])):raise ValueError('Navigation introduces melody overlap')
 result['totalBeats']=offset;result['bars']=len(result['measures'])
 if meter_events:result['provenance']['midiMeterEvents']=meter_events
 result['provenance']['reviewedNavigation']={'plan':deepcopy(plan),'linearNotesSha256':digest(entry['notes']),'linearChordsSha256':digest(entry['chords']),'trace':trace,'policy':'Whole compiler events copied in the explicitly reviewed written return/end order; no pitches, durations, velocities or source harmonies inferred or clipped.'}
 result['provenance']['unfoldStatus']='Written volta repeats compiled by LilyPond; textual return/end performed by pinned reviewed route'
 return result
