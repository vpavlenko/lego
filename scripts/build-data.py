from pathlib import Path
from collections import Counter
import json,re,subprocess,difflib,unicodedata
BASE=Path(__file__).resolve().parents[2];PROJECT=BASE/'insights-roadmaps'
songs=json.loads((PROJECT/'evidence/extraction.json').read_text())
corpus=json.loads((BASE/'tmp/corpus.json').read_text())
PC={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11};NAMES=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']
def pc(root):return (PC[root[0]]+root.count('#')-root.count('b'))%12
def norm(s):
 s=unicodedata.normalize('NFKD',s).lower().replace('#','number').replace('’',"'").replace('&','and')
 return re.sub('[^a-z0-9]','',s)
def titleforms(s):
 forms=[s,re.sub(r'\([^)]*\)','',s)]
 return [norm(re.sub(r'^(The |A |An |\(Take The\) )','',f,flags=re.I)) for f in forms if f.strip()]
for c in corpus:c['_forms']=titleforms(c['title'])+[norm(Path(c['file']).stem)]
# Explicit home keys for modal/minor tunes and the multi-key examples discussed
# by Elliott (chapter 14). These do not change any source chord or brick.
TONICS={3:['F','Minor'],7:['Ab','Major'],8:['D','Minor'],9:['D','Minor'],12:['G','Minor'],15:['D','Minor'],17:['D','Minor'],21:['C','Minor'],35:['Bb','Minor'],38:['F','Major'],39:['F','Major'],40:['C','Major'],42:['C','Minor'],46:['D','Minor'],49:['A','Minor'],67:['C','Major'],106:['C','Minor'],108:['G','Minor'],119:['C','Major'],124:['Bb','Minor'],128:['F','Major'],129:['A','Minor'],130:['C','Minor'],137:['F','Minor'],139:['Eb','Major'],145:['C','Minor'],153:['D','Minor'],171:['A','Minor'],187:['C','Minor'],188:['C','Minor'],194:['C','Minor'],196:['Eb','Major'],200:['D','Minor'],201:['C','Major'],202:['Ab','Major'],222:['D','Major'],225:['C','Major'],228:['C','Major'],231:['D','Minor'],233:['G','Major']}
TITLES={41:'Corner Pocket (Until I Met You)',84:'I Fall in Love Too Easily',95:"I'll Remember April",98:"I've Got a Crush on You",99:"I've Got the World on a String",101:"I've Grown Accustomed to Her Face",102:"I've Never Been in Love Before",103:'If I Had You',126:'Love Walked In',230:'When You Wish Upon a Star'}
ALIASES={0:'ATrain',12:'AutumnLeaves',24:'BluesNumber1',25:'BluesNumber2',26:'BluesNumber3',27:'BluesNumber4',71:'GeorgiaOnMyMind',96:'ImConfessin',116:'LadyBeGood',120:'LetItSnowLetItSnowLetItSnow',125:'OurLoveIsHereToStay',164:'ItsOnlyAPaperMoon',224:'WeaverOfDreams'}
def canon(symbol,shift=0):
 m=re.match(r'^([A-G][b#]?)(.*)$',symbol)
 if not m:return symbol
 q=m[2].replace('maj','M').replace('6','').replace('alt','').replace('+','#5').rstrip('.')
 q=re.sub(r'/[A-G][b#]?','',q)
 return str((pc(m[1])+shift)%12)+q
pages={}
for line in subprocess.check_output(['pdfimages','-list',str(BASE/'InsightsRoadmapsConsolidated.pdf')],text=True).splitlines()[2:]:
 cols=line.split()
 if len(cols)>2 and cols[0].isdigit():pages[int(cols[1])]=int(cols[0])
exact={}
for c in corpus:
 for f in c['_forms']:exact.setdefault(f,[]).append(c)
