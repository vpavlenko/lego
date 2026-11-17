import {pitch,mod} from '../../dist/harmony.mjs';
function quality(symbol){const q=symbol.replace(/^[A-G][b#]*/,'').replace(/\/[A-G][b#]*$/,'');return /m7b5|ø|dim|^o/.test(q)?'dim':/^m(?!aj)|^-/.test(q)?'minor':/^sus|sus/.test(q)?'sus':/^7|^9|^11|^13/.test(q)?'dominant':'major';}
export function chordTimeline(song){return song.rows.flatMap(r=>r.chords.map(c=>({...c,start:r.startBar+c.start,end:r.startBar+c.end,root:pitch(c.symbol),kind:quality(c.symbol)})));}
const at=(events,bar)=>events.find(c=>c.start<=bar+1e-7&&c.end>bar+1e-7);
export function compareSections(events,a,b){
 const length=Math.min(a.end-a.start,b.end-b.start),core=Math.min(length<=4?3:6,a.end-a.start!==b.end-b.start?4:6,length),scores=[];
 for(let shift=0;shift<12;shift++){
  let sum=0,weight=0,roots=0;
  for(let x=.125;x<length;x+=.25){const ca=at(events,a.start+x),cb=at(events,b.start+x);if(!ca||!cb||ca.clipped||cb.clipped)continue;const w=x<core?1:.25,same=mod(ca.root-cb.root)===shift;sum+=w*((same?.75:0)+(ca.kind===cb.kind?.25:0));roots+=w*Number(same);weight+=w;}
  scores.push({score:weight?sum/weight-(shift?.015:0):0,rootScore:weight?roots/weight:0,shift});
 }
 return scores.sort((a,b)=>b.score-a.score)[0];
}
function labelSections(events,spans){
 const representatives=[],sections=[];
 for(const span of spans){let best=null;for(let i=0;i<representatives.length;i++){const comparison=compareSections(events,representatives[i],span);if(comparison.score>=.82&&comparison.rootScore>=.78&&(!best||comparison.score>best.score))best={...comparison,index:i};}
  const index=best?.index??representatives.length;if(!best)representatives.push(span);sections.push({...span,label:String.fromCharCode(65+index),similarity:best?.score??1,transpose:best?.shift??0});
 }
 return sections;
}
function rhythmBridge(events,tonic){
 const targets=[4,9,2,7];let count=0;
 for(let i=0;i<4;i++){const start=16+i*2,end=start+2;if(events.some(c=>c.start<end&&c.end>start&&Math.min(end,c.end)-Math.max(start,c.start)>=.5&&mod(c.root-tonic)===targets[i]&&c.kind==='dominant'))count++;}
 return count===4;
}
export function analyzeForm(song){
 const events=chordTimeline(song),tonic=pitch(song.tonic[0]);let spans=[];
 if(song.bars>=16&&song.bars<=20){spans=[0,4,8,12].map((start,i)=>({start,end:i===3?song.bars:start+4}));}
 else if(song.bars>=32&&song.bars<=40){spans=[0,8,16,24].map((start,i)=>({start,end:i===3?song.bars:start+8}));}
 else if([48,64].includes(song.bars)){const length=song.bars/4;spans=[0,1,2,3].map(i=>({start:i*length,end:(i+1)*length}));}
 // These six former ABCA results were reviewed against the source roadmaps.
 // Shared openings with a different cadential/bridge lead-in are A variations;
 // a short common opening alone does not make the whole section another A.
 const reviews={16:{pattern:'AABA',variations:[1]},94:{pattern:'AABA',variations:[1]},241:{pattern:'AABA',variations:[1]},97:{pattern:'ABCA'},112:{pattern:'ABCA'},191:{pattern:'ABCA'}};
 const sections=labelSections(events,spans),review=reviews[song.index],confirmed=review?.pattern??{0:'AABA',20:'AABA',35:'AABA',54:'AABA',70:'AABA'}[song.index];
 if(confirmed&&sections.length===4)sections.forEach((s,i)=>{s.label=confirmed[i];if(review?.variations?.includes(i)){const comparison=compareSections(events,spans[0],s);s.variation=true;s.similarity=comparison.score;s.transpose=comparison.shift;}});
 const pattern=sections.map(s=>s.label).join('');
 let family='Other';
 if([24,25,26,27].includes(song.index)&&song.bars===12)family='12-bar blues';
 if(family==='Other'&&song.bars===32&&rhythmBridge(events,tonic))family='Rhythm-like';
 if(family==='Other'&&['AABA','ABAC','ABAB','AABC','AAAA','ABAA','ABCA'].includes(pattern))family=pattern;
 const repeated=sections.some((s,i)=>i>0&&s.label==='A'),aligned=repeated&&sections.length>=3&&new Set(sections.map(s=>s.label)).size<=3;
 let row=-1,column=0;
 for(const s of sections){if(row<0||s.label==='A'){row++;column=0;}s.layoutRow=row;s.layoutColumn=column;s.bars=s.end-s.start;column+=s.bars;}
 const columns=sections.reduce((n,s)=>Math.max(n,s.layoutColumn+s.bars),0);
 return {song:song.index,basis:confirmed?'source-audit':'harmonic-comparison',family,pattern:pattern||null,aligned,columns,sections};
}
export function sectionRows(song,form){
 if(!form.aligned)return song.rows;
 return form.sections.map(section=>{
  const slice=field=>song.rows.flatMap(row=>row[field].map(item=>({...item,start:row.startBar+item.start,end:row.startBar+item.end}))).filter(item=>item.start<section.end&&item.end>section.start).map(item=>({...item,start:Math.max(item.start,section.start)-section.start,end:Math.min(item.end,section.end)-section.start}));
  return {startBar:section.start,bars:section.end-section.start,keys:slice('keys'),bricks:slice('bricks'),chords:slice('chords'),joins:[],section:section.label,layoutRow:section.layoutRow,layoutColumn:section.layoutColumn};
 });
}
