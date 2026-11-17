from pathlib import Path
from PIL import Image
import numpy as np, json,re,hashlib,difflib,collections,subprocess
BASE=Path(__file__).resolve().parents[2];PROJECT=BASE/'insights-roadmaps'
PITCH={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
JOINS=['Bootstrap','Stella','Backslider','Half Nelson','Sidewinder','New Horizon','Downwinder','Homer','Cherokee','Woody','Highjump','Bauble','Dogleg']
def norm(s):return re.sub('[^a-z0-9]','',s.lower().replace('’',"'"))
def clean(s):return s.strip().replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"').strip('|[] ')
def chord(s):
 s=clean(s).replace(' ','').replace('?', '7').replace('bS','b5').replace('MZ','M7').replace('mZ','m7').replace('FZ','F7').replace('AZ','A7').replace('F#?','F#7').replace('♭','b').replace('♯','#')
 s=re.sub(r'^I(?=[A-G])','',s);s=s.replace('−','m').replace('–','m').replace('°','o').rstrip('_')
 return s
corpus=json.loads((BASE/'tmp/corpus.json').read_text())
vocab=collections.Counter(chord(e['chord']) for s in corpus for e in s['events'])
valid=set(vocab)
# The main dictionary supplies canonical brick names; no new analyses are generated.
bricknames=set(d['name'].replace('-',' ') for d in json.loads((BASE/'impro-visor-bricks.json').read_text())['definitions'])
bricknames.update(['Cadence + Overrun','Straight Cadence + Dominant Overrun','Straight Cadence with Dropback','To IV n Bird SPOT','To IV n Bird SPOT + ...','Straight Cadence + Dropback'])
def best_name(raw,candidates):
 s=clean(raw);exact=next((v for v in candidates if norm(v)==norm(s)),None)
 if exact:return exact,1
 ranked=sorted(((difflib.SequenceMatcher(None,norm(s),norm(v)).ratio(),v) for v in candidates),reverse=True)
 return (ranked[0][1],ranked[0][0]) if ranked else(s,0)
def pixelhash(im,box,kind):
 a=np.array(im.crop(box).convert('L'));dark=a<145
 # Strip grid rules without touching the letters.
 for axis in [0,1]:
  remove=dark.mean(axis=axis)>.87
  if axis==0:a[:,remove]=255
  else:a[remove,:]=255
 dark=a<145
 if not dark.any():return '',None
 y,x=np.where(dark);a=(dark[y.min():y.max()+1,x.min():x.max()+1]*255).astype('uint8')
 return hashlib.sha1(str(a.shape).encode()+a.tobytes()).hexdigest(),a
allcells=[];songs=[];palette=collections.defaultdict(collections.Counter)
for file in sorted((BASE/'tmp/segments-v2').glob('*.json')):
 d=json.loads(file.read_text());second=json.loads((BASE/'tmp/recognition-v2'/file.name).read_text());v=json.loads((BASE/'tmp/vision'/file.name).read_text());w,h=d['size'];im=Image.open(BASE/'tmp/extracted'/d['file']).convert('RGB')
 titleobs=[x for x in v if (x['y']+x['h']/2)*h<d['rows'][0]['y']-3]
 title=clean(' '.join(x['text'] for x in sorted(titleobs,key=lambda x:x['x']))) or clean(second['title'])
 d['title']=title;d['index']=len(songs)
 for r,r2 in zip(d['rows'],second['rows']):
  for typ in ['keys','bricks','chords','joins']:
   for c,c2 in zip(r[typ],r2[typ]):
    x0,y0,x1,y1=c['box'];obs=[]
    for o in v:
     cy=(o['y']+o['h']/2)*h;cx=(o['x']+o['w']/2)*w
     if y0-2<=cy<=y1+2 and x0-2<=cx<=x1+2:obs.append(o)
    vision=' '.join(o['text'] for o in sorted(obs,key=lambda o:o['x']))
    c['readings']=[c['text'],c2['text'],vision];c['type']=typ;c['song']=d['index'];c['hash'],_=pixelhash(im,c['box'],typ)
    if typ=='chords':
     reads=[chord(s) for s in c['readings']];votes=collections.Counter(s for s in reads if s in valid)
     if votes:c['value']=max(votes,key=lambda s:(votes[s],s==reads[0],vocab[s]))
     else:c['value']=reads[0] or reads[1] or reads[2]
     c['consensus']=max(votes.values(),default=0);c['method']='ocr'
    elif typ=='keys':
     reads=[re.sub(r'\s+','',clean(s)) for s in c['readings']]
     keys=[]
     for s in reads:
      m=re.fullmatch(r'([A-G][b#]?)(Major|Minor|Dominant)',s,re.I)
      if m:keys.append((m[1][0].upper()+m[1][1:],m[2].capitalize()))
     c['value']=list(collections.Counter(keys).most_common(1)[0][0]) if keys else None
     arr=np.array(im.crop(c['box']));rgb=collections.Counter(map(tuple,arr.reshape(-1,3))).most_common(1)[0][0];c['rgb']=','.join(str(int(z)) for z in rgb)
     for root,mode in keys:
      pc=(PITCH[root[0]]+root.count('#')-root.count('b'))%12
      rel=(pc+(3 if mode=='Minor' else 5 if mode=='Dominant' else 0))%12
      palette[c['rgb']][rel]+=1
    else:
     choices=[]
     for s in c['readings']:
      if not s:continue
      label,score=best_name(s,JOINS if typ=='joins' else bricknames)
      choices.append((score,label,s))
     if choices:
      score,label,raw=max(choices)
      if typ=='joins':c['value']=label
      else:
       def repair(t):
        t=clean(t)
        for before,after in [('Gn','On'),('Gff','Off'),('Gverrun','Overrun'),('PGT','POT'),('SPGT','SPOT'),('SPFGT','SPOT')]:t=t.replace(before,after)
        t=re.sub(r'\b[Il][Il]\b','II',t);t=re.sub(r'\blV\b','IV',t)
        return t
       rr=[repair(v) for v in c['readings']]
       ct=collections.Counter(v for v in rr if v)
       c['value']=ct.most_common(1)[0][0] if ct and ct.most_common(1)[0][1]>=2 else rr[1] or rr[0] or rr[2]
      c['match']=score
     else:c['value']='';c['match']=0
    allcells.append(c)
 songs.append(d)
# Repeated glyphs in screenshots let independent occurrences correct OCR errors.
clusters=collections.defaultdict(list)
for c in allcells:
 if c['type']=='chords' and c['hash']:clusters[c['hash']].append(c)
for cells in clusters.values():
 votes=collections.Counter()
 for c in cells:
  for i,s in enumerate(c['readings']):
   s=chord(s)
   if s in valid:votes[s]+=2 if i==0 else 1
 if votes:
  label=votes.most_common(1)[0][0]
  for c in cells:c['value']=label;c['method']='repeated-glyph' if len(cells)>1 else'ocr'
# Key colors are relative-major groups. They disambiguate OCR B/E, F/E, etc.
keyaudit=[]
prior_keys={}
for c in allcells:
 if c['type']!='keys':continue
 rel=palette[c['rgb']].most_common(1)[0][0] if palette[c['rgb']] else None
 root,mode=c['value'] or prior_keys.get(c['song'],['C','Major'])
 pc=(PITCH[root[0]]+root.count('#')-root.count('b'))%12
 if rel is not None and (pc+(3 if mode=='Minor' else 5 if mode=='Dominant' else 0))%12!=rel:
  choices=[]
  for s in c['readings']:
   m=re.search(r'([A-G][b#]?)\s*(Major|Minor|Dominant)',s,re.I)
   if m:
    rr=m[1][0].upper()+m[1][1:];mm=m[2].capitalize();p=(PITCH[rr[0]]+rr.count('#')-rr.count('b'))%12
    if (p+(3 if mm=='Minor' else 5 if mm=='Dominant' else 0))%12==rel:choices.append((rr,mm))
  if choices:root,mode=choices[0]
  else:
   pc=(rel-(3 if mode=='Minor' else 5 if mode=='Dominant' else 0))%12;root=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][pc]
  keyaudit.append([c['song'],c['value'],[root,mode],c['readings']])
 c['value']=[root,mode]
 prior_keys[c['song']]=c['value']
