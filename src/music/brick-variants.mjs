import {pitch,mod,transposeChord} from '../../dist/harmony.mjs';
import {parseChord} from './realization.mjs';
import {buildBrickIndex,brickIdentity} from './bricks.mjs';

const EPS=1e-7;
const same=(a,b)=>Math.abs(a-b)<EPS;
const gcd=(a,b)=>{while(b){const next=a%b;a=b;b=next;}return a<0n?-a:a;};
function fraction(value){
 // Recover exact musical divisions after ordinary JS addition/subtraction
 // (0.1 + 0.2, for example). This only removes sub-nanobar round-off;
 // all structural comparisons after conversion use integer arithmetic.
 const absolute=Math.abs(value),signOfValue=value<0?-1n:1n;let x=absolute,h0=0,h1=1,k0=1,k1=0;
 for(let i=0;i<32&&Number.isFinite(x);i++){
  const whole=Math.floor(x),h=whole*h1+h0,k=whole*k1+k0;if(k>1000000||!Number.isSafeInteger(h)||!Number.isSafeInteger(k))break;
  if((h!==0||absolute===0)&&Math.abs(h/k-absolute)<1e-10)return [signOfValue*BigInt(h),BigInt(k)];
  const remainder=x-whole;if(remainder===0)break;h0=h1;h1=h;k0=k1;k1=k;x=1/remainder;
 }
 let text=String(value),sign=1n;if(text.startsWith('-')){sign=-1n;text=text.slice(1);}
 const [mantissa,exponentText='0']=text.toLowerCase().split('e'),exponent=Number(exponentText),parts=mantissa.split('.'),digits=(parts[0]||'0')+(parts[1]||'');
 let n=sign*BigInt(digits||'0'),d=10n**BigInt(parts[1]?.length||0);if(exponent>0)n*=10n**BigInt(exponent);else if(exponent<0)d*=10n**BigInt(-exponent);
 const divisor=gcd(n,d);return [n/divisor,d/divisor];
}
function ratio(value,total){const [n,d]=fraction(value),[tn,td]=fraction(total),a=n*td,b=d*tn,g=gcd(a,b);return `${a/g}/${b/g}`;}
const ratioPair=text=>text.split('/').map(BigInt);
const ratioEqual=(a,b)=>{const [an,ad]=ratioPair(a),[bn,bd]=ratioPair(b);return an*bd===bn*ad;};
function hash(text){let a=2166136261,b=3339675911;for(const char of text){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b^char.charCodeAt(0),2246822519);}return (a>>>0).toString(36)+'-'+(b>>>0).toString(36);}

function keyEvents(song){
 const events=[];for(const row of song.rows)for(const key of row.keys)events.push({bar:row.startBar+key.start,root:key.root,mode:key.mode});
 events.sort((a,b)=>a.bar-b.bar);return events;
}
function keyAt(song,bar){let key={root:song.tonic[0],mode:song.tonic[1]};for(const event of keyEvents(song)){if(event.bar>bar+EPS)break;key=event;}return key;}
function hasJoin(song,bar){return song.rows.some(row=>row.joins.some(join=>same(row.startBar+join.at,bar)));}
function rawBrick(song,segment){const row=song.rows[segment.row];return row.bricks.find(b=>same(row.startBar+b.start,segment.startBar)&&same(row.startBar+b.end,segment.endBar)&&brickIdentity(b.name)===brickIdentity(segment.label));}
function sourceFor(song,segments){
 const first=segments[0],last=segments.at(-1),barBeats=song.meter[0]*4/song.meter[1];
 return {song:song.index,title:song.title,row:first.row,startBar:first.startBar,endBar:last.endBar,start:first.startBar*barBeats,end:last.endBar*barBeats,segments:segments.map(s=>({...s})),labels:[...new Set(segments.map(s=>s.label))],continued:segments.length>1};
}

/** Assemble only actual adjacent row continuations; a join, including zero,
 * establishes a fresh occurrence. Every original row span remains in segments.
 */
