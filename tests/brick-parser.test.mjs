import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseBrickDictionary,createBrickParser,discoverRepeatedPatterns} from '../src/music/brick-parser.mjs';
import {prepareAdditionalStandards} from '../scripts/import-standards.mjs';
const qualities=JSON.parse(fs.readFileSync(new URL('../src/music/chord-vocabulary.json',import.meta.url),'utf8')).qualities;
const text=`
/* (defbrick Fake Major Cadence C (chord C 1)) */
(brick-type Invisible 2000)
(brick-type Approach 45)
(brick-type Cadence 25)
(brick-type On 550)
(equiv C CM7 C6)
(defbrick GenMajor(triad) Major Invisible C (chord C 1))
(defbrick GenMajor(seventh) Major Invisible C (chord CM7 1))
(defbrick Straight-Approach Major Approach C (chord Dm7 1) (chord G7 1))
// The declared F key must not be mistaken for C.
(defbrick Landing(nested example) Major Cadence F
 (brick Straight-Approach F 2) (brick GenMajor(seventh) F 2))
(defbrick Free-Ending Major Cadence C (chord G7 1) (chord C *))
`;
const dictionary=parseBrickDictionary(text),parser=createBrickParser(dictionary,{qualities});
function events(symbols,durations=symbols.map(()=>1)){let at=0;return symbols.map((symbol,i)=>{const start=at;at+=durations[i];return{symbol,start,end:at};});}

test('dictionary reader retains explicit source qualifiers, costs, nested references and wildcard duration',()=>{
 assert.equal(dictionary.definitions.length,5);assert.ok(!dictionary.definitions.some(d=>d.name==='Fake'));
 assert.equal(dictionary.typeCosts.Cadence,25);
 const landing=dictionary.definitions.find(d=>d.name==='Landing');assert.equal(landing.key,'F');assert.equal(landing.qualifier,'nested example');assert.equal(landing.components[1].qualifier,'seventh');assert.equal(landing.components[0].relativeRoot,0);assert.ok(landing.line>0);
 assert.equal(dictionary.definitions.find(d=>d.name==='Free Ending').components[1].duration,null);
});

test('nested named bricks match relative roots and exact rhythmic scaling in any source key',()=>{
 const c=parser.parse(events(['Dm7','G7','CM7'],[1,1,2])),f=parser.parse(events(['Gm7','C7','FM7'],[2,2,4]));
 for(const result of[c,f]){assert.equal(result.segments.length,1);assert.equal(result.segments[0].name,'Landing');assert.equal(result.segments[0].proof.children[0].name,'Straight Approach');assert.equal(result.segments[0].proof.children[1].name,'GenMajor');assert.equal(result.segments[0].proof.children[1].qualifier,'seventh');}
 assert.equal(c.segments[0].tonic,0);assert.equal(f.segments[0].tonic,5);assert.equal(f.segments[0].end,8);
 const changed=parser.parse(events(['Dm7','G7','CM7'],[1,2,3]));assert.ok(!changed.candidates.some(c=>c.name==='Landing'));
});

test('matching is conservative about actual harmony, slash bass, gaps and section boundaries',()=>{
 for(const chords of[events(['Dm7','Gb7','CM7'],[1,1,2]),events(['Dm7','G7/C','CM7'],[1,1,2]),events(['Dm7','G7','Cm7'],[1,1,2])])assert.ok(!parser.parse(chords).candidates.some(c=>c.name==='Landing'));
 const gap=events(['Dm7','G7','CM7'],[1,1,2]);gap[1].start=1.5;assert.ok(!parser.parse(gap).candidates.some(c=>c.name==='Landing'));
 assert.ok(!parser.parse(events(['Dm7','G7','CM7'],[1,1,2]),{boundaries:[2]}).candidates.some(c=>c.name==='Landing'));
 const clipped=events(['Dm7','G7','CM7'],[1,1,2]);clipped[1].clipped=true;assert.ok(!parser.parse(clipped).candidates.some(c=>c.name==='Landing'));
});

test('wildcard timing is explicit and equivalence families preserve the original chord data',()=>{
 const original=events(['G7','C6'],[1,7]),before=JSON.stringify(original),result=parser.parse(original);
 assert.equal(result.segments[0].name,'Free Ending');assert.equal(result.segments[0].end,8);assert.equal(JSON.stringify(original),before);
 assert.equal(result.segments[0].proof.children[1].symbol,'C6');assert.equal(result.segments[0].proof.children[1].expected,'C');assert.equal(result.segments[0].proof.children[1].match,'equivalence');
});

