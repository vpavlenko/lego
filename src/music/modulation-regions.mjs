import {mod,transposeChord} from '../../dist/harmony.mjs';
import {parseChord} from './realization.mjs';

const EPS=1e-7,ROOTS=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const scales={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10,11],dominant:[0,2,4,5,7,9,10]};
const functions={
 major:{major:{0:8,5:6,7:3,3:2,8:2,10:2},minor:{2:7,4:5,9:6,5:3,0:2,7:2},dominant:{7:8,0:3,2:3,4:3,9:3,11:2,1:4,3:1,5:2,8:2,10:3,6:1},diminished:{11:6,2:3,6:2,1:2,4:1,9:1},halfDiminished:{11:5,2:4,6:2}},
 minor:{major:{3:7,8:6,0:2,5:2,10:3,7:2},minor:{0:8,5:7,7:4,10:1,2:1},dominant:{7:9,10:5,0:4,1:4,2:3,3:2,5:3,8:3,9:2,4:2,11:1,6:1},diminished:{11:8,2:6,6:4,8:2},halfDiminished:{2:8,6:3,11:3,5:1}},
 dominant:{major:{5:6,10:7,0:3},minor:{2:6,9:6,7:5,0:1},dominant:{0:8,7:7,1:4,2:3,4:3,5:3,9:3,10:3},diminished:{4:5,11:3},halfDiminished:{2:4,11:3}},
};
// Reviewed against the surrounding chord sequence and printed brick boundary.
// A title alone is insufficient: timing, normalized harmony, both neighboring
// contexts and immediate chord neighbors must all agree with this source case.
const reviews=[
 {title:'Chelsea Bridge',beats:[63],symbol:'Eb7',before:'Eb',after:'G#m7',previous:3,next:6,direction:'next',rationale:'Eb7 is enharmonically D#7, V/ii of F#; G#m7–C#7–F#M7 supplies its immediate resolution and following cadence.'},
 {title:'Dear Old Stockholm',beats:[32],symbol:'Fm13/G',before:'G7',after:'Eb',previous:0,next:3,direction:'previous',rationale:'The G bass prolongs the preceding G7 dominant pedal in C minor; the relative-major block begins only with Eb after this sustained suspension.'},
 {title:'Dream Dancing',beats:[12],symbol:'Eb7',before:'AM7',after:'Dm7',previous:9,next:0,direction:'next',rationale:'Eb7 descends chromatically to Dm7 as subV/ii, introducing Dm7–G7–CM7 rather than prolonging the completed A-major cadence.'},
 {title:'Georgia',beats:[70],symbol:'F7',before:'Am',after:'Am',previous:9,next:7,direction:'previous',rationale:'Am–E7–Am surrounds this F7; its chromatic bVI7 color returns directly to Am before the later D7 establishes the G-directed phrase.'},
 {title:'It Had to Be You',beats:[80],symbol:'D7',before:'A7',after:'Am7',previous:0,next:5,direction:'previous',rationale:'C–A7–D7 continues the preceding chain of applied dominants; the following Am7–D7–Gm7–C7 phrase starts afresh toward F.'},
 {title:'Lullaby of Birdland',beats:[42],symbol:'C7',before:'Cm',after:'Fm7',previous:0,next:3,direction:'next',rationale:'The change Cm→C7 turns the old tonic into V/ii of Eb; C7 resolves to Fm7 and starts the following extended Fm7–Bb7 cadence block.'},
 {title:'Out of Nowhere',beats:[108],symbol:'Bb7#11',before:'Dm7',after:'Em7',previous:2,next:0,direction:'next',rationale:'Bb7#11 is the borrowed backdoor bVII7 of C, approaching the C-major iii–chromatic diminished–ii–V–I line after the D-minor phrase has closed.'},
 {title:"They Can't Take That Away from Me",beats:[12,44,108],symbol:'G7sus',before:'Dm7',after:'Gm7',previous:2,next:5,direction:'next',rationale:'The preceding A7–Dm7 cadence is complete. G7sus changes to Gm7, then C7–FM7, so the sustained G-root approach belongs with the incoming F phrase.'},
 {title:'Thunderbirds (theme)',beats:[108],symbol:'Ab7',before:'EbM7',after:'G7',previous:3,next:0,direction:'next',rationale:'Ab7 is the chromatic upper dominant/subV/V resolving to G7, whose long dominant pedal then resolves to C; it introduces the C cadence.'},
 {title:'What a Little Moonlight Can Do',beats:[96],symbol:'D7',before:'A7',after:'Dm7/G',previous:0,next:10,direction:'previous',rationale:'Em7–A7–D7 continues the C-centered applied-dominant chain. The following G-bass suspended/diminished pedal returns to C and does not establish Bb for this D7.'},
 {title:'What Am I Here For?',beats:[108],symbol:'Bb7#11',before:'FM7',after:'CM7',previous:5,next:0,direction:'next',rationale:'Bb7#11 resolves directly to CM7 as a backdoor bVII7–I; subsequent C#dim–Dm7–G7 confirms C rather than the preceding F cadence.'},
 {title:'Black narcissus',beats:[66],symbol:'BbM7#11',before:'FM7#11',after:'CM7',previous:3,next:6,direction:'previous',rationale:'BbM7#11 and CM7 close the preceding planed major-seventh block. The distinct new Gb-directed cycle starts at Abm7–Db7, so the two closing sonorities stay together before it.'},
 {title:'Black narcissus',beats:[70],symbol:'CM7',before:'BbM7#11',after:'Abm7',previous:3,next:6,direction:'previous',rationale:'CM7 is the last planed sonority of the preceding block, not part of the new Abm7–Db7 cycle; retain the existing block boundary at Abm7.'},
 {title:'Darn that dream',beats:[11,43,107],symbol:'Fm6',before:'D7/F#',after:'Em7b5',previous:9,next:2,direction:'previous',rationale:'Am–Am/G–D7/F#–Fm6 completes the descending A–G–F#–F bass line. The next Eø7–A7–Dm phrase begins at Eø7; Fm6 closes the chromatic line rather than starting that cadence.'},
 {title:'Emily',beats:[66],symbol:'FM7',before:'C7#5',after:'E7b9',previous:0,next:9,direction:'previous',rationale:'FM7 is the resolution of the preceding C7#5 and IV in C. The A-minor tonicization starts with the following E7b9, so the IV arrival stays with the C phrase.'},
 {title:'Favela',beats:[44,140],symbol:'Em7',before:'Bb7add13',after:'Eb7',previous:5,next:8,direction:'next',rationale:'Em7 is a chromatic upper approach to Eb7, followed immediately by AbM7; attach it to the incoming Eb7–Ab cadence instead of the completed F-minor/Bb7 phrase.'},
 {title:'In a sentimental mood',beats:[28,60,124],symbol:'Dm',before:'A7',after:'Db7',previous:9,next:0,direction:'next',rationale:'Dm–Db7–CM7 is ii–subV–I in C. The preceding A7 acts as V/ii, so begin the incoming C cadence at Dm instead of reading an isolated iv of A minor.'},
 {title:'It never entered my mind',beats:[42],symbol:'EbM7',before:'C/E',after:'Dm7',previous:5,next:0,direction:'next',rationale:'C/E–EbM7–Dm7 makes the descending E–Eb–D bass approach to ii–V–I in C. EbM7 belongs with that borrowed/chromatic C-major cadence.'},
 {title:'Just the way you are',beats:[200,308],symbol:'Ab',before:'Gm/Bb',after:'Bb',previous:0,next:10,direction:'next',rationale:'The C cadence has closed before Gm/Bb. Ab moves up a whole step to Bb, introducing the Bb–Gm7 block as borrowed bVII–I in Bb rather than extending the old C region.'},
 {title:'Leila',beats:[60],symbol:'Em',before:'G7#9',after:'D7b9',previous:8,next:5,direction:'next',rationale:'Em is the chromatic link into D7b9–Gm7–C7–FM7. Neither adjacent key makes Em diatonic, but the following directed dominant chain gives the stronger F-oriented phrase context.'},
 {title:'In a sentimental mood',beats:[124],symbol:'Dm',before:'A7',after:'Db7b9',previous:9,next:0,direction:'next',rationale:'The final phrase retains the same Dm–Db7–CM7 ii–subV–I cadence, with b9 added to Db7; start the C context at Dm.'},
 {title:'Just the way you are',beats:[308],symbol:'Ab',before:'Fm6/C',after:'Bb',previous:0,next:10,direction:'next',rationale:'The final repetition approaches Ab through Fm6/C rather than Gm/Bb, but Ab→Bb still opens the incoming Bb block as borrowed bVII–I.'},
 {title:'Blues For Gary',beats:[12],symbol:'C#m9',before:'CM69',after:'F#7',previous:0,next:10,direction:'previous',rationale:'Enharmonic Dbm9–Gb7 is the chromatic ii–subV approach to F13, the IV of the established C blues. Keep this approach in C rather than treating it as a new Bb-key phrase.'},
 {title:'Emily',beats:[66],symbol:'FM7',before:'Caug',after:'E7b9',previous:0,next:9,direction:'previous',rationale:'This source uses Caug instead of C7#5; its resolution to FM7 still completes the C-centered IV arrival before E7b9 starts the A-minor tonicization.'},
 {title:'I Should Care',beats:[111,239],symbol:'Ebm9',before:'D13',after:'Dm7',previous:9,next:0,direction:'next',rationale:'Ebm9 is a chromatic upper-neighbor side-slip into Dm7–G7–C; attach this approach chord to the incoming C-major ii–V–I rather than the completed A-minor line.'},
];
const compositionKey=title=>String(title).normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
function reviewFor(song,region,left,right,cells){
 if(!right)return null;
 const before=[...cells].reverse().find(c=>c.start<region.start-EPS),after=cells.find(c=>c.end>region.end+EPS);
 return reviews.find(review=>compositionKey(review.title)===compositionKey(song.title)&&review.beats.some(beat=>Math.abs(beat-region.start)<EPS)&&region.unique[0].symbol===review.symbol&&before?.symbol===review.before&&after?.symbol===review.after&&left.tonic===review.previous&&right.tonic===review.next)??null;
}
function core(parsed){
 if(!parsed)return 'unknown';const tones=new Set(parsed.intervals.map(mod));
 if(tones.has(3)&&tones.has(6)&&!tones.has(7))return tones.has(10)?'halfDiminished':'diminished';
 if(tones.has(4)&&tones.has(10))return 'dominant';
 if(tones.has(3)&&!tones.has(4))return 'minor';
 if(tones.has(4))return 'major';
 if(tones.has(5))return 'suspended';
 return 'unknown';
}
function cellsFor(song,qualities){
 const barBeats=song.meter[0]*4/song.meter[1];
 return song.rows.flatMap((row,ri)=>row.chords.map((cell,ci)=>{
  const symbol=transposeChord(cell.symbol,song.tonic[0]),parsed=cell.clipped||/[.…]/.test(symbol)?null:parseChord(symbol,qualities,cell);
  const identity=parsed?{root:parsed.root,intervals:[...new Set(parsed.intervals)].sort((a,b)=>a-b),bass:parsed.slash?parsed.bass:null}:{unknown:cell.symbol};
  return {row:ri,cell:ci,start:(row.startBar+cell.start)*barBeats,end:(row.startBar+cell.end)*barBeats,symbol,sourceSymbol:cell.symbol,parsed,core:core(parsed),identity,key:JSON.stringify(identity)};
 })).sort((a,b)=>a.start-b.start||a.end-b.end);
}
function inRegion(cells,start,end){return cells.filter(c=>c.start<end-EPS&&c.end>start+EPS);}
function describeRegion(event,end,cells){
 const chords=inRegion(cells,event.beat,end),unique=[...new Map(chords.map(c=>[c.key,c])).values()];
 return {start:event.beat,end,event,chords,unique,tonic:event.tonic};
}
function modeName(mode){const text=String(mode??'').toLowerCase();return text.startsWith('min')?'minor':text.startsWith('dom')?'dominant':text.startsWith('maj')?'major':null;}
function functionalFit(chord,tonic,mode){
 if(!chord?.parsed)return 0;
 const degree=mod(chord.parsed.root-tonic),quality=chord.core;
 let result=functions[mode]?.[quality]?.[degree]??(quality==='suspended'?[0,2,5,7].includes(degree)?3:0:-1);
 const scale=scales[mode],third=quality==='minor'||quality==='diminished'||quality==='halfDiminished'?3:quality==='suspended'?5:4;
 for(const interval of [0,third])result+=scale.includes(mod(degree+interval))?.25:-.25;
 if(chord.parsed.slash)result+=scale.includes(mod(chord.parsed.bass-tonic))?.25:-.25;
 return result;
}
function ownerFor(region,homeMode){
 const declared=modeName(region.event.mode);
 const ranked=['major','minor','dominant'].map(mode=>({mode,score:region.unique.reduce((n,c)=>n+functionalFit(c,region.tonic,mode),0)})).sort((a,b)=>b.score-a.score||Number(b.mode===homeMode)-Number(a.mode===homeMode));
 return {tonic:region.tonic,root:region.event.root??ROOTS[region.tonic],mode:declared??ranked[0].mode,modeBasis:declared?'source':'context-fit',region,event:region.event};
}
function candidateScore(region,owner,cells,direction,initial){
 const chord=region.unique[0],tonic=owner.tonic,fit=functionalFit(chord,tonic,owner.mode),components=[{rule:'root-quality-function',score:fit}];
 const before=[...cells].reverse().find(c=>c.start<region.start-EPS),after=cells.find(c=>c.end>region.end+EPS),next=after&&cells.find(c=>c.start>=after.end-EPS&&c.key!==after.key);
 let cadence=0;
 if(chord.parsed){
  const degree=mod(chord.parsed.root-tonic),afterDegree=after?.parsed?mod(after.parsed.root-tonic):null,beforeDegree=before?.parsed?mod(before.parsed.root-tonic):null;
  if(chord.core==='dominant'&&afterDegree===0&&['major','minor'].includes(after.core)&&[7,1].includes(degree))cadence+=degree===7?5:4;
  if(['diminished','halfDiminished'].includes(chord.core)&&degree===11&&afterDegree===0)cadence+=4;
  if(['minor','halfDiminished'].includes(chord.core)&&degree===2&&afterDegree===7&&after?.core==='dominant'&&next?.parsed&&next.parsed.root===tonic)cadence+=3;
  if(degree===0&&['major','minor'].includes(chord.core)&&before?.core==='dominant'&&[7,1].includes(beforeDegree))cadence+=4;
 }
 components.push({rule:'cadential-context',score:cadence});
 const continuity=owner.region?.unique.some(c=>c.key===chord.key)?2:0;components.push({rule:'shared-harmony-context',score:continuity});
 const prior=initial&&owner.tonic===0?1.5:direction==='previous'?.05:0;components.push({rule:initial&&owner.tonic===0?'home-C-prior':'continuity-tie-prior',score:prior});
 return {direction,tonic,root:owner.root,mode:owner.mode,modeBasis:owner.modeBasis,musicalScore:fit+cadence+continuity,score:fit+cadence+continuity+prior,components};
}
function visualEvent(region,owner){
 const event={...owner.event,beat:region.start,tonic:owner.tonic,root:owner.root};
 // Extending a following key backwards creates an analytical boundary. Do not
 // relabel an earlier source join with the following join's grammatical name.
 if(event.beat!==owner.event.beat){event.sourceBeat=owner.event.beat;delete event.join;delete event.name;delete event.from;delete event.sourceDelta;}
 return event;
}

