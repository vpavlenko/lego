import {chordTimeline,compareSections} from './forms.mjs';
import {brickIdentity} from './bricks.mjs';
import {mod} from '../../dist/harmony.mjs';

const EPS=1e-7;
const same=(a,b)=>Math.abs(a-b)<EPS;
function canonicalName(name,brickMap){
 const mapped=brickMap?.get?.(name)??brickMap?.[name];
 return typeof mapped==='string'?mapped:mapped?.name??brickIdentity(name);
}
function sourceBricks(song,brickMap){
 return song.rows.flatMap((row,ri)=>row.bricks.map(brick=>({...brick,start:row.startBar+brick.start,end:row.startBar+brick.end,row:ri,canonical:canonicalName(brick.name,brickMap)}))).sort((a,b)=>a.start-b.start||a.end-b.end);
}
function hasJoin(song,bar){return song.rows.some(row=>row.joins?.some(join=>same(row.startBar+join.at,bar)));}

// A half is one occurrence, including a source occurrence continued across a
// printed row. Separate bricks inside a row never become one by sharing a name.
function halfBrick(song,bricks,half){
 const inside=bricks.filter(brick=>brick.start<half.end-EPS&&brick.end>half.start+EPS);
 if(!inside.length||!same(inside[0].start,half.start)||!same(inside.at(-1).end,half.end))return null;
 const name=inside[0].canonical;
 if(inside.some(brick=>brick.canonical!==name||brick.start<half.start-EPS||brick.end>half.end+EPS||brick.partial||brick.partialStart||brick.partialEnd||brick.incomplete||brick.incompleteStart||brick.incompleteEnd))return null;
 for(let i=1;i<inside.length;i++){
  const before=inside[i-1],after=inside[i],beforeRow=song.rows[before.row],afterRow=song.rows[after.row];
  if(!same(before.end,after.start)||after.row!==before.row+1||!same(before.end,beforeRow.startBar+beforeRow.bars)||!same(after.start,afterRow.startBar)||hasJoin(song,after.start))return null;
 }
 return name;
}
function completeChords(events,half){
 const cells=events.filter(chord=>chord.start<half.end-EPS&&chord.end>half.start+EPS);let cursor=half.start;
 for(const chord of cells){
  if(chord.start>cursor+EPS||chord.clipped||chord.root===null||/[.…]/.test(chord.symbol))return false;
  cursor=Math.max(cursor,chord.end);
 }
 if(cursor<half.end-EPS)return false;
 // Repeated lettering of one sustained chord is not a melodic/harmonic idea.
 return new Set(cells.map(chord=>`${chord.root}:${chord.symbol.replace(/^[A-G][b#]*/,'')}`)).size>=2;
}
function compareHalves(events,a,b){
 const sampled=compareSections(events,a,b),length=a.end-a.start;
 if(sampled.score<.9||sampled.rootScore<.9)return null;
 // Check the complete duration as well as the form classifier's sampled core;
 // a matching opening must not conceal a different tail or a short gap.
 const edges=[0,length];
 for(const half of [a,b])for(const chord of events)if(chord.start<half.end-EPS&&chord.end>half.start+EPS)edges.push(Math.max(0,chord.start-half.start),Math.min(length,chord.end-half.start));
 edges.sort((x,y)=>x-y);let harmony=0,roots=0;
 for(let i=1;i<edges.length;i++){
  const start=edges[i-1],end=edges[i];if(end-start<EPS)continue;
  const x=(start+end)/2,ca=events.find(c=>c.start<=a.start+x&&c.end>a.start+x),cb=events.find(c=>c.start<=b.start+x&&c.end>b.start+x);
  if(!ca||!cb)return null;
  const weight=(end-start)/length,root=mod(ca.root-cb.root)===sampled.shift;
  roots+=weight*Number(root);harmony+=weight*((root?.75:0)+(ca.kind===cb.kind?.25:0));
 }
 return harmony>=.9-EPS&&roots>=.9-EPS?{score:harmony,rootScore:roots,shift:sampled.shift}:null;
}

/** Display-only alignment for repeated brick-sized halves inside formal A.
 * Formal sections, family and pattern remain the source/form analysis layer. */