test('every input chord remains covered exactly once, including unsupported and unknown events',()=>{
 const chords=events(['Dm7','G7','CM7','NC','F#not-a-quality'],[1,1,2,1,1]),result=parser.parse(chords);
 const covered=result.segments.flatMap(s=>Array.from({length:s.endIndex-s.startIndex},(_,i)=>s.startIndex+i));assert.deepEqual(covered,[0,1,2,3,4]);assert.equal(result.segments.at(-1).kind,'unparsed');assert.equal(result.segments.at(-2).kind,'unparsed');
 assert.deepEqual(parser.parse([]).segments,[]);
});

function uncovered(index,symbols,durations=[1,1,2],title='Composition '+index){const chords=events(symbols,durations);return{index,title,normalizedTitle:title,chords,parse:{segments:chords.map((c,i)=>({kind:'unparsed',startIndex:i,endIndex:i+1,start:c.start,end:c.end}))}};}
test('new patterns require three distinct compositions and retain exact qualities, bass and relative rhythm',()=>{
 const standards=[uncovered(0,['CM7','F#m7b5','Eb7']),uncovered(1,['DM7','G#m7b5','F7'],[2,2,4]),uncovered(2,['FM7','Bm7b5','Ab7']),uncovered(3,['CM7','F#m7b5','Eb7'],[1,2,1])];
 const patterns=discoverRepeatedPatterns(standards,{qualities});assert.equal(patterns.length,1);assert.equal(patterns[0].support,3);assert.deepEqual(patterns[0].matches.map(m=>m.song),[0,1,2]);assert.equal(patterns[0].referenceBasis,'first-chord-reference');assert.ok(patterns[0].name.includes('→'));
 const repeated=[uncovered(0,['CM7','F#m7b5','Eb7']),uncovered(1,['CM7','F#m7b5','Eb7'],[1,1,2],'Composition 0'),uncovered(2,['CM7','F#m7b5','Eb7'],[1,1,2],'Composition 0')];assert.equal(discoverRepeatedPatterns(repeated,{qualities}).length,0);
});

test('generic ii-V-I and already explained named bricks do not become discoveries',()=>{
 const generic=[0,1,2].map(i=>uncovered(i,['Dm7','G7','CM7']));assert.equal(discoverRepeatedPatterns(generic,{qualities}).length,0);
 const known=[0,1,2].map(i=>{const s=uncovered(i,['CM7','F#m7b5','Eb7']);s.parse.segments=[{kind:'known',type:'Cadence',startIndex:0,endIndex:3,start:0,end:4}];return s;});assert.equal(discoverRepeatedPatterns(known,{qualities}).length,0);
});

test('the pinned dictionary and a real encoded progression produce auditable nested coverage',()=>{
 const actual=parseBrickDictionary(fs.readFileSync(new URL('../../Impro-Visor/vocab/My.dictionary',import.meta.url),'utf8'));assert.equal(actual.definitions.length,554);assert.equal(actual.equivalences.length,6);
 const song=JSON.parse(fs.readFileSync(new URL('../dist/data/roadmaps.json',import.meta.url),'utf8')).songs[0],chords=song.rows.flatMap(row=>row.chords.map(c=>({...c,start:row.startBar+c.start,end:row.startBar+c.end}))),result=createBrickParser(actual,{qualities}).parse(chords);
 assert.equal(result.segments[0].name,'Donna Lee Start');assert.equal(result.segments[0].start,0);assert.equal(result.segments[0].end,4);
 assert.deepEqual(result.segments.flatMap(s=>Array.from({length:s.endIndex-s.startIndex},(_,i)=>s.startIndex+i)),chords.map((_,i)=>i));assert.equal(result.diagnostics.truncatedResults,0);
 for(const match of result.segments.filter(s=>s.kind==='known')){assert.ok(match.definition.line>0);assert.ok(match.proof.children.length);}
});

