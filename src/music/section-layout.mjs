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
export function alignRepeatedSubphrases(song,form,brickMap){
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
