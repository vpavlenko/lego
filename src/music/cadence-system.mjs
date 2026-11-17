import {mod,pitch,roman} from '../../dist/harmony.mjs';

// The user's twelve-row illustration, transposed from its written F target
// to C. These are root/quality patterns, not names inferred from brick labels.
const roots=[
 [4,9,2,7],[4,9,2,1],[4,9,8,1],[4,9,8,7],
 [4,3,2,7],[4,3,2,1],[10,3,8,7],[10,3,8,1],
 [3,8,2,7],[9,8,8,7],[3,2,2,1],[9,2,2,1]
];
const names=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export const CADENCE_SCHEME=roots.map((roots,i)=>({id:`scheme-${String(i+1).padStart(2,'0')}`,row:i+1,roots,qualities:['minor7','dominant','minor7','dominant'],symbols:roots.map((root,j)=>names[root]+(j%2?'7':'m7'))}));
const classes=intervals=>{
 if(!Array.isArray(intervals))return null;
 const pcs=new Set(intervals.map(mod));
 if(pcs.has(4)&&pcs.has(10))return 'dominant';
 if(pcs.has(3)&&!pcs.has(4)&&pcs.has(7))return pcs.has(10)?'minor7':'minor';
 if(pcs.has(3)&&!pcs.has(4)&&pcs.has(6)&&pcs.has(10))return 'half-diminished';
 return null;
};
function chordCore(chord){
 const harmony=chord.harmony;
 if(!harmony||!Number.isInteger(harmony[0])||!Array.isArray(harmony[1]))return null;
 return {root:mod(harmony[0]),quality:classes(harmony[1]),intervals:harmony[1],bass:harmony[2],symbol:chord.symbol};
}
const pairKind=(minor,dominant)=>mod(dominant.root-minor.root)===5?'ii–V':mod(dominant.root-minor.root)===11?'ii–♭II':null;
const linkKind=interval=>({0:'V→v',5:'V→i',6:'V→♭v',11:'♭II→i'})[interval]??`Δ${interval>6?interval-12:interval}`;
const isMinor=quality=>['minor7','minor','half-diminished'].includes(quality);
/** Classify one complete contiguous four-chord cell against an explicit tonic.
 * Extension/voicing differences are recorded; roots, quality class and all
 * intervening harmonic events are checked rather than guessed from names. */
export function classifyCadenceWindow(chords,{tonic=0}={}){
 if(chords.length!==4||!Number.isInteger(tonic))return null;
 const core=chords.map(chordCore);
 if(core.some(chord=>!chord)||!isMinor(core[0].quality)||core[1].quality!=='dominant'||!isMinor(core[2].quality)||core[3].quality!=='dominant')return null;
 const cells=[pairKind(core[0],core[1]),pairKind(core[2],core[3])];if(cells.some(kind=>!kind))return null;
 const degrees=core.map(chord=>mod(chord.root-tonic));
 // A home-target classification requires the second minor/dominant cell to
 // be ii–V, ii–subV, tritone-ii–V or tritone-ii–subV relative to that target.
 if(![2,8].includes(degrees[2])||![1,7].includes(degrees[3]))return null;
 const strict=core[0].quality==='minor7'&&core[2].quality==='minor7';
 const row=strict?CADENCE_SCHEME.find(row=>row.roots.every((root,i)=>root===degrees[i])):null;
 const link=mod(core[2].root-core[1].root);
 return {relation:row?'diagram':'generalized',schemeRow:row?.row??null,tonic:mod(tonic),roots:degrees,qualities:core.map(chord=>chord.quality),cells,link:{interval:link,symbol:linkKind(link)},symbols:core.map(chord=>chord.symbol),rns:core.map(chord=>roman(chord.symbol,names[mod(tonic)])),slashBasses:core.map(chord=>chord.bass),intervals:core.map(chord=>chord.intervals)};
}
/** All matches retain source variant/event indices. A longer brick may contain
 * the illustrated core without being equivalent to that four-chord core. */
export function cadenceWindows(variant,{tonic=0}={}){
 const chords=variant.structure?.chords??[],windows=[];
 for(let start=0;start+3<chords.length;start++){
  const match=classifyCadenceWindow(chords.slice(start,start+4),{tonic});
  if(match)windows.push({...match,startChord:start,endChord:start+4,start:variant.performance?.chords?.[start]?.start??null,end:variant.performance?.chords?.[start+3]?.end??null,whole:start===0&&chords.length===4,variantId:variant.id});
 }
 return windows;
}
const compositionIndex=(song,songs)=>songs?.[song]?.arrangementOf??song;
export function variantPopularity(variant,songs){return new Set((variant.standards??[]).map(match=>compositionIndex(match.song,songs))).size;}
export function popularBrickVariant(variants,songs){
 return [...variants].sort((a,b)=>variantPopularity(b,songs)-variantPopularity(a,songs)||(b.completeOccurrences??0)-(a.completeOccurrences??0)||(a.number??0)-(b.number??0)||a.id.localeCompare(b.id))[0]??null;
}
/** An auditable symbolic definition of the most widely used complete variant.
 * Raw source symbols, exact intervals and slash-bass identity remain available
 * so a representative example is never presented as a universal grammar. */
export function structuralSummary(definitions,{songs}={}){
 const variants=definitions.variants??[],variant=popularBrickVariant(variants,songs);if(!variant)return null;
 const chords=variant.structure?.chords??[],tokens=chords.map(chord=>({text:roman(chord.symbol,'C'),degree:chord.harmony?.[0]??pitch(chord.symbol),symbol:chord.symbol,harmony:chord.harmony}));
 return {slug:definitions.slug,variantId:variant.id,standards:variantPopularity(variant,songs),variantCount:variants.length,tokens,text:tokens.map(token=>token.text).join('–'),cadences:cadenceWindows(variant)};
}
/** A separate catalogue index; this supplements, rather than replaces, the
 * catalogue's existing Impro-Visor/family groups and source brick identities. */
export function buildCadenceSystem(definitions,{songs}={}){
 const rows=CADENCE_SCHEME.map(row=>({...row,matches:[]})),generalized=new Map(),summaries={};
 for(const definition of definitions){
  summaries[definition.slug]=structuralSummary(definition,{songs});
  for(const variant of definition.variants??[])for(const match of cadenceWindows(variant)){
   const entry={slug:definition.slug,name:definition.name,variantId:variant.id,standards:variantPopularity(variant,songs),...match};
   if(match.schemeRow){rows[match.schemeRow-1].matches.push(entry);continue;}
   const key=[...match.cells,match.link.interval,...match.qualities].join('|');
   if(!generalized.has(key))generalized.set(key,{id:key,cells:match.cells,link:match.link,qualities:match.qualities,matches:[]});generalized.get(key).matches.push(entry);
  }
 }
 const sort=matches=>matches.sort((a,b)=>b.standards-a.standards||a.name.localeCompare(b.name)||a.variantId.localeCompare(b.variantId)||a.startChord-b.startChord);
 rows.forEach(row=>sort(row.matches));for(const group of generalized.values())sort(group.matches);
 return {version:1,target:'C',rows,generalized:[...generalized.values()].sort((a,b)=>b.matches.length-a.matches.length||a.id.localeCompare(b.id)),summaries};
}
