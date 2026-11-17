import {buildBrickVariants} from './brick-variants.mjs';
import {variantDistance} from './variant-order.mjs';

const EPS=1e-9,MAX_DISTANCE=.28,AMBIGUITY_MARGIN=.025;
const clone=value=>structuredClone(value);
const unique=values=>[...new Set(values)];
const standardIds=brick=>unique(brick.standards.map(standard=>standard.song)).sort((a,b)=>a-b);
function coreQuality(intervals){
 if(!Array.isArray(intervals))return null;
 const pcs=new Set(intervals.map(interval=>(interval%12+12)%12));
 if(pcs.has(3)&&pcs.has(6)&&!pcs.has(7))return pcs.has(10)?'half-diminished':'diminished';
 if(pcs.has(4)&&pcs.has(8)&&!pcs.has(7))return pcs.has(10)?'augmented-dominant':'augmented';
 if(pcs.has(3)&&!pcs.has(4))return 'minor';
 if(pcs.has(4))return pcs.has(10)?'dominant':'major';
 if(pcs.has(5)&&!pcs.has(3))return 'suspended';
 return null;
}
function describe(variant){
 const chords=variant.structure.chords.map(chord=>{
  if(!chord.harmony||!Number.isFinite(chord.harmony[0]))return null;
  const core=coreQuality(chord.harmony[1]);return core?{root:chord.harmony[0],core}:null;
 });
 return {variant,chords,supported:chords.length>=2&&chords.every(Boolean),signature:JSON.stringify(chords)};
}
function sameChord(a,b){return a&&b&&a.root===b.root&&a.core===b.core;}
function anchors(a,b){
 const lengths=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)lengths[i][j]=sameChord(a[i-1],b[j-1])?lengths[i-1][j-1]+1:Math.max(lengths[i-1][j],lengths[i][j-1]);
 let i=a.length,j=b.length;const pairs=[];
 while(i&&j){if(sameChord(a[i-1],b[j-1])){pairs.push([i-1,j-1]);i--;j--;}else if(lengths[i-1][j]>=lengths[i][j-1])i--;else j--;}
 return pairs.reverse();
}
function matchingPair(source,target){
 if(!source.supported||!target.supported)return null;
 const a=source.chords,b=target.chords,pairs=anchors(a,b),short=Math.min(a.length,b.length),long=Math.max(a.length,b.length);
 if(pairs.length<2)return null;
 const distance=variantDistance(source.variant,target.variant);
 if(distance>MAX_DISTANCE+EPS)return null;
 // Two chords alone are safe only as the same complete rooted/core-quality
 // sequence with a small quality/bass/rhythm variation, never as a fragment.
 if(short===2){if(a.length!==2||b.length!==2||pairs.length!==2||distance>.12+EPS)return null;}
 else if(pairs.length<3||pairs.length/short<.8-EPS||pairs.length/long<.75-EPS)return null;
 const first=pairs[0],last=pairs.at(-1);
 if(first[0]!==0&&first[1]!==0||last[0]!==a.length-1&&last[1]!==b.length-1)return null;
 return {distance,anchors:pairs.length,anchorPairs:pairs,sourceChords:a.length,targetChords:b.length,shortCoverage:pairs.length/short,longCoverage:pairs.length/long};
}
function preparedFamily(brick,songs,vocabulary){
 const definitions=buildBrickVariants(brick,songs,vocabulary),variants=definitions.variants.map(describe),groups=new Map();
 for(const description of variants){
  if(!description.supported)continue;
  const ids=groups.get(description.signature)??new Set();for(const standard of description.variant.standards)if(standard.passages.some(passage=>passage.status==='complete'))ids.add(standard.song);groups.set(description.signature,ids);
 }
 for(const description of variants)description.support=groups.get(description.signature)??new Set();
 return {brick,definitions,variants,standards:standardIds(brick)};
}
function candidateFor(source,target){
 const pairs=[];
 for(const own of source.variants){
  let best=null;
  for(const other of target.variants){
   if(other.support.size<2)continue;
   const comparison=matchingPair(own,other);if(!comparison)continue;
   const candidate={...comparison,sourceVariantId:own.variant.id,targetVariantId:other.variant.id,supportStandards:[...other.support].sort((a,b)=>a-b),sourceStructure:own.variant.structure,targetStructure:other.variant.structure,weight:own.variant.completeOccurrences};
   if(!best||candidate.distance<best.distance-EPS||Math.abs(candidate.distance-best.distance)<=EPS&&(candidate.supportStandards.length>best.supportStandards.length||candidate.supportStandards.length===best.supportStandards.length&&candidate.targetVariantId<best.targetVariantId))best=candidate;
  }
  if(!best)return null;pairs.push(best);
 }
 if(!pairs.length)return null;
 const weight=pairs.reduce((n,p)=>n+p.weight,0),distance=pairs.reduce((n,p)=>n+p.distance*p.weight,0)/weight;
 return {name:target.brick.name,slug:target.brick.slug,standards:target.standards,distance,pairs};
}
function nearestRejected(source,targets){
 const nearest=[];
 for(const target of targets){
  let best=null;
  for(const own of source.variants)for(const other of target.variants){
   if(!own.supported||!other.supported)continue;
   const distance=variantDistance(own.variant,other.variant),comparison=matchingPair(own,other),pairs=anchors(own.chords,other.chords);
   const reason=other.support.size<2?'insufficient-complete-core-support':comparison?'another-source-variant-not-supported':'root-core-anchor-or-distance-guard';
   const item={name:target.brick.name,slug:target.brick.slug,sourceVariantId:own.variant.id,targetVariantId:other.variant.id,distance,anchors:pairs.length,anchorPairs:pairs,sourceChords:own.chords.length,targetChords:other.chords.length,supportStandards:[...other.support].sort((a,b)=>a-b),sourceStructure:own.variant.structure,targetStructure:other.variant.structure,reason};
   if(!best||distance<best.distance-EPS)best=item;
  }
  if(best)nearest.push(best);
 }
 return nearest.sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name)).slice(0,3);
}
function mergeFamily(target,sources){
 const all=[target,...sources],matches=new Map();
 for(const brick of all)for(const match of brick.standards){
  let destination=matches.get(match.song);if(!destination){destination={...clone(match),passages:[]};matches.set(match.song,destination);}
  destination.passages.push(...clone(match.passages));
 }
 const standards=[...matches.values()].sort((a,b)=>a.song-b.song);
 for(const match of standards)match.passages.sort((a,b)=>a.start-b.start||a.end-b.end||a.row-b.row||a.label.localeCompare(b.label));
 return {...clone(target),standards,passages:standards.reduce((n,s)=>n+s.passages.length,0),aliases:unique(all.flatMap(b=>[b.name,...b.aliases])).filter(name=>name!==target.name).sort((a,b)=>a.localeCompare(b)),aliasSlugs:unique(all.flatMap(b=>[b.slug,...b.aliasSlugs])).filter(slug=>slug!==target.slug).sort(),sourceNames:unique(all.flatMap(b=>b.sourceNames??[b.name])).sort((a,b)=>a.localeCompare(b)),sourceSlugs:unique(all.flatMap(b=>b.sourceSlugs??[b.slug])).sort(),clipped:all.every(b=>b.clipped)};
}
function sourceEvidence(source){
 return {name:source.brick.name,slug:source.brick.slug,distinctStandards:source.standards.length,standards:source.standards,passages:source.brick.passages,aliases:clone(source.brick.aliases),aliasSlugs:clone(source.brick.aliasSlugs),sourceNames:clone(source.brick.sourceNames??[source.brick.name]),sourceSlugs:clone(source.brick.sourceSlugs??[source.brick.slug]),positions:source.brick.standards.flatMap(standard=>standard.passages.map(passage=>({song:standard.song,title:standard.title,...clone(passage)}))),variantStats:source.definitions.stats,variants:source.definitions.variants.map(variant=>({id:variant.id,structure:clone(variant.structure),completeOccurrences:variant.completeOccurrences,standards:clone(variant.standards)})),unresolvedStandards:clone(source.definitions.unresolvedStandards)};
}
const positionKey=(song,row,label,start,end)=>JSON.stringify([song,row,label,start,end]);