# Cell geometry preserves the screenshot's measure rhythm and boundaries.
def groups(xs):
 gs=[]
 for x in xs:
  if not gs or x>gs[-1][-1]+1:gs.append([int(x)])
  else:gs[-1].append(int(x))
 return [g[0] for g in gs]
for s in songs:
 im=np.array(Image.open(BASE/'tmp/extracted'/s['file']).convert('L'));y=s['rows'][0]['y']
 ticks=groups(np.flatnonzero((im[max(0,y-5):y-2]<200).mean(axis=0)>.5))
 steps=[b-a for a,b in zip(ticks,ticks[1:]) if b-a>10]
 step=collections.Counter(steps).most_common(1)[0][0] if steps else (s['size'][0]-30)/8
 left=ticks[0] if ticks else min(c['box'][0]-2 for r in s['rows'] for c in r['chords'])
 s['step']=step;s['left']=left;s['ticks']=ticks
 for r in s['rows']:
  for typ in ['keys','bricks','chords','joins']:
   for c in r[typ]:
    c['start']=round((c['box'][0]-2-left)/step*8)/8
    c['end']=round((c['box'][2]-left)/step*8)/8
  r['bars']=max((c['end'] for typ in ['keys','chords'] for c in r[typ]),default=8)
# Emit an audit before final canonical data, with every source coordinate retained.
(PROJECT/'evidence/extraction.json').write_text(json.dumps(songs,ensure_ascii=False,indent=2))
(PROJECT/'evidence/key-corrections.json').write_text(json.dumps(keyaudit,indent=2))
print('Songs',len(songs),'cells',len(allcells),'chords',sum(c['type']=='chords' for c in allcells),'key corrections',len(keyaudit))
unknown=[c for c in allcells if c['type']=='chords' and c['value'] not in valid]
print('Unknown chords',len(unknown),collections.Counter(c['value'] for c in unknown))
for c in unknown:print(c['song'],c['box'],c['readings'],c['value'])
print('Weak bricks')
for c in allcells:
 if c['type']=='bricks' and c.get('match',0)<.72:print(c['song'],c['box'],c['readings'],c['value'])