export function collectBrickOccurrences(brick,songs){
 const bySong=new Map(songs.map(song=>[song.index,song])),result=[];
 for(const match of brick.standards){
  const song=bySong.get(match.song),spans=[...match.passages].sort((a,b)=>a.startBar-b.startBar||a.row-b.row);let chain=[];
  for(const span of spans){
   const last=chain.at(-1),previousRow=last&&song.rows[last.row],row=song.rows[span.row];
   const continuation=last&&span.row===last.row+1&&same(last.endBar,span.startBar)&&same(last.endBar,previousRow.startBar+previousRow.bars)&&same(span.startBar,row.startBar)&&!hasJoin(song,span.startBar);
   if(chain.length&&!continuation){result.push({song,source:sourceFor(song,chain)});chain=[];}
   chain.push(span);
  }
  if(chain.length)result.push({song,source:sourceFor(song,chain)});
 }
 return result;
}

/** A complete excerpt retains source meter and chords. Its tonic is the local
 * brick tonic, so the existing realizer performs the one required shift to C.
 */
export function occurrencePreview(brick,song,source){
 const start=source.startBar,end=source.endBar,bars=end-start,tonic=keyAt(song,start),events=[{...tonic,bar:start},...keyEvents(song).filter(k=>k.bar>start+EPS&&k.bar<end-EPS)],keys=[];
 for(const event of events){const previous=keys.at(-1);if(previous&&previous.root===event.root&&previous.mode===event.mode)continue;keys.push({start:event.bar-start,root:event.root,mode:event.mode});}
 keys.forEach((key,i)=>{key.end=keys[i+1]?.start??bars;});
 const chords=[];let cutStart=false,cutEnd=false,coalescedRowChords=0;
 for(let ri=0;ri<song.rows.length;ri++){
  const row=song.rows[ri];
  for(const cell of row.chords){
   const a=row.startBar+cell.start,b=row.startBar+cell.end;if(a>=end-EPS||b<=start+EPS)continue;
   if(a<start-EPS)cutStart=true;if(b>end+EPS)cutEnd=true;
   const next={...cell,start:Math.max(a,start)-start,end:Math.min(b,end)-start,_row:ri},previous=chords.at(-1),seam=row.startBar-start;
   // Repeated lettering at a row break is a graphical continuation, not an
   // additional harmonic event. Explicit within-row repetitions remain intact.
   const repeatedCarry=previous&&previous._row+1===ri&&same(previous.end,next.start)&&same(next.start,seam)&&previous.symbol===next.symbol&&!!previous.clipped===!!next.clipped&&!hasJoin(song,row.startBar)&&!keys.some(k=>same(k.start,seam));
   if(repeatedCarry){previous.end=next.end;previous._row=ri;coalescedRowChords++;}else chords.push(next);
  }
 }
 const declared=source.segments.map(s=>rawBrick(song,s)).filter(Boolean);
 const partialStart=cutStart||!!declared[0]?.partialStart||!!declared[0]?.incompleteStart;
 const partialEnd=cutEnd||!!declared.at(-1)?.partialEnd||!!declared.at(-1)?.incompleteEnd;
 const unknown=chords.some(c=>c.clipped||/[.…]/.test(c.symbol));
 let cursor=0,gap=false;for(const c of chords){if(c.start>cursor+EPS)gap=true;cursor=Math.max(cursor,c.end);}if(cursor<bars-EPS)gap=true;
 const partial=partialStart||partialEnd||gap||declared.some(b=>b.partial||b.incomplete);
 const joins=song.rows.flatMap(row=>row.joins.map(j=>({...j,at:row.startBar+j.at-start}))).filter(j=>j.at>EPS&&j.at<bars-EPS);
 const previewSong={index:song.index,title:brick.name,tonic:[tonic.root,tonic.mode],meter:[...song.meter],bars,columns:bars,rows:[{startBar:0,bars,keys,chords:chords.map(({_row,...c})=>c),bricks:[{start:0,end:bars,name:brick.name}],joins}]};
 return {previewSong,partial,partialStart,partialEnd,unknown,gap,coalescedRowChords};
}

/** Exact chord identities and rational rhythmic proportions. Equivalent
 * vocabulary spellings share compound intervals; slash-bass identity remains
 * explicit, and extension register is not reduced modulo twelve.
 */
