import {buildBrickIndex,brickIdentity} from './bricks.mjs';
import {buildLearnerBrickIndex} from './brick-families.mjs';
import {collectBrickOccurrences} from './brick-variants.mjs';
import {parseChord} from './realization.mjs';

const EPS=1e-7;
const same=(a,b)=>Math.abs(a-b)<EPS;
function onOffFamily(brick){
 return [brick.name,...brick.aliases,...brick.sourceNames].some(label=>[label,brickIdentity(label)].some(name=>/^(?:On Off|Off On)\b/i.test(name.replace(/[-‐‑‒–—−/]+/g,' ').replace(/\s+/g,' ').trim())));
}

// Duration and lettering aliases do not create another harmony. Compound
// intervals and an explicitly written bass do: C/C retains its extra bass.
function harmony(cell,qualities){
 const parsed=cell.clipped||/[.…]/.test(cell.symbol)?null:parseChord(cell.symbol,qualities,cell);
 return parsed?{root:parsed.root,intervals:[...new Set(parsed.intervals)].sort((a,b)=>a-b),bass:parsed.slash?parsed.bass:null}:{unknown:cell.symbol};
}
function occurrenceHarmonies(song,source,qualities){
 const identities=new Map();
 for(const row of song.rows)for(const cell of row.chords){
  if(row.startBar+cell.start>=source.endBar-EPS||row.startBar+cell.end<=source.startBar+EPS)continue;
  const identity=harmony(cell,qualities),key=JSON.stringify(identity);
  if(!identities.has(key))identities.set(key,{...identity,symbols:[]});
  const symbols=identities.get(key).symbols;if(!symbols.includes(cell.symbol))symbols.push(cell.symbol);
 }
 return [...identities.values()];
}

/** A display projection only: retain every source harmony, key, join and note.
 * A row continuation belongs to its whole learner-family occurrence, so a
 * single-chord row inside a larger progression is never removed in isolation.
 * On/Off and Off/On families are excluded regardless of harmonic content.
 */
export function removeUnhelpfulBricks(sourceSongs,vocabulary={}){
 const qualities=vocabulary.qualities??vocabulary,index=buildLearnerBrickIndex(buildBrickIndex(sourceSongs));
 const removed=[],positions=new Map(sourceSongs.map(song=>[song,new Map()]));
 let rawOccurrences=0;
 for(const brick of index.bricks)for(const {song,source} of collectBrickOccurrences(brick,sourceSongs)){
  rawOccurrences++;
  const harmonies=occurrenceHarmonies(song,source,qualities),reason=onOffFamily(brick)?'on-off-family':harmonies.length===1?'single-harmony':null;if(!reason)continue;
  const segments=[];
  for(const segment of source.segments){
   const row=song.rows[segment.row];
   row.bricks.forEach((span,brickIndex)=>{
    if(span.name!==segment.label||!same(row.startBar+span.start,segment.startBar)||!same(row.startBar+span.end,segment.endBar))return;
    let rowPositions=positions.get(song).get(segment.row);if(!rowPositions){rowPositions=new Set();positions.get(song).set(segment.row,rowPositions);}
    if(rowPositions.has(brickIndex))return;rowPositions.add(brickIndex);
    segments.push({...segment,brick:brickIndex,start:span.start,end:span.end});
   });
  }
  removed.push({brick:brick.name,slug:brick.slug,...source,segments,harmonies,reason});
 }
 const songs=sourceSongs.map(song=>{
  const rows=song.rows.map((row,ri)=>({...row,bricks:row.bricks.filter((_,bi)=>!positions.get(song).get(ri)?.has(bi))}));
  return {...song,rows,bricks:[...new Set(rows.flatMap(row=>row.bricks.map(b=>b.name)))].sort((a,b)=>a.localeCompare(b))};
 });
 const rawPassages=sourceSongs.reduce((n,song)=>n+song.rows.reduce((m,row)=>m+row.bricks.length,0),0),removedPassages=removed.reduce((n,occurrence)=>n+occurrence.segments.length,0);
 const reasons=Object.fromEntries(['single-harmony','on-off-family'].map(reason=>{const occurrences=removed.filter(o=>o.reason===reason);return [reason,{passages:occurrences.reduce((n,o)=>n+o.segments.length,0),occurrences:occurrences.length}];}));
 return {songs,stats:{rawPassages,removedPassages,keptPassages:rawPassages-removedPassages,rawOccurrences,removedOccurrences:removed.length,keptOccurrences:rawOccurrences-removed.length,reasons},removed};
}

// Retain callers of the first projection API while applying the full policy.
export const removeOneChordBricks=removeUnhelpfulBricks;