function alignBrickHalves(song,form,brickMap){
 const sections=(form.sections??[]).map(section=>({...section}));
 const unchanged=()=>({...form,sections,layoutSections:sections.map(section=>({...section})),layoutColumns:form.columns});
 const as=sections.filter(section=>section.label==='A');
 if(!form.aligned||as.length<2)return unchanged();
 const events=chordTimeline(song).sort((a,b)=>a.start-b.start||a.end-b.end),bricks=sourceBricks(song,brickMap),candidates=[];
 for(const section of as){
  const middle=(section.start+section.end)/2,left={start:section.start,end:middle},right={start:middle,end:section.end};
  if(middle-section.start<2-EPS||!same(section.end-section.start,as[0].end-as[0].start))return unchanged();
  const first=halfBrick(song,bricks,left),second=halfBrick(song,bricks,right);
  if(!first||first!==second||!completeChords(events,left)||!completeChords(events,right))return unchanged();
  const comparison=compareHalves(events,left,right);if(!comparison)return unchanged();
  candidates.push({section,left,right,brick:first,comparison});
 }
 const reference=candidates[0];
 for(const item of candidates.slice(1))if(item.brick!==reference.brick||!compareHalves(events,reference.left,item.left)||!compareHalves(events,reference.right,item.right))return unchanged();
 const byStart=new Map(candidates.map(item=>[item.section.start,item])),layoutSections=[];let row=-1,column=0;
 for(let formalSection=0;formalSection<sections.length;formalSection++){
  const section=sections[formalSection],candidate=byStart.get(section.start),pieces=candidate?[candidate.left,candidate.right]:[section];
  for(let subphrase=0;subphrase<pieces.length;subphrase++){
   const piece=pieces[subphrase];if(row<0||section.label==='A'){row++;column=0;}
   const display={...section,...piece,bars:piece.end-piece.start,layoutRow:row,layoutColumn:column};
   if(candidate)Object.assign(display,{formalSection,subphrase,subphraseBrick:candidate.brick,subphraseComparison:{...candidate.comparison}});
   layoutSections.push(display);column+=display.bars;
  }
 }
 return {...form,sections,layoutSections,layoutColumns:layoutSections.reduce((columns,section)=>Math.max(columns,section.layoutColumn+section.bars),0)};
}