function xmlEntry(id,title,symbols=['Dm7','G7','CM7']){return{id,title,normalizedTitle:title.toLowerCase(),composer:'Source composer',tonic:['C','Major'],meter:[4,4],barBeats:4,bars:4,totalBeats:16,pickupBeats:0,notes:[{pitch:60,start:0,duration:16,velocity:74}],chords:events(symbols,[4,4,8]),provenance:{url:'https://example.org/'+id+'.xml',format:'MusicXML',tonicBasis:'fixture'}};}
test('additional imports keep original indices intact and use the same source arrangement and exact bar coverage',()=>{
 const originals=[{index:0,title:'Original',leadsheet:null},{index:241,title:'Final original'}],before=JSON.stringify(originals),entries=[xmlEntry('gamma','Gamma'),xmlEntry('original','Original'),xmlEntry('alpha','Alpha'),xmlEntry('alpha-key','Alpha-G')];
 const result=prepareAdditionalStandards(entries,{originalSongs:originals,dictionary,qualities,includeArrangements:false});assert.equal(JSON.stringify(originals),before);assert.deepEqual(result.songs.map(s=>[s.index,s.title]),[[242,'Alpha'],[243,'Gamma']]);assert.ok(result.audit.rejected.some(r=>r.reason==='existing-composition'));assert.ok(result.audit.rejected.some(r=>r.reason==='alternate-arrangement'));
 for(const song of result.songs){assert.equal(song.source.format,'MusicXML');assert.equal(song.source.url,'https://example.org/'+song.melodyId+'.xml');assert.equal(song.page,null);assert.equal(song.image,null);assert.deepEqual(song.meter,[4,4]);assert.equal(song.rows.reduce((n,r)=>n+r.bars,0),song.bars);assert.equal(song.rows.flatMap(r=>r.chords).reduce((n,c)=>n+c.end-c.start,0),song.bars);assert.equal(song.rows[0].bricks[0].name,'Landing');assert.deepEqual(song.encodedChanges,entries.find(e=>e.id===song.melodyId).chords);}
 const reversed=prepareAdditionalStandards([...entries].reverse(),{originalSongs:originals,dictionary,qualities,includeArrangements:false});assert.deepEqual(reversed.songs,result.songs);
});

test('pickups are excluded, and unsupported source harmony stays clipped rather than receiving invented notes',()=>{
 const pickup=xmlEntry('pickup','Pickup');pickup.pickupBeats=1;
 const unknown=xmlEntry('unknown','Unknown',['Dm7','G7','Cunknown-quality']);
 const result=prepareAdditionalStandards([pickup,unknown],{originalSongs:[],dictionary,qualities});assert.equal(result.songs.length,1);assert.ok(result.audit.rejected.some(r=>r.reason==='pickup-measure'));const cells=result.songs[0].rows.flatMap(r=>r.chords);assert.equal(cells.at(-1).symbol,'Cunknown-quality');assert.equal(cells.at(-1).clipped,true);assert.equal(cells.at(-1).end-cells.at(-1).start,2);
 assert.equal(result.audit.records[0].unsupported[0].symbol,'Cunknown-quality');
});

test('a conflicting source filename and score title is not silently published as a composition match',()=>{
 const candidate=xmlEntry('conflict','Impressions');candidate.provenance.path='RealBook/Leila/Leila.musicxml';
 const result=prepareAdditionalStandards([candidate],{originalSongs:[],dictionary,qualities});assert.equal(result.songs.length,0);assert.equal(result.audit.rejected[0].reason,'source-title-conflict');
 const printed=xmlEntry('credit','Printed title');printed.provenance.path='RealBook/old-filename.musicxml';printed.provenance.titleMetadata={selectedFrom:'printed title credit',printedTitle:'Printed title',workTitle:'Stale metadata'};const confirmed=prepareAdditionalStandards([printed],{originalSongs:[],dictionary,qualities});assert.equal(confirmed.songs.length,1);assert.equal(confirmed.songs[0].provenance.titleMetadata.workTitle,'Stale metadata');
});

test('approved separate arrangements point to their composition and do not duplicate an already attached exact source',()=>{
 const originals=[{index:5,title:'Original'}],a=xmlEntry('original-arrangement','Original'),b=xmlEntry('new-a','New chart'),c=xmlEntry('new-b','New chart'),already=xmlEntry('attached','Attached');
 const result=prepareAdditionalStandards([a,b,c,already],{originalSongs:originals,dictionary,qualities,existingMatches:[{song:3,melodyId:'attached'}]});assert.equal(result.songs.length,3);
 const sourceArrangement=result.songs.find(s=>s.melodyId===a.id);assert.equal(sourceArrangement.arrangementOf,5);
 const primary=result.songs.find(s=>s.melodyId===b.id),alternate=result.songs.find(s=>s.melodyId===c.id);assert.equal(primary.arrangementOf,undefined);assert.equal(alternate.arrangementOf,primary.index);
 assert.equal(result.audit.newCompositions,1);assert.equal(result.audit.arrangements,2);assert.equal(result.audit.rejected[0].reason,'already-attached-exact-arrangement');
});