/** Refine learner reuse without rewriting musical data or original labels.
 * Support counts distinct standards, not repeated instances within one chart.
 * Only targets already supported by at least two standards can receive a merge.
 */
export function refineSingleUseFamilies(learnerIndex,songs,vocabulary){
 const prepared=learnerIndex.bricks.map(brick=>preparedFamily(brick,songs,vocabulary)),sources=prepared.filter(f=>f.standards.length===1),targets=prepared.filter(f=>f.standards.length>=2),decisions=[];
 for(const source of sources){
  const evidence=sourceEvidence(source),safe=source.variants.length>0&&source.variants.every(v=>v.supported)&&!source.definitions.stats.partialOccurrences&&!source.definitions.stats.unknownOccurrences&&!source.definitions.stats.unresolvedOccurrences;
  const candidates=safe?targets.map(target=>candidateFor(source,target)).filter(Boolean).sort((a,b)=>a.distance-b.distance||b.standards.length-a.standards.length||a.name.localeCompare(b.name)):[];
  const best=candidates[0],second=candidates[1],ambiguous=best&&second&&second.distance-best.distance<=AMBIGUITY_MARGIN+EPS;
  if(best&&!ambiguous)decisions.push({action:'merge',source:evidence,target:{name:best.name,slug:best.slug,distinctStandards:best.standards.length,standards:best.standards},distance:best.distance,pairs:best.pairs,candidates,reason:'clear-supported-harmonic-variant'});
  else{
   const rejected=safe&&!candidates.length?nearestRejected(source,targets):[];
   decisions.push({action:'remove',source:evidence,distance:best?.distance??rejected[0]?.distance??null,reason:!safe?'unsupported-or-incomplete-source':ambiguous?'ambiguous-supported-families':'no-clear-supported-harmonic-variant',candidates,nearestRejected:rejected});
  }
 }
 const bySource=new Map(decisions.map(d=>[d.source.slug,d])),incoming=new Map();
 for(const decision of decisions)if(decision.action==='merge'){
  const members=incoming.get(decision.target.slug)??[];members.push(learnerIndex.bricks.find(b=>b.slug===decision.source.slug));incoming.set(decision.target.slug,members);
 }
 const bricks=learnerIndex.bricks.filter(b=>!bySource.has(b.slug)).map(b=>mergeFamily(b,incoming.get(b.slug)??[]));
 const removedPositions=new Set(decisions.filter(d=>d.action==='remove').flatMap(d=>d.source.positions.map(p=>positionKey(p.song,p.row,p.label,p.startBar,p.endBar))));
 let removedPassages=0;
 const filteredSongs=songs.map(song=>{
  const rows=song.rows.map((row,ri)=>({...row,bricks:row.bricks.filter(span=>{const keep=!removedPositions.has(positionKey(song.index,ri,span.name,row.startBar+span.start,row.startBar+span.end));if(!keep)removedPassages++;return keep;}).map(span=>({...span}))}));
  return {...song,rows,bricks:unique(rows.flatMap(row=>row.bricks.map(b=>b.name))).sort((a,b)=>a.localeCompare(b))};
 });
 const merged=decisions.filter(d=>d.action==='merge'),removed=decisions.filter(d=>d.action==='remove'),rawPassages=songs.reduce((n,s)=>n+s.rows.reduce((m,r)=>m+r.bricks.length,0),0);
 const stats={inputFamilies:learnerIndex.bricks.length,singleStandardFamilies:sources.length,reusableTargets:targets.length,mergedFamilies:merged.length,removedFamilies:removed.length,outputFamilies:bricks.length,rawPassages,mergedPassages:merged.reduce((n,d)=>n+d.source.passages,0),removedPassages,keptPassages:rawPassages-removedPassages,supportBasis:'distinct standards',minimumTargetStandards:2,maxVariantDistance:MAX_DISTANCE,ambiguityMargin:AMBIGUITY_MARGIN};
 return {index:{...learnerIndex,bricks},songs:filteredSongs,stats,decisions};
}
