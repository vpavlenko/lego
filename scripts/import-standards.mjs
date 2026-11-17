import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseBrickDictionary,createBrickParser,discoverRepeatedPatterns} from '../src/music/brick-parser.mjs';
import {parseChord} from '../src/music/realization.mjs';
import {brickIdentity} from '../src/music/bricks.mjs';
import {sourceMeasureMap} from '../src/music/measure-map.mjs';
import {mod,pitch} from '../dist/harmony.mjs';

const project=fileURLToPath(new URL('../',import.meta.url)),EPS=1e-7;
const roots=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const normalized=text=>String(text??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/^the\s+/,'').replace(/[^a-z0-9]/g,'');
function compositionKey(title){return normalized(String(title).replace(/(?:\s*[-–]\s*|\s*\()([A-G][#b]?)(?:\s+(?:major|minor))?\)?\s*$/,''));}
function originalKeys(songs){const keys=new Map();const add=(key,index)=>{if(!key)return;const indices=keys.get(key)??new Set();indices.add(index);keys.set(key,indices);};for(const song of songs){const index=song.arrangementOf??song.index;add(compositionKey(song.title),index);add(compositionKey(song.title.split('(')[0]),index);if(song.leadsheet){const file=decodeURIComponent(song.leadsheet.split('/').at(-1)).replace(/\.ls$/,'');add(normalized(file),index);}}return keys;}
function sourceInfo(entry){
 const p=entry.provenance??{},collection=p.collection??(p.format==='LilyPond'?'OpenBook':p.format==='Impro-Visor leadsheet'?'Impro-Visor':'RealBook'),url=p.url??p.sourceUrl??p.repositoryUrl??p.repository??null,rawUrl=p.rawUrl??p.downloadUrl??null;
 return {title:entry.title,format:p.format??'MusicXML',collection,version:p.sourceVersion===collection?undefined:p.sourceVersion??p.partTitle,url,...(rawUrl?{rawUrl}:{}),...(p.path?{path:p.path}:{}),...(p.sha256?{sha256:p.sha256}:{})};
}
function cleanChords(entry,qualities){
 const beats=entry.totalBeats??entry.bars*entry.barBeats,raw=[...entry.chords].sort((a,b)=>a.start-b.start||a.end-b.end),chords=[],unsupported=[],noHarmony=[];let cursor=0;
 for(let i=0;i<raw.length;i++){
  const cell=raw[i];if(!Number.isFinite(cell.start)||!Number.isFinite(cell.end)||cell.end<=cell.start||cell.start<cursor-EPS||cell.end>beats+EPS)throw Error('invalid-chord-timeline');
  if(cell.start>cursor+EPS)chords.push({symbol:'NC',start:cursor/entry.barBeats,end:cell.start/entry.barBeats,clipped:true,sourceGap:true});
  const parsed=parseChord(cell.symbol,qualities,cell),silent=/^(?:NC|N\.C\.)$/i.test(cell.symbol),clipped=!!cell.clipped||!parsed;
  if(silent)noHarmony.push({symbol:cell.symbol,start:cell.start,end:cell.end,sourceIndex:i});
  else if(clipped)unsupported.push({symbol:cell.symbol,start:cell.start,end:cell.end,sourceIndex:i});
  chords.push({...cell,start:cell.start/entry.barBeats,end:cell.end/entry.barBeats,sourceIndex:i,...(clipped?{clipped:true}:{}),...(silent?{noHarmony:true}:{})});cursor=cell.end;
 }
 if(cursor<beats-EPS)chords.push({symbol:'NC',start:cursor/entry.barBeats,end:beats/entry.barBeats,clipped:true,sourceGap:true});
 return {chords,unsupported,noHarmony};
}
function rowsFor(song,segments){
 const regions=[{start:0,root:song.tonic[0],mode:song.tonic[1],basis:'source-reference'}],joins=[];
 for(const segment of segments.filter(s=>s.kind==='known'||s.kind==='discovered')){
  const root=roots[segment.tonic],mode=segment.mode||song.tonic[1],previous=regions.at(-1),basis=segment.kind==='discovered'?'first-chord-reference':'dictionary-parser';
  if(segment.start===0)regions[0]={start:0,root,mode,basis};
  else{
   const delta=mod(pitch(root)-pitch(previous.root));joins.push({at:segment.start,from:previous.root,to:root,delta:delta>6?delta-12:delta,name:'Modulation',basis});
   if(previous.root!==root||previous.mode!==mode)regions.push({start:segment.start,root,mode,basis});
  }
 }
 regions.forEach((region,i)=>{region.end=regions[i+1]?.start??song.bars;});
 const edges=song.measureMap?[0,...song.measureMap.filter((m,i)=>i>0&&(i-(song.pickupBeats>0?1:0))%song.columns===0).map(m=>m.start/(song.meter[0]*4/song.meter[1])),song.bars]:Array.from({length:Math.ceil(song.bars/song.columns)+1},(_,i)=>Math.min(song.bars,i*song.columns));
 const rows=[];for(let ri=0;ri<edges.length-1;ri++){const startBar=edges[ri],end=edges[ri+1],slice=items=>items.filter(c=>c.start<end-EPS&&c.end>startBar+EPS).map(c=>({...c,start:Math.max(c.start,startBar)-startBar,end:Math.min(c.end,end)-startBar}));
  const bricks=segments.filter(s=>s.kind==='known'||s.kind==='discovered').map(s=>({start:s.start,end:s.end,name:s.name,analysisId:s.analysisId,basis:s.kind==='known'?'dictionary-parser':'repeated-source-pattern',...(s.definition?{definition:s.definition}:{}),...(s.patternId?{patternId:s.patternId}:{})}));
  rows.push({startBar,bars:end-startBar,keys:slice(regions),bricks:slice(bricks),chords:slice(song._chords),joins:joins.filter(j=>j.at>=startBar-EPS&&j.at<end-EPS).map(j=>({...j,at:j.at-startBar}))});
 }
 return rows;
}

/** Append-only source arrangements. Explicit compiler measure maps preserve
 * pickup/tail durations; parser coordinates remain continuous meter units. */
export function prepareAdditionalStandards(entries,{originalSongs,priorSongs=[],dictionary,qualities,minimumSupport=3,includeArrangements=true,existingMatches=[]}={}){
 const originals=originalKeys([...originalSongs,...priorSongs]),seen=new Map(),sourceIds=new Set(priorSongs.map(song=>song.melodyId)),matchedIds=new Set(existingMatches.map(m=>m.melodyId)),rejected=[],prepared=[],parser=createBrickParser(dictionary,{qualities}),startIndex=Math.max(241,...originalSongs.map(s=>s.index),...priorSongs.map(s=>s.index))+1;
 const candidates=[...entries].sort((a,b)=>compositionKey(a.title).localeCompare(compositionKey(b.title))||String(a.id).localeCompare(String(b.id)));
 for(const entry of candidates){
  const key=compositionKey(entry.title),reject=reason=>rejected.push({id:entry.id,title:entry.title,reason});
  const titleMetadata=entry.provenance?.titleMetadata,identityKeys=[key,entry.normalizedTitle,...(entry.compositionTitle?[compositionKey(entry.compositionTitle)]:[])];
  // A printed typo may coexist with agreeing work/file metadata. Both must
  // agree before they can provide an original-composition lookup alias;
  // stale copied work titles alone never determine composition identity.
  if(titleMetadata?.workTitle&&compositionKey(titleMetadata.workTitle)===compositionKey(titleMetadata.filenameTitle))identityKeys.push(compositionKey(titleMetadata.workTitle));
  const originalIndices=new Set(identityKeys.flatMap(k=>[...(originals.get(k)??[])])),originalIndex=originalIndices.size===1?[...originalIndices][0]:null;
  if(originalIndices.size>1){reject('ambiguous-composition-identity');continue;}
  const identity=originalIndex===null?key:'original-'+originalIndex;
  if(matchedIds.has(entry.id)){reject('already-attached-exact-arrangement');continue;}
  if(sourceIds.has(entry.id)){reject('duplicate-source-arrangement');continue;}
  if(!includeArrangements&&originalIndex!==null){reject('existing-composition');continue;}
  if(!includeArrangements&&seen.has(identity)){reject('alternate-arrangement');continue;}
  const sourcePath=entry.provenance?.path;
  const printedIdentity=['printed title credit','source attributes.title'].includes(titleMetadata?.selectedFrom)&&compositionKey(titleMetadata.printedTitle)===key;
  const verifiedHead=entry.provenance?.format==='Impro-Visor leadsheet'&&/^Explicit source melody-part title beginning Head/.test(entry.provenance?.headEvidence??'');
  if(sourcePath&&compositionKey(path.basename(sourcePath).replace(/\.(?:musicxml|xml|mxl|ly\.tera|ly|ls)$/i,''))!==key&&!printedIdentity&&!verifiedHead){reject('source-title-conflict');continue;}
  if(!entry.meter||entry.meter.length!==2||!Number.isFinite(entry.barBeats)||entry.barBeats<=0||!Number.isInteger(entry.bars)||entry.bars<=0||!Array.isArray(entry.chords)||!entry.chords.length){reject('unsupported-measure-map');continue;}
  const total=entry.totalBeats??entry.bars*entry.barBeats;
  let measureMap;try{measureMap=sourceMeasureMap(entry);}catch(error){reject(error.message);continue;}
  if(!measureMap&&Math.abs(total-entry.bars*entry.barBeats)>EPS){reject('nonuniform-measures');continue;}
  if(!entry.tonic||!Number.isFinite(pitch(entry.tonic[0]))||!['Major','Minor'].includes(entry.tonic[1])){reject('missing-tonic-reference');continue;}
  if(!entry.notes?.length||entry.notes.some(n=>!Number.isFinite(n.pitch)||n.pitch<0||n.pitch>127||!Number.isFinite(n.start)||!(n.duration>0)||n.start<-EPS||n.start+n.duration>total+EPS)){reject('invalid-melody-timeline');continue;}
  try{
   const {chords,unsupported,noHarmony}=cleanChords(entry,qualities),index=startIndex+prepared.length,result=parser.parse(chords);
   const arrangementOf=originalIndex??seen.get(identity)??null;
   prepared.push({index,title:entry.title,normalizedTitle:key,compositionKey:identity,composer:entry.composer??'',tonic:[...entry.tonic],meter:[...entry.meter],bars:measureMap?total/entry.barBeats:entry.bars,columns:Math.min(8,entry.bars),...(measureMap?{measureMap,pickupBeats:entry.pickupBeats,totalBeats:total,sourceMeasureCount:entry.bars,...(Number.isInteger(entry.sourceFullMeasureCount)?{sourceFullMeasureCount:entry.sourceFullMeasureCount}:{})}:{}),page:null,image:null,melodyId:entry.id,...(entry.provenance?.format==='LilyPond'||entry.provenance?.sourceTimelineExact?{sourceTimeline:'compiled-quarter-beats'}:{}),...(entry.midiPPQ?{midiPPQ:entry.midiPPQ}:{}),...(arrangementOf===null?{}:{arrangementOf}),source:sourceInfo(entry),provenance:{...entry.provenance,analysisBasis:'conservative-dictionary-parser',melodyArrangement:'same-source'},encodedChanges:entry.chords.map(c=>({...c})),_chords:chords,_parse:result,_unsupported:unsupported,_noHarmony:noHarmony});if(!seen.has(identity))seen.set(identity,index);sourceIds.add(entry.id);
  }catch(error){reject(error.message);}
 }
 const discoveryInput=prepared.map(s=>({index:s.index,title:s.title,normalizedTitle:s.compositionKey,chords:s._chords,parse:s._parse})),patterns=discoverRepeatedPatterns(discoveryInput,{qualities,minimumStandards:minimumSupport});
 const bySong=new Map();for(const pattern of patterns)for(const match of pattern.matches){const list=bySong.get(match.song)??[];list.push({...match,name:pattern.name,patternId:pattern.id});bySong.set(match.song,list);}
 const audits=[];
 const songs=prepared.map(song=>{
  const discoveries=bySong.get(song.index)??[],replaced=new Set(discoveries.flatMap(m=>Array.from({length:m.endIndex-m.startIndex},(_,i)=>m.startIndex+i)));
  const retained=song._parse.segments.filter(s=>!Array.from({length:s.endIndex-s.startIndex},(_,i)=>s.startIndex+i).some(i=>replaced.has(i)));
  const segments=[...retained,...discoveries.map(m=>{const first=parseChord(song._chords[m.startIndex].symbol,qualities,song._chords[m.startIndex]);return{kind:'discovered',...m,tonic:m.reference,mode:first?.intervals.includes(3)&&!first.intervals.includes(4)?'Minor':'Major'};})].sort((a,b)=>a.start-b.start);
  segments.forEach((s,i)=>{s.analysisId=song.index+'-'+i;});
  const covered=segments.flatMap(s=>Array.from({length:s.endIndex-s.startIndex},(_,i)=>s.startIndex+i));if(covered.length!==song._chords.length||new Set(covered).size!==song._chords.length)throw Error('Analysis coverage failure for '+song.title);
  const rows=rowsFor(song,segments),visible=segments.filter(s=>s.kind==='known'||s.kind==='discovered'),meaningful=segments.filter(s=>s.kind==='known'&&!(s.type==='On'&&s.endIndex-s.startIndex===1));
  audits.push({song:song.index,title:song.title,melodyId:song.melodyId,compositionKey:song.compositionKey,...(song.arrangementOf===undefined?{}:{arrangementOf:song.arrangementOf}),source:song.source,bars:song.bars,chordEvents:song._chords.length,unsupported:song._unsupported,noHarmony:song._noHarmony,knownSegments:visible.filter(s=>s.kind==='known').length,discoveredSegments:discoveries.length,knownCoveredBars:visible.filter(s=>s.kind==='known').reduce((n,s)=>n+s.end-s.start,0),meaningfulKnownCoveredBars:meaningful.reduce((n,s)=>n+s.end-s.start,0),unparsedBars:segments.filter(s=>s.kind==='unparsed').reduce((n,s)=>n+s.end-s.start,0),diagnostics:song._parse.diagnostics,segments:segments.map(({next,cost,...s})=>s)});
  const {_chords,_parse,_unsupported,_noHarmony,...out}=song;return{...out,rows,bricks:[...new Set(visible.map(s=>s.name))]};
 });
 const priorNames=new Set(originalSongs.flatMap(s=>(s.rows??[]).flatMap(r=>r.bricks.flatMap(b=>[b.name,brickIdentity(b.name)])))),newNames=new Map();
 for(const record of audits)for(const segment of record.segments)if(segment.kind==='known'&&!priorNames.has(segment.name)){
  const group=newNames.get(segment.name)??{name:segment.name,type:segment.type,provenance:'Impro-Visor My.dictionary',definitions:[],standards:[]};
  if(!group.definitions.some(d=>d.id===segment.definition.id))group.definitions.push(segment.definition);
  let standard=group.standards.find(s=>s.song===record.song);if(!standard){standard={song:record.song,title:record.title,composition:record.compositionKey,passages:[]};group.standards.push(standard);}standard.passages.push({start:segment.start,end:segment.end,tonic:segment.tonic,definition:segment.definition});newNames.set(segment.name,group);
 }
 const dictionaryAdditions=[...newNames.values()].map(group=>({...group,support:new Set(group.standards.map(s=>s.composition)).size})).sort((a,b)=>b.support-a.support||a.name.localeCompare(b.name));
 return {songs,patterns,dictionaryAdditions,audit:{version:1,candidateEntries:entries.length,addedCharts:songs.length,newCompositions:songs.filter(s=>s.arrangementOf===undefined).length,arrangements:songs.filter(s=>s.arrangementOf!==undefined).length,indexStart:startIndex,rejected,discoveredPatterns:patterns.length,newDictionaryBricks:dictionaryAdditions.length,repeatedNewDictionaryBricks:dictionaryAdditions.filter(b=>b.support>=minimumSupport).map(b=>({name:b.name,support:b.support})),minimumSupport,dictionaryDefinitions:dictionary.definitions.length,matching:'nested named definitions; constant transposition; explicit equivalence families; exact duration ratios or wildcard durations; minimum dictionary cost; no Java inexact-duration fallback',unknowns:'Unsupported cells remain clipped/silent with actual source symbol/timing retained. Explicit NC is separately marked noHarmony and remains silent; it is not an unsupported chord quality.',discovery:'Exact relative-root, compound-quality, explicit-bass and relative-duration patterns in unexplained spans. At least three distinct imported compositions; generic ii-V-I and POT excluded; known meaningful bricks take priority. Dictionary additions are existing sourced rules absent from the original roadmap labels, not newly invented music-theory names.',records:audits}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const at=process.argv.indexOf(name);return at<0?null:process.argv[at+1];};
 const input=path.resolve(arg('--input')??path.join(project,'dist/data/melody-leadsheets.json')),dictionaryPath=path.resolve(arg('--dictionary')??path.join(project,'../Impro-Visor/vocab/My.dictionary')),outputDir=path.resolve(arg('--output-dir')??path.join(project,'dist/data')),auditPath=path.resolve(arg('--audit')??path.join(project,'evidence/brick-parsing-audit.json'));
 const originalSongs=JSON.parse(fs.readFileSync(path.join(project,'dist/data/roadmaps.json'),'utf8')).songs,qualities=JSON.parse(fs.readFileSync(path.join(project,'src/music/chord-vocabulary.json'),'utf8')).qualities,inputData=JSON.parse(fs.readFileSync(input,'utf8')),dictionaryText=fs.readFileSync(dictionaryPath,'utf8');
 const melodyManifest=path.join(project,'dist/data/melodies.json'),existingMatches=fs.existsSync(melodyManifest)?JSON.parse(fs.readFileSync(melodyManifest,'utf8')).existingMatches??[]:[];
 const result=prepareAdditionalStandards(inputData.entries,{originalSongs,dictionary:parseBrickDictionary(dictionaryText),qualities,existingMatches});
 const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');result.audit.provenance={melodyInputSha256:sha(input),dictionarySha256:sha(dictionaryPath),dictionarySource:'https://github.com/Impro-Visor/Impro-Visor/blob/550bbb554962249aceb0e82a72142e3e5b3c0d4a/vocab/My.dictionary',parserSources:[{file:'src/imp/roadmap/cykparser/CYKParser.java',lines:'231-340,390-440',basis:'nested named productions and minimum-cost explanation'},{file:'src/imp/roadmap/cykparser/BinaryProduction.java',lines:'269-291,351-363',basis:'relative key, family and duration constraints; importer intentionally rejects100x-cost non-scaling fallback'}]};
 fs.mkdirSync(outputDir,{recursive:true});fs.mkdirSync(path.dirname(auditPath),{recursive:true});
 fs.writeFileSync(path.join(outputDir,'additional-standards.json'),JSON.stringify({version:1,indexStart:result.audit.indexStart,timeUnit:'bar',songs:result.songs}));
 fs.writeFileSync(path.join(outputDir,'discovered-bricks.json'),JSON.stringify({version:1,minimumStandards:3,patterns:result.patterns,dictionaryAdditions:result.dictionaryAdditions}));
 fs.writeFileSync(auditPath,JSON.stringify(result.audit,null,2));console.log(JSON.stringify({addedCharts:result.songs.length,newCompositions:result.audit.newCompositions,arrangements:result.audit.arrangements,patterns:result.patterns.length,rejected:result.audit.rejected.length,indexStart:result.audit.indexStart}));
}
