from pathlib import Path
import re,json,unicodedata,difflib
BASE=Path(__file__).resolve().parents[2]
def parse(text):
 toks=re.findall(r'\(|\)|[^\s()]+',text);i=0
 def form():
  nonlocal i
  if toks[i]!='(':i+=1;return toks[i-1]
  i+=1;a=[]
  while i<len(toks) and toks[i]!=')':a.append(form())
  i+=1;return a
 out=[]
 while i<len(toks):out.append(form())
 return out
def flatten(a):return ' '.join(flatten(x) if isinstance(x,list) else x for x in a)
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).lower().replace('’',"'"))
def read(file):
 a=parse(file.read_text(errors='replace'));title=next((flatten(x[1:]) for x in a if isinstance(x,list) and x and x[0]=='title'),file.stem)
 composer=next((flatten(x[1:]) for x in a if isinstance(x,list) and x and x[0]=='composer'),'')
 key=next((int(x[1]) for x in a if isinstance(x,list) and len(x)>1 and x[0]=='key'),0)
 meter=next(([int(x[1]),int(x[2])] for x in a if isinstance(x,list) and x and x[0]=='meter'),[4,4])
 chordpart=False;bars=[];bar=[];sections=[]
 for x in a:
  if isinstance(x,list):
   if x and x[0]=='part':
    if chordpart:break
    chordpart=['type','chords'] in x
   elif chordpart and x and x[0] in ['section','phrase']:sections.append({'bar':len(bars),'type':x[0]})
  elif chordpart:
   if x=='|':
    if bar:bars.append(bar);bar=[]
   else:bar.append(x)
 if bar:bars.append(bar)
 events=[];previous=None
 for b,cs in enumerate(bars):
  for i,c in enumerate(cs):
   if c=='/':c=previous or 'NC'
   if c==previous and events:events[-1]['duration']+=1/len(cs)
   else:events.append({'chord':c,'start':b+i/len(cs),'duration':1/len(cs)})
   previous=c
 return {'title':title,'composer':composer,'signature':key,'meter':meter,'bars':len(bars),'events':events,'file':str(file.relative_to(BASE/'Impro-Visor')),'sections':sections}
if __name__=='__main__':
 corpus=[]
 for file in (BASE/'Impro-Visor/leadsheets').rglob('*.ls'):
  try:corpus.append(read(file))
  except Exception:pass
 (BASE/'tmp/corpus.json').write_text(json.dumps(corpus))
 pdf=[]
 for f in sorted((BASE/'tmp/segments').glob('*.json')):
  a=json.loads(f.read_text());f2=BASE/'tmp/recognition'/f.name;b=json.loads(f2.read_text()) if f2.exists() else a
  titles=[a['title'],b['title']]
  ranks=sorted([(max(difflib.SequenceMatcher(None,norm(t),norm(c['title'])).ratio() for t in titles),c) for c in corpus],key=lambda v:-v[0])
  top=ranks[0][0];cs=[c for score,c in ranks if score>=top-.03][:30]
  observed=[x['text'] for r in a['rows'] for x in r['chords']]
  def score(c):
   sim=difflib.SequenceMatcher(None,[norm(x) for x in observed],[norm(e['chord']) for e in c['events']]).ratio()
   return sim+(0.04 if '/insights/' in '/'+c['file'] else 0)
  best=max(cs,key=score)
  pdf.append({'index':int(f.stem[-3:]),'ocrTitle':titles,'titleMatch':round(top,3),'chordMatch':round(score(best),3),'source':best})
 (BASE/'tmp/matches.json').write_text(json.dumps(pdf,indent=2))
 for x in pdf:
  if x['titleMatch']<.9 or x['chordMatch']<.8:print(x['index'],x['ocrTitle'],x['titleMatch'],x['chordMatch'],x['source']['title'],x['source']['file'])
 print('Matches',len(pdf))