output=[];audits=[]
for d in songs:
 idx=d['index'];title=TITLES.get(idx,d['title']);forms=titleforms(title)
 ranks=[]
 matched={c['file']:c for f in forms for c in exact.get(f,[])}
 if idx in ALIASES:matched.update({c['file']:c for c in corpus if norm(Path(c['file']).stem)==norm(ALIASES[idx])})
 pool=list(matched.values()) if matched else corpus
 for c in pool:
  score=max(difflib.SequenceMatcher(None,a,b).ratio() for a in forms for b in c['_forms'])
  if idx in ALIASES and norm(Path(c['file']).stem)==norm(ALIASES[idx]):score=1.1
  if score>.78:ranks.append((score,c))
 ranks.sort(key=lambda x:-x[0]);top=ranks[0][0] if ranks else 0
 candidates=[c for score,c in ranks if score>=top-.04][:12]
 observed=[c['value'] for r in d['rows'] for c in r['chords'] if re.match('[A-G]',c['value'])]
 obs=[canon(x) for x in observed]
 best=None
 for c in candidates:
  for shift in range(12):
   seq=[canon(e['chord'],shift) for e in c['events']]
   score=difflib.SequenceMatcher(None,obs,seq,autojunk=False).ratio()
   if '/insights/' in '/'+c['file']:score+=.04
   if best is None or score>best[0]:best=(score,c,shift)
 weights=Counter()
 for r in d['rows']:
  for k in r['keys']:weights[tuple(k['value'])]+=k['end']-k['start']
 tonic=list(weights.most_common(1)[0][0])
 if idx in TONICS:tonic=TONICS[idx]
 # Continuation strips are blank in the source. Carry their labelled context.
 rows=[];startbar=0;prevkey=None;prevbrick=None
 for ri,r in enumerate(d['rows']):
  chords=[]
  for c in r['chords']:
   symbol=c['value']
   if not symbol or not re.match(r'^[A-Ga-g]',symbol):continue
   symbol=re.sub(r'(^|/)([a-g])',lambda m:m[1]+m[2].upper(),symbol)
   clipped='.' in symbol
   symbol=re.sub(r'\.+','…',symbol)
   chords.append({'start':max(0,c['start']),'end':c['end'],'symbol':symbol,**({'clipped':True} if clipped else{})})
  # Grey unused cells are not part of the chart.
  bars=round(max((c['end'] for c in chords),default=0))
  if not bars:continue
  keys=[]
  for k in r['keys']:
   if k['start']>=bars:continue
   keys.append({'start':max(0,k['start']),'end':min(bars,k['end']),'root':k['value'][0],'mode':k['value'][1]})
  if not keys:keys=[{'start':0,'end':bars,'root':(prevkey or {'root':tonic[0]})['root'],'mode':(prevkey or {'mode':tonic[1]})['mode']}]
  if keys[0]['start']>0 and prevkey:keys.insert(0,dict(prevkey,start=0,end=keys[0]['start']))
  bricks=[]
  for b in r['bricks']:
   if b['start']>=bars:continue
   # An empty label means a brick carried over the row break.
   name=b['value']
   if idx in [120,184] and name.startswith('Diatonic'):name='Diatonic I ii iii IV'
   elif idx==168 and name.startswith('Diatonic'):name='Diatonic I ii iii biii'
   if not name and b['start']==0 and prevbrick:name=prevbrick['name']
   if name:bricks.append({'start':max(0,b['start']),'end':min(bars,b['end']),'name':name})
  if not bricks and prevbrick:bricks=[dict(prevbrick,start=0,end=bars)]
  row={'startBar':startbar,'bars':bars,'keys':keys,'bricks':bricks,'chords':chords,'joins':[],'_joins':r['joins']}
  rows.append(row);startbar+=bars;prevkey=keys[-1];prevbrick=bricks[-1] if bricks else prevbrick
 for ri,row in enumerate(rows):
  for j in row.pop('_joins'):
   # Source tags are right-aligned at the boundary they annotate.
   at=round((j['box'][2]-d['left'])/d['step']*8)/8
   if at>row['bars']+.1:continue
   leftkey=next((k for k in row['keys'][::-1] if k['start']<at-.01),row['keys'][0])
   rightkey=next((k for k in row['keys'] if k['start']>=at-.01),None)
   if rightkey is None:rightkey=rows[ri+1]['keys'][0] if ri+1<len(rows) else rows[0]['keys'][0]
   delta=(pc(rightkey['root'])-pc(leftkey['root']))%12
   if delta>6:delta-=12
   join_name='Highjump' if idx==87 and 'ump' in j['readings'][1] else j['value']
   row['joins'].append({'at':at,'name':join_name,'from':leftkey['root'],'to':rightkey['root'],'delta':delta})
 composer=best[1]['composer'] if best and top>.9 else''
 record={'index':idx,'title':title,'tonic':tonic,'composer':composer,'meter':best[1]['meter'] if best and top>.9 else[4,4], 'bars':startbar,'columns':max(r['bars'] for r in rows),'page':pages[idx],'image':d['file'],'bricks':sorted({b['name'] for r in rows for b in r['bricks']}),'rows':rows}
 if best and top>.9:record['leadsheet']='https://github.com/Impro-Visor/Impro-Visor/blob/550bbb554962249aceb0e82a72142e3e5b3c0d4a/'+best[1]['file']
 output.append(record)
 audits.append({'index':idx,'title':title,'tonic':tonic,'bars':startbar,'titleMatch':round(top,3),'corpusMatch':round(best[0],3) if best else None,'shift':best[2] if best else None,'corpusFile':best[1]['file'] if best else None,'weights':[(str(k),v) for k,v in weights.most_common()]})
(PROJECT/'dist/data/roadmaps.json').write_text(json.dumps({'source':'InsightsRoadmapsConsolidated.pdf','author':'Bob Keller','date':'2011-10-06','revision':1,'songs':output},ensure_ascii=False,separators=(',',':')))
(PROJECT/'evidence/corpus-check.json').write_text(json.dumps(audits,indent=2,ensure_ascii=False))
for a in audits:print(f"{a['index']:03}",a['title'],a['tonic'],a['bars'],a['corpusMatch'])
print('TOTAL',len(output),'chords',sum(len(r['chords']) for s in output for r in s['rows']),'joins',sum(len(r['joins']) for s in output for r in s['rows']))