/** Simplify the displayed tonal map without touching any source or performance
 * note. A tonic at the beginning of the piece is home context, not a modulation.
 * Singleton runs are assigned together to the flanking established contexts,
 * with one previous→next cut; this avoids greedy merging and new tonal islands.
 */
export function cleanModulationRegions(song,sourceChanges,vocabulary={}){
 const qualities=vocabulary.qualities??vocabulary,cells=cellsFor(song,qualities),beats=song.bars*song.meter[0]*4/song.meter[1],homeMode=modeName(song.tonic[1])??'major';
 const sorted=sourceChanges.filter(c=>Number.isFinite(c.beat)&&c.beat>=0&&c.beat<beats-EPS).map(c=>({...c})).sort((a,b)=>a.beat-b.beat),onsets=[];
 for(const change of sorted){if(onsets.at(-1)?.beat===change.beat)onsets[onsets.length-1]=change;else onsets.push(change);}
 if(!onsets.length||onsets[0].beat>0)onsets.unshift({beat:0,tonic:0,root:'C',mode:song.tonic[1]});
 const events=onsets.filter((event,i)=>!i||event.tonic!==onsets[i-1].tonic),regions=events.map((event,i)=>describeRegion(event,events[i+1]?.beat??beats,cells)),owners=regions.map(region=>ownerFor(region,homeMode)),assignments=[...owners],decisions=[];
 const home=regions[0]?.tonic===0,eligible=(region,i)=>region.unique.length===1&&!(i===0&&home);
 if(home&&regions[0].unique.length===1)decisions.push({song:song.index,title:song.title,start:0,end:regions[0].end,sourceTonic:0,tonic:0,direction:'home',reason:'initial-home-context',harmonies:regions[0].unique.map(c=>c.identity),symbols:[...new Set(regions[0].chords.map(c=>c.symbol))],candidates:[]});
 for(let first=0;first<regions.length;){
  if(!eligible(regions[first],first)){first++;continue;}
  let end=first+1;while(end<regions.length&&eligible(regions[end],end))end++;
  const left=first?owners[first-1]:{tonic:0,root:'C',mode:homeMode,modeBasis:'home',event:{beat:0,tonic:0,root:'C',mode:song.tonic[1]}},right=owners[end],run=regions.slice(first,end);
  const reviewed=run.map(region=>reviewFor(song,region,left,right,cells));
  const scores=run.map(region=>({previous:candidateScore(region,left,cells,'previous',first===0),next:right?candidateScore(region,right,cells,'next',first===0):null}));
  const cuts=Array.from({length:run.length+1},(_,cut)=>({cut,score:scores.reduce((n,s,i)=>n+(i<cut?s.previous.score:s.next?.score??-Infinity),0),musicalScore:scores.reduce((n,s,i)=>n+(i<cut?s.previous.musicalScore:s.next?.musicalScore??-Infinity),0)})).sort((a,b)=>b.score-a.score||b.cut-a.cut);
  const compatible=cuts.filter(({cut})=>reviewed.every((review,offset)=>!review||review.direction===(offset<cut?'previous':'next'))),chosen=compatible[0]??cuts[0],alternatives=cuts.filter(c=>c.cut!==chosen.cut),margin=chosen.score-(alternatives[0]?.score??-Infinity),musicalMargin=chosen.musicalScore-Math.max(...alternatives.map(c=>c.musicalScore)),ambiguous=!!right&&left.tonic!==right.tonic&&musicalMargin<=.5+EPS;
  for(let offset=0;offset<run.length;offset++){
   const direction=offset<chosen.cut?'previous':'next',owner=direction==='previous'?left:right,region=run[offset];assignments[first+offset]=owner;
   const review=compatible.length?reviewed[offset]:null;
   decisions.push({song:song.index,title:song.title,start:region.start,end:region.end,sourceTonic:region.tonic,tonic:owner.tonic,root:owner.root,direction,reason:review?'reviewed-phrase-context':!right?'terminal-context':left.tonic===right.tonic?'same-neighboring-tonic':musicalMargin<=EPS?'continuity-tie':ambiguous?'close-context-fit':'harmonic-context-fit',ambiguous,...(review?{review:{rationale:review.rationale,overridesAutomatic:direction!==(offset<cuts[0].cut?'previous':'next'),match:{title:review.title,beat:region.start,symbol:review.symbol,before:review.before,after:review.after,previous:review.previous,next:review.next}}}:{}),harmonies:region.unique.map(c=>c.identity),symbols:[...new Set(region.chords.map(c=>c.symbol))],sourceSymbols:[...new Set(region.chords.map(c=>c.sourceSymbol))],run:{start:run[0].start,end:run.at(-1).end,cut:chosen.cut,automaticCut:cuts[0].cut,score:chosen.score,margin:Number.isFinite(margin)?margin:null,musicalMargin:Number.isFinite(musicalMargin)?musicalMargin:null},candidates:[scores[offset].previous,...(scores[offset].next?[scores[offset].next]:[])]});
  }
  first=end;
 }
 const changes=[];
 for(let i=0;i<regions.length;i++)if(!i||assignments[i].tonic!==assignments[i-1].tonic)changes.push(visualEvent(regions[i],assignments[i]));
 const outputRegions=changes.map((event,i)=>describeRegion(event,changes[i+1]?.beat??beats,cells)),remaining=outputRegions.filter((r,i)=>i>0&&r.unique.length===1);
 return {changes,decisions,stats:{sourceRegions:sourceChanges.length,colorRegions:regions.length,sameTonicBoundaries:onsets.length-events.length,oneHarmonyRegions:regions.filter(r=>r.unique.length===1).length,homeSingletonRegions:home&&regions[0].unique.length===1?1:0,mergedOneHarmonyRegions:decisions.filter(d=>d.direction!=='home').length,outputRegions:changes.length,remainingOneHarmonyModulations:remaining.length}};
}

