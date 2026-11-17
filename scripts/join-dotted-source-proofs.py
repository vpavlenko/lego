#!/usr/bin/env python3.11
"""Join compiler/literal evidence to alternate-encoding proposals; approve nothing."""
from pathlib import Path
import argparse,json,hashlib
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--inventory',type=Path,required=True);p.add_argument('--candidates',type=Path,required=True);p.add_argument('--proposals',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();read=lambda path:json.loads(path.read_text());audit=read(a.inventory);data=read(a.candidates);b=read(a.proposals);index={(c['melodyId'],round(c['start'],9)):c for c in data['cells']};heads={h['melodyId']:h for h in audit['heads']};proofs=[]
for entry in b['entries']:
 h=heads[entry['melodyId']];assert not h['source']['issues'];assert h['source']['sourceSha256']==entry['sourceSha256']
 for c in entry['cells']:
  cell=index[(entry['melodyId'],round(c['start'],9))];units=cell['writtenUnits'];assert len(units)==2;long,short=units
  assert (long['sourceDenominator'],long['dots'],short['sourceDenominator'],short['dots'])==(8,1,16,0)
  assert long['noteIndex']==c['notes'][0]['index'] and short['noteIndex']==c['notes'][1]['index']
  assert all(not u['tiePiece'] for u in units);assert cell['sourceConfirmed'] and not cell['restEdge'] and not cell['heldOrTieEdge']
  for unit,note in zip(units,c['notes']):assert unit['pitch']==note['pitch'] and abs(unit['start']-note['start'])<1e-7 and abs(unit['end']-unit['start']-note['duration'])<1e-7
  proofs.append({'melodyId':entry['melodyId'],'start':c['start'],'sourceSha256':entry['sourceSha256'],'sourcePath':entry['sourcePath'],'sourceVersion':entry['sourceVersion'],'noteTuples':c['notes'],'writtenSourceUnits':units,'compilerGeneratedSha256':h['source']['generatedSha256'],'compilerLogSha256':h['source']['compilerLogSha256'],'classification':'probable-swing-encoding','interpretationApproved':False,'independentTranscriptionLineageEstablished':False})
out={'version':1,'policy':'Literal/compiler proof joined to alternate-encoding proposals only; no interpretation approval or source timing mutation','crossSourceProposalsSha256':hashlib.sha256(a.proposals.read_bytes()).hexdigest(),'crossSourceReportSha256':b['reportSha256'],'counts':{'cells':len(proofs),'heads':len({p['melodyId'] for p in proofs})},'cells':proofs};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['counts']))
