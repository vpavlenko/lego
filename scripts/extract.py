from pathlib import Path
from PIL import Image,ImageOps
import numpy as np,json,subprocess,concurrent.futures, re
BASE=Path(__file__).resolve().parents[2]
OUT=BASE/'tmp/segments-v2';OUT.mkdir(exist_ok=True)
def groups(xs):
 result=[]
 for x in xs:
  if not result or x>result[-1][-1]+1:result.append([int(x)])
  else:result[-1].append(int(x))
 return [(g[0],g[-1]+1) for g in result]
def run(file):
 im=Image.open(file).convert('RGB');a=np.array(im);h,w=a.shape[:2]
 sat=a.max(axis=2).astype(int)-a.min(axis=2).astype(int)
 bands=groups(np.flatnonzero(((sat>50)&(a.max(axis=2)>150)).sum(axis=1)>w*.20))
 # Key strips are taller than the join tags (usually 18 vs 14 px).
 bands=[(s,e) for s,e in bands if e-s>=15]
 if not bands: return {'file':file.name,'error':'no bands'}
 height=round(np.median([e-s for s,e in bands]))+2
 # Some tiny images have proportionally smaller strips.
 rows=[];cells=[]
 def region(kind,x0,y0,x1,y1):
  if x1-x0<4:return None
  c={'kind':kind,'box':[int(x0),int(y0),int(x1),int(y1)],'id':len(cells)};cells.append(c);return c
 region('title',0,0,w,bands[0][0]-5)
 for ri,(s,e) in enumerate(bands):
  # top key band is [s-1,e+1], following two strips share its height
  top=s-1;kbottom=e+1;bh=kbottom-top
  lineYs=[kbottom,kbottom+bh,kbottom+2*bh]
  # Find horizontal dividers; tolerate a one-pixel difference.
  for k,yy in enumerate(lineYs[1:],1):
   candidates=list(range(max(kbottom+2,yy-3),min(h,yy+4)))
   if candidates:lineYs[k]=max(candidates,key=lambda y:(a[y,:,:].max(axis=1)<200).sum())
  keybot,brickbot,chordbot=lineYs
  row={'y':top,'endY':chordbot,'keys':[],'bricks':[],'chords':[],'joins':[]}
  for kind,y0,y1 in [('keys',s,e),('bricks',keybot+1,brickbot),('chords',brickbot+1,chordbot)]:
   if y1<=y0:continue
   dark=a[y0:y1,:,:].max(axis=2)<200
   lines=groups(np.flatnonzero(dark.mean(axis=0)>.82))
   xs=[int((u+v-1)/2) for u,v in lines if v-u<8]
   # end of used content always bounded, strips may stop before image end
   if len(xs)<2:continue
   for x0,x1 in zip(xs,xs[1:]):
    c=region(kind,x0+2,y0+1,x1,y1)
    if c:row[kind].append(c)
  # Joins are annotations between chord bottom and next row.
  jy0=chordbot+1;jy1=(bands[ri+1][0]-2 if ri+1<len(bands) else h)
  if jy1>jy0:
   mask=((sat[jy0:jy1]>40)&(a[jy0:jy1].max(axis=2)>150)).sum(axis=0)>2
   for x0,x1 in groups(np.flatnonzero(mask)):
    if x1-x0>12:
     c=region('joins',x0-1,jy0,x1+2,jy1)
     if c:row['joins'].append(c)
  rows.append(row)
 # OCR cells as widely separated lines, once per image.
 tiles=[];tileY=20
 for c in cells:
  x0,y0,x1,y1=c['box'];tile=im.crop((x0,y0,x1,y1)).resize(((x1-x0)*3,(y1-y0)*3))
  c['tile']=[20,tileY,tile.width,tile.height];tiles.append((tile,tileY));tileY+=max(tile.height+35,80)
 sheet=Image.new('RGB',(max(t.width for t,_ in tiles)+40,tileY+20),'white')
 for t,y in tiles:sheet.paste(t,(20,y))
 path=OUT/(file.stem+'.png');sheet.save(path)
 dest=OUT/file.stem
 if not dest.with_suffix('.tsv').exists():subprocess.run(['tesseract',str(path),str(dest),'--psm','11','tsv'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 import csv
 words=list(csv.DictReader(dest.with_suffix('.tsv').open(),delimiter='\t'))
 for c in cells:
  _,ty,tw,th=c.pop('tile');cw=[z for z in words if z['level']=='5' and z['text'].strip() and ty-3<=int(z['top'])+int(z['height'])/2<=ty+th+3]
  c['text']=' '.join(z['text'] for z in sorted(cw,key=lambda z:(int(z['top'])//max(25,th//2),int(z['left']))))
  c['confidence']=round(min((float(z['conf']) for z in cw),default=0),1)
 result={'file':file.name,'size':[w,h],'title':cells[0]['text'],'rows':rows}
 (OUT/(file.stem+'.json')).write_text(json.dumps(result,indent=2))
 path.unlink()
 return result
if __name__=='__main__':
 files=sorted((BASE/'tmp/extracted').glob('*.png'))
 import sys
 if len(sys.argv)>1:files=files[:int(sys.argv[1])]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for i,r in enumerate(pool.map(run,files)):
   if i%20==0: print(i,r['file'],r.get('title'),flush=True)