function progression(events,span){
 if(!completeChords(events,span))return null;
 const chords=events.filter(c=>c.start<span.end-EPS&&c.end>span.start+EPS).map(c=>({...c,start:Math.max(c.start,span.start)-span.start,end:Math.min(c.end,span.end)-span.start}));
 if(new Set(chords.map(c=>c.root)).size<2||new Set(chords.map(c=>`${c.root}:${c.kind}`)).size<3)return null;
 return chords;
}
// Uniform full-duration comparison, independent of the form classifier's
// opening-weighted score. One constant transposition covers the entire phrase.
function timedComparison(events,a,b){
 const length=a.end-a.start;if(!same(length,b.end-b.start))return null;
 const left=progression(events,a),right=progression(events,b);if(!left||!right)return null;
 const edges=[...new Set([0,length,...left.flatMap(c=>[c.start,c.end]),...right.flatMap(c=>[c.start,c.end])])].sort((x,y)=>x-y),slices=[];
 for(let i=1;i<edges.length;i++){
  const start=edges[i-1],end=edges[i];if(end-start<EPS)continue;
  const at=(start+end)/2,ca=left.find(c=>c.start<=at&&c.end>at),cb=right.find(c=>c.start<=at&&c.end>at);if(!ca||!cb)return null;
  slices.push({weight:(end-start)/length,a:ca,b:cb});
 }
 const comparisons=[];
 for(let shift=0;shift<12;shift++){
  let roots=0,qualities=0;
  for(const slice of slices){roots+=slice.weight*Number(mod(slice.a.root-slice.b.root)===shift);qualities+=slice.weight*Number(slice.a.kind===slice.b.kind);}
  comparisons.push({score:.75*roots+.25*qualities,rootScore:roots,qualityScore:qualities,shift});
 }
 const best=comparisons.sort((a,b)=>b.score-a.score||b.rootScore-a.rootScore||a.shift-b.shift)[0];
 return best.score>=.9-EPS&&best.rootScore>=.9-EPS?best:null;
}
function groupedSourceRows(song,form){
 const rows=[...song.rows].sort((a,b)=>a.startBar-b.startBar);let cursor=0;
 for(const row of rows){if(!same(row.startBar,cursor)||row.bars<=0)return null;cursor+=row.bars;}
 if(!same(cursor,song.bars))return null;
 const events=chordTimeline(song).sort((a,b)=>a.start-b.start||a.end-b.end);
 if(!completeChords(events,{start:0,end:song.bars}))return null;
 const boundaries=[0,...rows.map(row=>row.startBar+row.bars)],boundary=value=>boundaries.some(b=>same(b,value)),cache=new Map();
 const compare=(a,b)=>{const key=[a.start,a.end,b.start,b.end].join('/');if(!cache.has(key))cache.set(key,timedComparison(events,a,b));return cache.get(key);};
 const previousAs=form.aligned?form.sections.filter(s=>s.label==='A'):[],previousPhrase=Math.max(0,...previousAs.map(s=>s.end-s.start)),previousRepeatedBars=previousAs.length>=2?previousAs.reduce((n,s)=>n+s.end-s.start,0):0,candidates=[];
 for(const length of boundaries.filter(length=>length>previousPhrase+EPS&&length<=song.bars/2+EPS)){
  // A promotion combines at least two printed rows. A larger phrase made
  // entirely of equivalent smaller units adds no new repeated material.
  if(rows.filter(row=>row.startBar<length-EPS).length<2)continue;
  const spans=[];let valid=true;
  for(let start=0;start<song.bars-EPS;start+=length){const end=Math.min(start+length,song.bars);if(!boundary(start)||!boundary(end)){valid=false;break;}spans.push({start,end});}
  if(!valid)continue;
  let primitive=true;
  for(const unit of boundaries.filter(unit=>unit>0&&unit<length-EPS&&same(length/unit,Math.round(length/unit)))){
   let repeated=true;for(let start=unit;start<length-EPS;start+=unit)if(!boundary(start)||!compare({start:0,end:unit},{start,end:start+unit})){repeated=false;break;}
   if(repeated){primitive=false;break;}
  }
  if(!primitive)continue;
  const representatives=[],sections=[];
  for(const span of spans){
   if(!completeChords(events,span)){valid=false;break;}
   let best=null;
   for(let i=0;i<representatives.length;i++){
    const comparison=compare(representatives[i],span);if(comparison&&(!best||comparison.score>best.score))best={...comparison,index:i};
   }
   const index=best?.index??representatives.length;if(!best)representatives.push(span);
   sections.push({...span,label:String.fromCharCode(65+index),bars:span.end-span.start,similarity:best?.score??1,transpose:best?.shift??0,...(best?{phraseComparison:{score:best.score,rootScore:best.rootScore,qualityScore:best.qualityScore,shift:best.shift}}:{})});
  }
  if(!valid)continue;
  const repeats=sections.filter(section=>section.label==='A');if(repeats.length<2)continue;
  const repeatedBars=repeats.reduce((n,s)=>n+s.bars,0);if(repeatedBars<previousRepeatedBars-EPS)continue;
  let row=-1,column=0;for(const section of sections){if(row<0||section.label==='A'){row++;column=0;}section.layoutRow=row;section.layoutColumn=column;column+=section.bars;}
  candidates.push({sections,columns:Math.max(...sections.map(s=>s.layoutColumn+s.bars)),length,repeatedBars,previousRepeatedBars,minimumScore:Math.min(...repeats.map(s=>s.similarity))});
 }
 return candidates.sort((a,b)=>b.repeatedBars-a.repeatedBars||b.length-a.length||b.minimumScore-a.minimumScore||a.columns-b.columns)[0]??null;
}

/** Keep formal analysis separate from a display grouping supported by complete
 * repeated music. Fine repeated bricks take priority; otherwise longer
 * primitive printed-row groups may supply the vertical phrase alignment. */
export function alignRepeatedSubphrases(song,form,brickMap){
 const fine=alignBrickHalves(song,form,brickMap);
 if(fine.layoutSections.length>fine.sections.length)return {...fine,layoutAligned:true,layoutBasis:'repeated-brick-halves'};
 const grouped=groupedSourceRows(song,form);if(!grouped)return fine;
 return {...fine,layoutSections:grouped.sections,layoutColumns:grouped.columns,layoutAligned:true,layoutBasis:'repeated-source-row-groups',layoutPhraseBars:grouped.length,layoutEvidence:{repeatedBars:grouped.repeatedBars,previousRepeatedBars:grouped.previousRepeatedBars,minimumScore:grouped.minimumScore}};
}
