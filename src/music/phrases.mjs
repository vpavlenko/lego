const EPS=1e-7;
const same=(a,b)=>Math.abs(a-b)<EPS;
const clean=n=>Math.round(n*1e9)/1e9;
function rangeStarts(startBar,endBar,barBeats){
 const starts=[];for(let bar=startBar;bar<endBar-EPS;bar+=4)starts.push(clean(bar*barBeats));return starts;
}
function reviewedSections(song,form){
 if(form?.basis!=='source-audit'||!form.sections?.length)return null;
 let cursor=0;for(const section of form.sections){if(!same(section.start,cursor)||!(section.end>section.start))return null;cursor=section.end;}
 if(!same(cursor,song.bars)||form.sections.every(section=>same((section.end-section.start)/4,Math.round((section.end-section.start)/4))))return null;
 return form.sections;
}
function explicitEvidence(evidence,song,barBeats,end){
 if(!evidence)return null;
 if(!Array.isArray(evidence.starts)&&Array.isArray(evidence.references)){
  if(!evidence.references.length)return null;
  return {rejected:{kind:'rendition-references',reason:'reference-only-no-chart-alignment',references:evidence.references.map(reference=>({standardIndex:reference.standardIndex,midiId:reference.midiId,analysisKey:reference.analysisKey,alignment:reference.alignment}))}};
 }
 let reason=null;
 if(evidence.verified!==true||evidence.arrangementMatch!=='exact')reason='not-chart-aligned';
 else if(evidence.timeUnit!=='quarter-note')reason='ambiguous-time-unit';
 else if(!same(evidence.bars,song.bars)||!Array.isArray(evidence.meter)||evidence.meter.length!==2||evidence.meter.some((n,i)=>n!==song.meter[i]))reason='different-measure-map';
 else if(!evidence.source||typeof evidence.source!=='object'||!Object.keys(evidence.source).length)reason='missing-source-provenance';
 else if(!Array.isArray(evidence.starts)||!evidence.starts.length||!same(evidence.starts[0],0)||evidence.starts.some((beat,i)=>!Number.isFinite(beat)||beat<-EPS||beat>end+EPS||i>0&&beat<=evidence.starts[i-1]+EPS))reason='invalid-phrase-starts';
 if(reason)return {rejected:{kind:'source-evidence-rejected',reason,source:evidence.source??null}};
 const starts=evidence.starts.filter(beat=>beat<end-EPS).map(clean),closesAtEnd=evidence.closesAtEnd===true||evidence.starts.some(beat=>same(beat,end)),source={...evidence.source},exceptions=[];
 for(let i=0;i<starts.length;i++){
  const from=starts[i],to=starts[i+1]??end,bars=(to-from)/barBeats;
  if(!same(bars,4))exceptions.push({kind:'verified-source-phrase',start:from,end:to,bars:clean(bars),source});
 }
 return {starts,end,closesAtEnd,basis:'verified-source',exceptions,uncertainty:[],source};
}

/** Absolute quarter-note phrase starts; terminal closure is a separate flag.
 * Four bars are Rawl's default, not an inference from chords/modulations/bricks.
 * An external override requires an independently verified identical arrangement:
 * {starts,timeUnit:'quarter-note',verified:true,arrangementMatch:'exact',bars,
 *  meter,source:{url|path,...},closesAtEnd?}. Unaligned renditions are references.
 */
export function phraseGrid(song,form,sourceEvidence){
 const barBeats=song.meter?.[0]*4/song.meter?.[1],end=clean(song.bars*barBeats);
 if(!(song.bars>0)||!Number.isFinite(song.bars)||!(barBeats>0)||!Number.isFinite(barBeats))throw Error('Invalid phrase measure map');
 if(song.measureMap){
  const full=song.measureMap.filter(m=>Number(m.sourceNumber)>0),starts=full.filter((m,i)=>i%4===0).map(m=>m.start),tail=full.at(-1),closesAtEnd=full.length%4===0&&same(tail.duration,barBeats);
  return {starts,end,closesAtEnd,basis:'four-bar-default-source-measures',exceptions:song.measureMap.filter(m=>!same(m.duration,barBeats)).map(m=>({kind:Number(m.sourceNumber)===0?'source-pickup':m.meter&&same(m.duration,m.meter[0]*4/m.meter[1])?'source-meter':'source-tail',start:m.start,end:m.start+m.duration,bars:m.duration/barBeats,source:song.source})),uncertainty:[]};
 }
 const evidence=explicitEvidence(sourceEvidence,song,barBeats,end);if(evidence&&!evidence.rejected)return evidence;
 const uncertainty=evidence?.rejected?[evidence.rejected]:[],sections=reviewedSections(song,form);
 if(sections){
  const starts=sections.flatMap(section=>rangeStarts(section.start,section.end,barBeats)),exceptions=[];
  for(let i=0;i<sections.length;i++){
   const section=sections[i],length=section.end-section.start,remainder=length%4;if(same(remainder,0))continue;
   const pattern=[];for(let remaining=length;remaining>EPS;remaining-=4)pattern.push(clean(Math.min(4,remaining)));
   exceptions.push({kind:'source-audited-section-extension',section:i,label:section.label,start:clean(section.start*barBeats),end:clean(section.end*barBeats),startBar:section.start,endBar:section.end,phraseBars:pattern,basis:form.basis,source:song.leadsheet??song.source??null});
  }
  return {starts,end,closesAtEnd:true,basis:'source-audited-sections',exceptions,uncertainty};
 }
 const starts=rangeStarts(0,song.bars,barBeats),closesAtEnd=same(song.bars/4,Math.round(song.bars/4));
 if(!closesAtEnd)uncertainty.push({kind:'unproven-final-remainder',start:starts.at(-1),end,bars:clean((end-starts.at(-1))/barBeats),reason:'Chart ending alone does not prove an irregular phrase'});
 return {starts,end,closesAtEnd,basis:'four-bar-default',exceptions:[],uncertainty};
}