const dmToAm=['Dm7','Dm7/C','Bm7b5','E7','Am7'];
const displayOnsetReviews=[
 {song:28,title:'Body and Soul',page:19,beats:[18,50,114],from:0,to:9,symbols:dmToAm},
 {song:45,title:'The Days of Wine and Roses',page:31,beats:[102],from:0,to:4,symbols:['Am7','Am7/G','F#m7b5','B7','Em7']},
 {song:110,title:'It Might As Well Be Spring',page:71,beats:[82],from:5,to:9,symbols:dmToAm},
 {song:147,title:'My Romance',page:93,beats:[102],from:2,to:9,symbols:dmToAm},
 {song:149,title:'Nancy with the Laughing Face',page:94,beats:[50,114],from:0,to:9,symbols:dmToAm},
 {song:231,title:'Whisper Not',page:141,beats:[2,34,98],from:10,to:5,symbols:['Bbm7','Bbm7/Ab','Gm7b5','C7','Fm7']},
];

// Reviewed offsets apply only to the public tonal map. The printed key
// changes and stored performances keep the source timing.
export function reviewDisplayModulationOnsets(song,sourceChanges,projection,vocabulary={}){
 const review=displayOnsetReviews.find(entry=>entry.song===song.index);
 if(!review)return projection;
 const mismatch=beat=>new Error(`Reviewed modulation context changed in ${song.title} at beat ${beat}`);
 if(song.title!==review.title||song.page!==review.page)throw mismatch(review.beats[0]);
 const cells=cellsFor(song,vocabulary.qualities??vocabulary);
 const barBeats=song.meter[0]*4/song.meter[1];
 const changes=[...projection.changes],onsetReviews=[];
 for(const leadInBeat of review.beats){
  const earlier=cells.findIndex(cell=>Math.abs(cell.start-leadInBeat)<EPS);
  const cadence=cells[earlier+1];
  const index=changes.findIndex(event=>event.beat===leadInBeat||(event.beat===0&&event.sourceBeat===leadInBeat));
  const event=changes[index];
  const sourceBeat=event?.sourceBeat??event?.beat;
  const original=sourceChanges.find(change=>change.beat===sourceBeat);
  const previous=event?.beat===0?sourceChanges.find(change=>change.beat===0):changes[index-1];
  if(earlier<1||!cadence||!event||event.join||event.tonic!==review.to||original?.tonic!==review.to||(original.join&&sourceBeat!==cadence.start)||
     cadence.start<=leadInBeat||
     previous?.tonic!==review.from||cadence.start>=(changes[index+1]?.beat??Infinity)||
     Math.abs(cadence.start/barBeats-Math.round(cadence.start/barBeats))>EPS||
     !review.symbols.every((symbol,i)=>cells[earlier-1+i]?.symbol===symbol))throw mismatch(leadInBeat);
  const moved={...event,beat:cadence.start,sourceBeat};
  if(event.beat===0)changes.splice(index,1,previous,moved);
  else changes[index]=moved;
  onsetReviews.push({sourceBeat,previousDisplayBeat:event.beat,beat:cadence.start,tonic:review.to,page:review.page,symbols:review.symbols});
 }
 const beats=song.bars*barBeats;
 const remainingOneHarmonyModulations=changes.filter((event,i)=>
  i>0&&describeRegion(event,changes[i+1]?.beat??beats,cells).unique.length===1).length;
 if(remainingOneHarmonyModulations)throw new Error('Reviewed modulation creates a one-chord region in '+song.title);
 return {...projection,changes,onsetReviews,stats:{...projection.stats,outputRegions:changes.length,remainingOneHarmonyModulations}};
}
