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
def resolve_spell(name,seen=()):
 if name in seen or name not in defs:return None
 r=defs[name]
 if r.get('same'):return resolve_spell(r['same'][0],seen+(name,))
 return [n for n in r.get('spell',[]) if isinstance(n,str) and re.match(r'[a-g][b#]*',n)] or None

def resolved_name(name,seen=()):
 if name in seen or name not in defs:return name
 r=defs[name]
 return resolved_name(r['same'][0],seen+(name,)) if r.get('same') else name

def compound_intervals(quality,spell,canonical):
 # My.voc pitch tokens end in a duration, not an octave (d8 is D eighth).
 # Spell letters distinguish altered extensions from their enharmonic core
 # tones: F# is #11, while Gb is b5. Alias names can override that spelling
 # (e.g. M6b5 aliases M6#11), so use the requested quality for 5/11 and 6/13.
 q=quality.lower();meaning=q+' '+canonical.lower();extended=any(n in meaning for n in ('9','11','13'));notes=[]
 for token in spell:
  m=re.match(r'([a-g])([b#]*)',token);letter,acc=m.groups()
  interval=(pc[letter]+acc.count('#')-acc.count('b'))%12
  upper=(letter=='d' and extended) or (letter=='f' and ('11' in meaning or ('13' in meaning and 'sus4' not in meaning))) or (letter=='a' and '13' in meaning) or (letter=='e' and '10' in meaning)
  # Named altered fifths/sixths retain their core register. Named elevenths
  # and thirteenths retain their extension register, including same aliases.
  if letter=='d' and q in ('2','add2'):upper=False
  if letter=='f' and 'sus4' in meaning:upper=False
  if re.search(r'[b#]5',q) and interval in (6,8):upper=False
  if re.search(r'[b#]6',q) and interval in (8,10):upper=False
  if '#11' in q and interval==6:upper=True
  if 'b13' in q and interval==8:upper=True
  notes.append(interval+(12 if upper else 0))
 return sorted(set(notes))
spellings={n[1:]:resolve_spell(n) for n in defs if n.startswith('C') and resolve_spell(n)}
canonical={quality:resolved_name('C'+quality)[1:] for quality in spellings}
qualities={quality:compound_intervals(quality,spell,canonical[quality]) for quality,spell in spellings.items()}
# This source chart spelling is a minor flat-five triad without a seventh.
qualities.setdefault('mb5',[0,3,6])
spellings.setdefault('mb5',['c8','eb8','gb8'])
canonical.setdefault('mb5','mb5')
output={'source':'https://github.com/Impro-Visor/Impro-Visor/blob/550bbb554962249aceb0e82a72142e3e5b3c0d4a/vocab/My.voc','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'qualities':qualities,'spellings':spellings,'canonicalQualities':canonical}
(ROOT/'src/music/chord-vocabulary.json').write_text(json.dumps(output,separators=(',',':')))
songs=json.loads((ROOT/'dist/data/roadmaps.json').read_text())['songs'];missing=set()
for s in songs:
 for row in s['rows']:
  for c in row['chords']:
   if c.get('clipped'):continue
   q=re.sub(r'^[A-G][b#]*','',c['symbol']);q=re.sub(r'/[A-G][b#]*$','',q)
   if q not in qualities:missing.add(q)
print('qualities',len(qualities),'missing',sorted(missing))
