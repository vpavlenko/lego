from pathlib import Path
import json,re,hashlib
from corpus import parse
ROOT=Path(__file__).resolve().parents[1]
source=ROOT.parent/'Impro-Visor/vocab/My.voc'
forms=parse(source.read_text());defs={}
for f in forms:
 if not isinstance(f,list) or not f or f[0]!='chord':continue
 rec={x[0]:x[1:] for x in f[1:] if isinstance(x,list) and x}
 if rec.get('name'):defs[rec['name'][0]]=rec
pc={'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11}
def resolve(name,seen=()):
 if name in seen or name not in defs:return None
 r=defs[name]
 if r.get('same'):return resolve(r['same'][0],seen+(name,))
 notes=[]
 for n in r.get('spell',[]):
  if not isinstance(n,str):continue
  m=re.match(r'([a-g])([b#]*)',n)
  if m:notes.append((pc[m[1]]+m[2].count('#')-m[2].count('b'))%12)
 return sorted(set(notes)) or None
qualities={n[1:]:resolve(n) for n in defs if n.startswith('C') and resolve(n)}
# This source chart spelling is a minor flat-five triad without a seventh.
qualities.setdefault('mb5',[0,3,6])
output={'source':'https://github.com/Impro-Visor/Impro-Visor/blob/550bbb554962249aceb0e82a72142e3e5b3c0d4a/vocab/My.voc','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'qualities':qualities}
(ROOT/'src/music/chord-vocabulary.json').write_text(json.dumps(output,separators=(',',':')))
songs=json.loads((ROOT/'dist/data/roadmaps.json').read_text())['songs'];missing=set()
for s in songs:
 for row in s['rows']:
  for c in row['chords']:
   if c.get('clipped'):continue
   q=re.sub(r'^[A-G][b#]*','',c['symbol']);q=re.sub(r'/[A-G][b#]*$','',q)
   if q not in qualities:missing.add(q)
print('qualities',len(qualities),'missing',sorted(missing))
