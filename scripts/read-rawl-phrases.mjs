#!/usr/bin/env node
/** Read-only public Rawl phrase evidence; never modifies a source analysis. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),rawl=process.env.RAWL_REPO??'/Users/chipfocus/repos/rawl',cache=process.env.RAWL_PHRASE_CACHE??'/private/tmp/insights-rawl-phrase-docs';
const publicAdminUrl='https://firestore.googleapis.com/v1/projects/rawlrocks/databases/(default)/documents/users/RK31rsh4tDdUGlNYQvakXW4AYbB3';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
function fields(value){
 if(value.mapValue)return Object.fromEntries(Object.entries(value.mapValue.fields??{}).map(([k,v])=>[k,fields(v)]));
 if(value.arrayValue)return(value.arrayValue.values??[]).map(fields);
 for(const key of ['stringValue','bytesValue','booleanValue','doubleValue','timestampValue'])if(key in value)return value[key];
 if('integerValue'in value)return Number(value.integerValue);return null;
}
await fs.mkdir(cache,{recursive:true});
async function publicDocument(url,name){
 const target=path.join(cache,name+'.json');
 try{return await read(target);}catch{}
 await run('curl',['--fail','--silent','--show-error','--max-time','40','--retry','1',url,'-o',target]);return read(target);
}
const adminDoc=await publicDocument(publicAdminUrl,'public-admin'),saved=fields(adminDoc.fields.analyses),defaultPath=path.join(rawl,'src/corpus/analyses.json'),defaultBytes=await fs.readFile(defaultPath),curated=JSON.parse(defaultBytes),analyses={...curated,...saved};
const localRequire=createRequire(path.join(rawl,'package.json'));
localRequire('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',allowJs:true,jsx:'react',moduleResolution:'node',ignoreDeprecations:'5.0'}});
const {getPhraseStarts,filterSnippetsByAccess}=localRequire(path.join(rawl,'src/components/rawl/analysis.ts')),{buildManualMeasuresAndBeats}=localRequire(path.join(rawl,'src/components/rawl/measures.ts')),{normalizeMidiMeasures}=localRequire(path.join(rawl,'src/components/rawl/normalizeMidiMeasures.ts')),MIDIFile=localRequire('midifile'),{parseNotes}=localRequire(path.join(rawl,'src/components/rawl/parseMidi.ts'));
localRequire(path.join(rawl,'src/players/midi-helpers.js'));
const links=await read(path.join(root,'src/music/rawl-links.json')),linkAudit=await read(path.join(root,'evidence/rawl-links-audit.json')),songs=(await read(path.join(root,'dist/data/roadmaps.json'))).songs;
const jobs=Object.entries(links.standards).flatMap(([song,renditions])=>renditions.map(r=>({song:Number(song),...r}))),records=[];let cursor=0;
const log=console.log,warn=console.warn,debug=console.debug;console.log=()=>{};console.warn=()=>{};console.debug=()=>{};
async function worker(){
 while(cursor<jobs.length){const link=jobs[cursor++],key=['f/'+link.slug,'f/'+link.midiId].find(k=>analyses[k]),analysis=key?analyses[key]:null;
  const record={standardIndex:link.song,roadmapTitle:songs[link.song].title,roadmapBars:songs[link.song].bars,title:link.title,url:link.url,midiId:link.midiId,slug:link.slug,analysisKey:key??null,analysisOrigin:key?(key in saved?'live-public-admin':'checked-in-curated'):null,alignment:{status:'unverified',safeToCopy:false,reason:'Composition identity is verified; arrangement, intro, repeats, meter and chart-to-MIDI bar correspondence have not been aligned.'}};
  if(analysis){record.phrasePatch=analysis.phrasePatch??[];record.sections=analysis.sections??[];record.sectionAnchors=analysis.sectionAnchors??{};record.manualMeasures=analysis.measures??null;}
  try{
   const url='https://firestore.googleapis.com/v1/projects/rawlrocks/databases/(default)/documents/midis/'+encodeURIComponent(link.midiId),doc=await publicDocument(url,link.midiId),values=Object.fromEntries(Object.entries(doc.fields??{}).map(([k,v])=>[k,fields(v)])),bytes=Buffer.from(values.blob??'','base64');
   if(bytes.subarray(0,4).toString()!=='MThd')throw Error('No public MIDI payload');
   const prior=linkAudit.records.find(r=>r.midiId===link.midiId),normalized=normalizeMidiMeasures(new Uint8Array(bytes)),midi=new MIDIFile(normalized.buffer.slice(normalized.byteOffset,normalized.byteOffset+normalized.byteLength)),tracks=midi.tracks.map((_,i)=>midi.getTrackEvents(i)),events=midi.getEvents(),ports={},trackByIndex=new Map(tracks.flatMap((es,track)=>es.map(event=>[event.index,track])));
   events.forEach(event=>{const track=event.track??trackByIndex.get(event.index)??0;if(event.type===255&&event.subtype===0x21)ports[track]=event.data[0];else if(event.type===8)event.channel=(ports[track]??0)*16+event.channel;});
   const activeChannels=[...new Set(events.filter(e=>e.type===8&&e.subtype===9&&e.param2>0).map(e=>e.channel))].sort((a,b)=>a-b),parsed=parseNotes({events,activeChannels,timeEvents:midi.getTimeEvents(tracks),timebase:midi.header.datas.getUint16(12)}),notes=parsed.notes.flat(),grid=analysis?.measures?buildManualMeasuresAndBeats(analysis.measures,notes):parsed.measuresAndBeats;
   record.sourceMidi={documentUrl:url,documentUpdateTime:doc.updateTime,sha256:sha(bytes),verifiedLinkSha256:prior?.sha256??null,sameBytesAsVerifiedLink:prior?.sha256===sha(bytes),normalizedSha256:sha(normalized),normalizationChangedBytes:sha(bytes)!==sha(normalized),noteCount:notes.length,measureBoundaryCount:grid.measures.length,bars:grid.measures.length-1,gridBasis:analysis?.measures?'saved manual grid applied with production buildManualMeasuresAndBeats':parsed.displayOptions?'embedded RAWL_DISPLAY grid':'production MIDIFilePlayer/parseNotes meter grid',measureStartsSeconds:grid.measures};
   if(analysis){
    const warnings=[];console.log=(...parts)=>warnings.push(parts.join(' '));let starts;
    try{starts=getPhraseStarts(analysis,grid.measures.length);}finally{console.log=()=>{};}
    record.phraseStartsRaw=starts;record.phrasePatchWarnings=warnings;record.phraseStarts=starts.filter(m=>m>=1&&m<grid.measures.length);record.boundaryOrSentinelMeasures=starts.filter(m=>m>=grid.measures.length);record.phraseStartsSeconds=record.phraseStarts.map(m=>({measure:m,seconds:grid.measures[m-1]}));record.sectionsAtMeasures=record.sections.map(index=>({phraseIndex:index,measure:starts[index]??null}));record.completePhraseSpans=record.phraseStarts.slice(0,-1).map((m,i)=>({startMeasure:m,nextStartMeasure:record.phraseStarts[i+1],bars:record.phraseStarts[i+1]-m}));record.nonFourBarSpans=record.completePhraseSpans.filter(span=>span.bars!==4);
   }
  }catch(error){record.sourceReadError=String(error.message);}
  records.push(record);
 }
}
await Promise.all(Array.from({length:5},worker));console.log=log;console.warn=warn;console.debug=debug;records.sort((a,b)=>a.standardIndex-b.standardIndex||a.midiId.localeCompare(b.midiId));
const topicMap=new Map();
for(const [key,analysis] of Object.entries(analyses))for(const snippet of filterSnippetsByAccess(analysis.snippets??[])){
 if(!snippet.tag?.startsWith('hypermeter:'))continue;
 const items=topicMap.get(snippet.tag)??[];items.push({analysisKey:key,url:key.startsWith('f/')?'https://rawl.rocks/'+key:null,origin:key in saved?'live-public-admin':'checked-in-curated',measuresSpan:snippet.measuresSpan,spanConvention:'one-based and last measure inclusive',phraseStarts:snippet.phraseStarts??null,secondsSpan:snippet.secondsSpan??null,phrasePatch:analysis.phrasePatch??[],sections:analysis.sections??[]});topicMap.set(snippet.tag,items);
}
const topics=[...topicMap].sort(([a],[b])=>a.localeCompare(b)).map(([tag,examples])=>({tag,count:examples.length,examples}));
const references=[['src/components/rawl/analysis.ts',[393,419],'getPhraseStarts cumulative four-bar defaults and shifted boundaries'],['src/components/rawl/analysis.ts',[431,436],'Structures public snippet-access filter'],['src/components/rawl/corpora/Structures.tsx',[714,765],'hypermeter page groups snippets by tag chapter/topic'],['src/components/App.tsx',[427,441],'live saved admin analyses override checked-in versions'],['src/components/rawl/Rawl.tsx',[510,514],'manual saved grids override parsed grids'],['src/components/rawl/blog/blogPosts.tsx',[562,568],'extra final-chord bar creates asymmetry'],['docs/phrase-boundary-model.md',[27,39],'four-bar prior measures duration since preceding boundary, not bar modulo four']];
const evidence={version:1,capturedAt:new Date().toISOString(),scope:{linkedRenditions:jobs.length,linkedStandards:new Set(jobs.map(j=>j.song)).size,recordsWithAnalysis:records.filter(r=>r.analysisKey).length,recordsWithSourceGrid:records.filter(r=>r.sourceMidi).length,recordsWithNonFourBarSpans:records.filter(r=>r.nonFourBarSpans?.length).length,exactRoadmapAlignments:0},sources:{rawlHypermeterUrl:'https://rawl.rocks/s/hypermeter/',webToolResult:'URL inaccessible via web tool; primary local source and unauthenticated public Firestore GET used.',publicAdminDocument:{url:publicAdminUrl,updateTime:adminDoc.updateTime,analysisCount:Object.keys(saved).length},checkedInAnalyses:{path:defaultPath,sha256:sha(defaultBytes),analysisCount:Object.keys(curated).length},mergePolicy:'Checked-in corpus plus same-key public saved-admin replacement, matching Rawl loadPublicAnnotations; no contributor selection or signed-in/private data requested.',references:await Promise.all(references.map(async([p,lines,purpose])=>({path:path.join(rawl,p),lines,purpose,sha256:sha(await fs.readFile(path.join(rawl,p)))})))},semantics:{coordinate:'Reference Rawl measures are one-based. MIDI measure grid contains the terminal boundary. Our roadmap startBar is zero-based. Reference seconds are never copied as quarter-note beats.',default:'getPhraseStarts builds1,5,9,... plus a terminal/sentinel start. Four bars is a phrase duration, not an invariant original measure-number modulo four after an exception.',patch:'Apply phrasePatch in stored order. Each entry finds the current boundary named measure, shifts it and all following boundaries by diff, extends the four-bar tail when needed, and restores initial1 if displaced. Patches are cumulative; they are not independent source-bar offsets.',positiveDiff:'Lengthens the phrase preceding the shifted boundary; later four-bar phases move with it.',negativeDiff:'Shortens the phrase preceding the shifted boundary; later four-bar phases move with it.',sections:'Section values index the resulting phrase-start array; they are not bar numbers.',exceptions:'Source tags distinguish extra-bar prolongations, repeated-measure extensions, fusion/truncation, altered default lengths and uneven spans. Harmonic change or a brick boundary alone is not an exception proof.',incompleteTail:'Complete spans are measured only between two valid starts; final fragment and out-of-score sentinel are separate.'},hypermeterTopics:topics,records};
await fs.writeFile(path.join(root,'evidence/rawl-phrase-sources.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence.scope));console.log(JSON.stringify(topics.map(t=>({tag:t.tag,count:t.count}))));