test('agreeing filename/work metadata may link a printed title typo, while stale work titles remain excluded as evidence',()=>{
 const typo=xmlEntry('typo','Cheerokee');typo.provenance.path='Cherokee.musicxml';typo.provenance.titleMetadata={selectedFrom:'printed title credit',printedTitle:'Cheerokee',workTitle:'Cherokee',filenameTitle:'Cherokee'};
 const stale=xmlEntry('stale','Django');stale.provenance.path='Django.musicxml';stale.provenance.titleMetadata={selectedFrom:'printed title credit',printedTitle:'Django',workTitle:'Cherokee',filenameTitle:'Django'};
 const result=prepareAdditionalStandards([typo,stale],{originalSongs:[{index:36,title:'Cherokee'}],dictionary,qualities});assert.equal(result.songs.find(s=>s.melodyId==='typo').arrangementOf,36);assert.equal(result.songs.find(s=>s.melodyId==='stale').arrangementOf,undefined);assert.equal(result.songs.find(s=>s.melodyId==='typo').title,'Cheerokee');
});

test('generated additional charts preserve every source chord span and exact arrangement identity',()=>{
 const root=new URL('../',import.meta.url),data=JSON.parse(fs.readFileSync(new URL('dist/data/additional-standards.json',root),'utf8')),input=JSON.parse(fs.readFileSync(new URL('dist/data/melody-leadsheets.json',root),'utf8')),original=JSON.parse(fs.readFileSync(new URL('dist/data/roadmaps.json',root),'utf8')).songs,byId=new Map(input.entries.map(e=>[e.id,e]));
 assert.equal(original.length,242);assert.deepEqual(original.map(s=>s.index),Array.from({length:242},(_,i)=>i));assert.equal(data.indexStart,242);assert.deepEqual(data.songs.map(s=>s.index),data.songs.map((_,i)=>242+i));
 for(const song of data.songs){
  const source=byId.get(song.melodyId);assert.ok(source,song.title);assert.deepEqual(song.tonic,source.tonic,song.title);assert.deepEqual(song.meter,source.meter,song.title);assert.deepEqual(song.encodedChanges,source.chords,song.title);assert.equal(song.source.sha256,source.provenance.sha256,song.title);assert.equal(song.provenance.melodyArrangement,'same-MusicXML');
  const coverage=new Map();let bars=0;
  for(const row of song.rows){assert.ok(Math.abs(row.startBar-bars)<1e-7,song.title);bars+=row.bars;let end=0;
   for(const c of row.chords){assert.ok(Math.abs(c.start-end)<1e-7,song.title);assert.ok(c.end>c.start&&c.end<=row.bars+1e-7,song.title);end=c.end;if(c.sourceIndex===undefined){assert.equal(c.sourceGap,true);assert.equal(c.symbol,'NC');assert.equal(c.clipped,true);continue;}const expected=source.chords[c.sourceIndex];assert.equal(c.symbol,expected.symbol,song.title);const spans=coverage.get(c.sourceIndex)??[];spans.push([(row.startBar+c.start)*source.barBeats,(row.startBar+c.end)*source.barBeats]);coverage.set(c.sourceIndex,spans);}
   assert.ok(Math.abs(end-row.bars)<1e-7,song.title);
  }
  assert.equal(bars,song.bars,song.title);
  for(const [i,c]of source.chords.entries()){const spans=coverage.get(i);assert.ok(spans?.length,song.title);assert.ok(Math.abs(spans[0][0]-c.start)<1e-7,song.title);assert.ok(Math.abs(spans.at(-1)[1]-c.end)<1e-7,song.title);for(let j=1;j<spans.length;j++)assert.ok(Math.abs(spans[j-1][1]-spans[j][0])<1e-7,song.title);}
 }
 const discoveries=JSON.parse(fs.readFileSync(new URL('dist/data/discovered-bricks.json',root),'utf8'));
 for(const pattern of discoveries.patterns){assert.ok(pattern.support>=3);assert.equal(new Set(pattern.matches.map(m=>m.composition)).size,pattern.support);}
 for(const addition of discoveries.dictionaryAdditions){assert.ok(addition.definitions.every(d=>d.line>0));assert.equal(new Set(addition.standards.map(s=>s.composition)).size,addition.support);}
});