export function brickStructure(previewSong,vocabulary={}){
 const qualities=vocabulary.qualities??vocabulary,tonic=pitch(previewSong.tonic[0]),duration=previewSong.bars;
 const row=previewSong.rows[0],chords=row.chords.map(cell=>{
  const parsed=parseChord(cell.symbol,qualities),symbol=transposeChord(cell.symbol,previewSong.tonic[0]);
  const fallback=/^([A-G][b#]*)(.*?)(?:\/([A-G][b#]*))?$/.exec(cell.symbol);
  const harmony=cell.clipped||!fallback?null:[mod(pitch(fallback[1])-tonic),parsed?[...parsed.intervals]:fallback[2],fallback[3]?mod(pitch(fallback[3])-tonic):null];
  return {symbol,harmony,at:ratio(cell.start,duration),duration:ratio(cell.end-cell.start,duration)};
 });
 const keys=row.keys.map(k=>[ratio(k.start,duration),mod(pitch(k.root)-tonic),k.mode.toLowerCase()]);
 const signature=JSON.stringify({chords:chords.map(c=>[c.harmony,c.at,c.duration]),keys});
 return {signature,structure:{chords,keys}};
}
function standardGroups(passages){
 const groups=new Map();for(const passage of passages){let match=groups.get(passage.song);if(!match){match={song:passage.song,title:passage.title,passages:[]};groups.set(passage.song,match);}match.passages.push(passage);}
 return [...groups.values()].sort((a,b)=>a.song-b.song).map(match=>({...match,passages:match.passages.sort((a,b)=>a.start-b.start)}));
}
function rationalText(n,d){const g=gcd(n,d);return `${n/g}/${d/g}`;}
function subtractRatios(a,b){const [an,ad]=ratioPair(a),[bn,bd]=ratioPair(b);return rationalText(an*bd-bn*ad,ad*bd);}
function addRatios(a,b){const [an,ad]=ratioPair(a),[bn,bd]=ratioPair(b);return rationalText(an*bd+bn*ad,ad*bd);}
function compareRatios(a,b){const [an,ad]=ratioPair(a),[bn,bd]=ratioPair(b),difference=an*bd-bn*ad;return difference<0n?-1:difference>0n?1:0;}
function normalizedKeyWindow(keys,start,end){
 let active=keys[0];for(const key of keys){if(compareRatios(key[0],start)>0)break;active=key;}
 if(!active)return [];
 const result=[['0/1',active[1],active[2]]],[dn,dd]=ratioPair(subtractRatios(end,start));
 for(const key of keys){if(compareRatios(key[0],start)<=0||compareRatios(key[0],end)>=0)continue;const [n,d]=ratioPair(subtractRatios(key[0],start));result.push([rationalText(n*dd,d*dn),key[1],key[2]]);}
 return result;
}
function windowShape(chords){const values=chords.map(c=>ratioPair(c.duration)),denominator=values.reduce((product,[,d])=>product*d,1n),weights=values.map(([n,d])=>n*(denominator/d)),sum=weights.reduce((a,b)=>a+b,0n);return weights.map(w=>{const g=gcd(w,sum);return `${w/g}/${sum/g}`;});}

/** Compatibility does not create a new definition. A fragment can be placed
 * under a full variant only when exactly one complete variant is compatible.
 * Clipped/unknown chords are never used as wildcards.
 */
export function fragmentCandidates(fragment,variants){
 const small=fragment.structure.chords;if(fragment.gap)return [];if(!small.length||small.some(c=>!c.harmony))return [];
 const result=[];
 for(const variant of variants){
  const large=variant.structure.chords;if(small.length>large.length)continue;
  for(let start=0;start+small.length<=large.length;start++){
   if(fragment.partialStart&&!fragment.partialEnd&&start+small.length!==large.length)continue;
   if(fragment.partialEnd&&!fragment.partialStart&&start!==0)continue;
   const window=large.slice(start,start+small.length);if(!small.every((c,i)=>JSON.stringify(c.harmony)===JSON.stringify(window[i].harmony)))continue;
   const shape=windowShape(window),own=windowShape(small);if(!shape.every((r,i)=>ratioEqual(r,own[i])))continue;
   const keys=normalizedKeyWindow(variant.structure.keys,window[0].at,addRatios(window.at(-1).at,window.at(-1).duration));if(JSON.stringify(keys)!==JSON.stringify(fragment.structure.keys))continue;
   result.push(variant.id);break;
  }
 }
 return [...new Set(result)];
}

export function buildBrickVariants(brick,songs,vocabulary={}){
 const occurrences=collectBrickOccurrences(brick,songs).map(({song,source})=>{
  const excerpt=occurrencePreview(brick,song,source),normalized=brickStructure(excerpt.previewSong,vocabulary);
  const status=excerpt.unknown?'unknown':excerpt.partial?'partial':'complete';
  return {...excerpt,...normalized,source,passage:{...source,status,reason:excerpt.unknown?'clipped-chord':excerpt.gap?'uncovered-time':excerpt.partial?'incomplete-source':null}};
 });
 const definitions=new Map();
 for(const occurrence of occurrences){
  if(occurrence.passage.status!=='complete')continue;
  let variant=definitions.get(occurrence.signature);if(!variant){variant={id:'v-'+hash(occurrence.signature),signature:occurrence.signature,structure:occurrence.structure,_complete:[],_partial:[]};definitions.set(occurrence.signature,variant);}variant._complete.push(occurrence);
 }
 const variants=[...definitions.values()];
 for(const variant of variants){
  variant._complete.sort((a,b)=>b.previewSong.bars-a.previewSong.bars||a.source.song-b.source.song||a.source.start-b.source.start);
  const representative=variant._complete[0];variant.previewSong=representative.previewSong;variant.source=representative.source;
 }
 const unresolved=[];
 for(const occurrence of occurrences){
  if(occurrence.passage.status==='complete')continue;
  const candidates=occurrence.unknown?[]:fragmentCandidates(occurrence,variants);occurrence.passage.candidateVariantIds=candidates;
  if(candidates.length===1){const variant=variants.find(v=>v.id===candidates[0]);variant._partial.push(occurrence);occurrence.passage.match='unique-compatible';}else unresolved.push(occurrence.passage);
 }
 const output=variants.sort((a,b)=>b._complete.length-a._complete.length||a.id.localeCompare(b.id)).map(({_complete,_partial,...variant})=>({...variant,completeOccurrences:_complete.length,partialOccurrences:_partial.length,sourcePassages:[..._complete,..._partial].reduce((n,o)=>n+o.source.segments.length,0),standards:standardGroups([..._complete,..._partial].map(o=>({...o.passage,variantId:variant.id})))}));
 const stats={variants:output.length,occurrences:occurrences.length,sourcePassages:occurrences.reduce((n,o)=>n+o.source.segments.length,0),continuedOccurrences:occurrences.filter(o=>o.source.continued).length,coalescedRowChords:occurrences.reduce((n,o)=>n+o.coalescedRowChords,0),completeOccurrences:occurrences.filter(o=>o.passage.status==='complete').length,partialOccurrences:occurrences.filter(o=>o.passage.status==='partial').length,unknownOccurrences:occurrences.filter(o=>o.passage.status==='unknown').length,matchedFragments:variants.reduce((n,v)=>n+v._partial.length,0),unresolvedOccurrences:unresolved.length};
 return {version:1,slug:brick.slug,name:brick.name,sourcePassages:stats.sourcePassages,occurrenceCount:stats.occurrences,variants:output,unresolvedStandards:standardGroups(unresolved),stats};
}

export function buildBrickVariantIndex(songs,{bricks=buildBrickIndex(songs).bricks,vocabulary={}}={}){
 const entries=bricks.map(brick=>buildBrickVariants(brick,songs,vocabulary)),stats={bricks:entries.length};
 for(const key of ['variants','occurrences','sourcePassages','continuedOccurrences','coalescedRowChords','completeOccurrences','partialOccurrences','unknownOccurrences','matchedFragments','unresolvedOccurrences'])stats[key]=entries.reduce((n,entry)=>n+entry.stats[key],0);
 return {version:1,bricks:entries,stats};
}
