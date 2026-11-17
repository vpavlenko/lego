from pathlib import Path
from PIL import Image,ImageOps
import numpy as np,json,subprocess,csv,concurrent.futures
BASE=Path(__file__).resolve().parents[2]
def run(file):
 done=BASE/'tmp/recognition-v2'/file.name
 if done.exists():return json.loads(done.read_text())
 d=json.loads(file.read_text());im=Image.open(BASE/'tmp/extracted'/d['file']).convert('RGB')
 cells=[{'kind':'title','box':[0,0,d['size'][0],d['rows'][0]['y']-4]}]+[c for r in d['rows'] for k in ['keys','bricks','chords','joins'] for c in r[k]]
 tiles=[];ty=20
 for c in cells:
  a=np.array(im.crop(c['box']).convert('L'));dark=a<140
  if c['kind']=='joins':
   # Remove the rectangular annotation border before recognizing its text.
   a[dark.mean(axis=1)>.70,:]=255
   a[:,dark.mean(axis=0)>.70]=255
  dark=a<140
  if dark.any():
   ys,xs=np.where(dark);a=a[ys.min():ys.max()+1,xs.min():xs.max()+1]
  a=np.where(a<140,0,255).astype('uint8');tile=Image.fromarray(a).resize((a.shape[1]*3,a.shape[0]*3),Image.Resampling.LANCZOS)
  c['_tile']=(ty,tile.height);tiles.append((tile,ty));ty+=tile.height+50
 sheet=Image.new('L',(max(t.width for t,_ in tiles)+60,ty+20),255)
 for t,y in tiles:sheet.paste(t,(30,y))
 dst=BASE/'tmp/recognition-v2'/file.stem;dst.parent.mkdir(exist_ok=True);png=dst.with_suffix('.png');sheet.save(png)
 subprocess.run(['tesseract',str(png),str(dst),'--psm','6','tsv'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 words=list(csv.DictReader(dst.with_suffix('.tsv').open(),delimiter='\t'))
 for c in cells:
  y,h=c.pop('_tile');cw=[z for z in words if z['level']=='5' and z['text'].strip() and y-4<=int(z['top'])+int(z['height'])/2<=y+h+4]
  c['text']=' '.join(z['text'] for z in sorted(cw,key=lambda z:int(z['left'])))
  c['confidence']=round(min((float(z['conf']) for z in cw),default=0),1)
 d['title']=cells[0]['text'];dst.with_suffix('.json').write_text(json.dumps(d,indent=2));png.unlink()
 return d
if __name__=='__main__':
 import sys
 files=sorted((BASE/'tmp/segments-v2').glob('*.json'))
 if len(sys.argv)>1:files=files[:int(sys.argv[1])]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for i,r in enumerate(pool.map(run,files)):
   if i%20==0:print(i,r['title'],flush=True)
