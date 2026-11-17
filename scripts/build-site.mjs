import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {attachMelody} from '../src/music/melody.mjs';
import {realizeSong} from '../src/music/realization.mjs';
import {encodeMidi} from '../src/music/midi.mjs';
import {orderBrickVariants} from '../src/music/variant-order.mjs';
import {buildLearnerBrickIndex} from '../src/music/brick-families.mjs';
import {removeUnhelpfulBricks} from '../src/music/brick-coverage.mjs';
import {refineSingleUseFamilies} from '../src/music/brick-reuse.mjs';
import {buildBrickVariants} from '../src/music/brick-variants.mjs';
import {buildBrickIndex,brickExample} from '../src/music/bricks.mjs';
import {analyzeForm} from '../src/music/forms.mjs';
import {phraseGrid} from '../src/music/phrases.mjs';
import {alignRepeatedSubphrases} from '../src/music/section-layout.mjs';
import {groupBricks} from '../src/music/brick-groups.mjs';
import {cleanModulationRegions} from '../src/music/modulation-regions.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url),libraryFile=specifier=>require.resolve('librawl/'+specifier),libraryDist=path.dirname(libraryFile('style.css'));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const original=read('dist/data/roadmaps.json'),additional=fs.existsSync(path.join(root,'dist/data/additional-standards.json'))?read('dist/data/additional-standards.json'):{songs:[]};
const rawSongs=[...original.songs,...additional.songs],vocabulary=read('src/music/chord-vocabulary.json'),{qualities}=vocabulary;
const sourceIndex=buildBrickIndex(rawSongs),coverage=removeUnhelpfulBricks(rawSongs,vocabulary),allFamilies=buildLearnerBrickIndex(sourceIndex),learner=buildLearnerBrickIndex(buildBrickIndex(coverage.songs));
// Removed labels may own old page addresses of a still useful family.
// Keep their names/routes searchable without restoring discarded passages.
for(const brick of learner.bricks){const old=allFamilies.bricks.find(b=>b.name===brick.name);if(old)for(const field of ['aliases','aliasSlugs'])brick[field]=[...new Set([...brick[field],...old[field]])].sort();}
const reuse=refineSingleUseFamilies(learner,coverage.songs,vocabulary),songs=reuse.songs,bricks=reuse.index;
for(const brick of bricks.bricks)brick.standardCount=new Set(brick.standards.map(match=>songs[match.song].arrangementOf??match.song)).size;
const musicalData=list=>JSON.stringify(list.map(({bricks,rows,...song})=>({...song,rows:rows.map(({bricks,...row})=>row)}))),fingerprint=value=>createHash('sha256').update(value).digest('hex');
if(musicalData(rawSongs)!==musicalData(songs))throw Error('Brick projection changed musical source data');
const runtimeSpans=songs.flatMap(song=>song.rows.flatMap((row,ri)=>row.bricks.map(span=>[song.index,ri,span.name,row.startBar+span.start,row.startBar+span.end]))),indexSpans=bricks.bricks.flatMap(brick=>brick.standards.flatMap(match=>match.passages.map(p=>[match.song,p.row,p.label,p.startBar,p.endBar]))),spanHash=spans=>fingerprint(JSON.stringify(spans.map(JSON.stringify).sort()));
if(spanHash(runtimeSpans)!==spanHash(indexSpans))throw Error('Brick index and runtime passages differ');
const reuseAudit=read('evidence/brick-reuse-audit.json');
fs.writeFileSync(path.join(root,'evidence/brick-reuse-audit.json'),JSON.stringify({...reuseAudit,stats:reuse.stats,integrity:{standards:songs.length,musicBeforeSha256:fingerprint(musicalData(coverage.songs)),musicAfterSha256:fingerprint(musicalData(songs)),runtimeSpanSha256:spanHash(runtimeSpans),indexSpanSha256:spanHash(indexSpans),runtimePassages:runtimeSpans.length,indexPassages:indexSpans.length,remainingOneStandardFamilies:bricks.bricks.filter(b=>b.standards.length<2).length},summary:reuse.decisions.map(d=>({name:d.source.name,slug:d.source.slug,standards:d.source.standards,passages:d.source.passages,action:d.action,target:d.target?.name??null,distance:d.distance??null,reason:d.reason})),decisions:reuse.decisions},null,2));
const coverageAudit=read('evidence/one-chord-bricks.json');fs.writeFileSync(path.join(root,'evidence/one-chord-bricks.json'),JSON.stringify({...coverageAudit,version:3,source:{files:['dist/data/roadmaps.json','dist/data/additional-standards.json'],standards:rawSongs.length},stats:coverage.stats,removed:coverage.removed},null,2));
if(songs.some((song,i)=>song.index!==i))throw Error('Non-contiguous standard indices');
const melodyFile=fs.existsSync(path.join(root,'dist/data/melody-sources.json'))?'dist/data/melody-sources.json':'dist/data/melodies.json',melodyData=fs.existsSync(path.join(root,melodyFile))?read(melodyFile):{entries:{}},melodies=new Map(Object.values(melodyData.entries).map(entry=>[entry.id,entry])),melodyMatches=new Map((melodyData.existingMatches??[]).map(match=>[match.song,match]));
const modulationRecords=[];
function realizedView(song,record=false){const performance=realizeSong(song,qualities),projection=cleanModulationRegions(song,performance.changes,vocabulary);if(projection.stats.remainingOneHarmonyModulations)throw Error('Unresolved one-chord modulation in '+song.title);if(record)modulationRecords.push({song:song.index,title:song.title,...projection});return {...performance,sourceChanges:performance.changes,changes:projection.changes};}
fs.copyFileSync(path.join(root,'src/music/rawl-links.json'),path.join(root,'dist/data/rawl-links.json'));
const brickMap=new Map(bricks.bricks.flatMap(b=>[b.name,...b.aliases,...(b.sourceNames??[])].map(name=>[name,b])));
const phraseReferences=read('evidence/rawl-phrase-sources.json').records;
const forms=songs.map(song=>{
 const form=alignRepeatedSubphrases(song,analyzeForm(song),brickMap),grid=phraseGrid(song,form,{references:phraseReferences.filter(reference=>reference.standardIndex===song.index)});
 return {...form,phraseStarts:[...grid.starts,...(grid.closesAtEnd?[grid.end]:[])],phraseBasis:grid.basis,phraseExceptions:grid.exceptions};
});
fs.writeFileSync(path.join(root,'dist/data/forms.json'),JSON.stringify({version:3,forms}));
fs.mkdirSync(path.join(root,'dist/data/performances'),{recursive:true});fs.mkdirSync(path.join(root,'dist/midi'),{recursive:true});
let total=0,clipped=0;const melodyStandards=new Set();
for(const song of songs){
 const alignment=melodyMatches.get(song.index),entry=melodies.get(song.melodyId??alignment?.melodyId),data=attachMelody(realizedView(song,true),song,entry,song.melodyId?null:alignment),id=String(song.index).padStart(3,'0');if(data.notes.some(note=>note.voice===1))melodyStandards.add(song.arrangementOf??song.index);total+=data.notes.length;clipped+=data.chords.filter(c=>c.clipped).length;
 fs.writeFileSync(path.join(root,`dist/data/performances/${id}.json`),JSON.stringify(data));fs.writeFileSync(path.join(root,`dist/midi/${id}.mid`),encodeMidi(data));
}
fs.writeFileSync(path.join(root,'dist/data/standards.json'),JSON.stringify({...original,songs,melodyStandards:[...melodyStandards].sort((a,b)=>a-b)}));
fs.writeFileSync(path.join(root,'dist/data/modulations.json'),JSON.stringify({version:1,changes:modulationRecords.map(record=>record.changes)}));
fs.writeFileSync(path.join(root,'evidence/modulation-projection.json'),JSON.stringify({version:1,records:modulationRecords},null,2));
const previousBricks=read('dist/data/bricks.json').bricks;
fs.writeFileSync(path.join(root,'dist/data/source-bricks.json'),JSON.stringify(sourceIndex));
const currentSlugs=new Set(bricks.bricks.map(b=>b.slug));
for(const old of previousBricks)if(!currentSlugs.has(old.slug)){
 fs.rmSync(path.join(root,`dist/data/brick-performances/${old.slug}.json`),{force:true});
 fs.rmSync(path.join(root,`dist/midi/bricks/${old.slug}.mid`),{force:true});
}
fs.writeFileSync(path.join(root,'evidence/brick-aliases.json'),JSON.stringify({sourceLabels:sourceIndex.sourceLabels,canonicalBricks:sourceIndex.bricks.length,groups:sourceIndex.bricks.filter(b=>b.aliases.length).map(({name,aliases,standards,passages})=>({name,aliases,standards:standards.length,passages}))},null,2));
fs.writeFileSync(path.join(root,'dist/data/bricks.json'),JSON.stringify(bricks));
fs.mkdirSync(path.join(root,'dist/data/brick-performances'),{recursive:true});
fs.mkdirSync(path.join(root,'dist/midi/bricks'),{recursive:true});
const atlasBricks=[];let definitionCount=0,unresolvedOccurrences=0;
fs.mkdirSync(path.join(root,'dist/data/brick-variants'),{recursive:true});
fs.mkdirSync(path.join(root,'dist/midi/brick-variants'),{recursive:true});
for(const name of fs.readdirSync(path.join(root,'dist/data/brick-variants')))if(name.endsWith('.json')&&!currentSlugs.has(name.slice(0,-5)))fs.rmSync(path.join(root,'dist/data/brick-variants',name));
for(const name of fs.readdirSync(path.join(root,'dist/midi/brick-variants')))if(name.endsWith('.mid')&&!currentSlugs.has(name.split('--')[0]))fs.rmSync(path.join(root,'dist/midi/brick-variants',name));
for(const brick of bricks.bricks){
 const {previewSong,source}=brickExample(brick,songs),data={...realizedView(previewSong),previewSong,source};
 fs.writeFileSync(path.join(root,`dist/data/brick-performances/${brick.slug}.json`),JSON.stringify(data));
 fs.writeFileSync(path.join(root,`dist/midi/bricks/${brick.slug}.mid`),encodeMidi(data));
 const definitions=buildBrickVariants(brick,songs,vocabulary);definitions.variants=orderBrickVariants(definitions.variants);const currentIds=new Set(definitions.variants.map(v=>v.id));for(const name of fs.readdirSync(path.join(root,'dist/midi/brick-variants')))if(name.startsWith(brick.slug+'--')&&!currentIds.has(name.slice(brick.slug.length+2,-4)))fs.rmSync(path.join(root,'dist/midi/brick-variants',name));
 definitionCount+=definitions.variants.length;unresolvedOccurrences+=definitions.stats.unknownOccurrences+definitions.stats.partialOccurrences;
 definitions.variants.forEach((variant,i)=>{variant.number=i+1;variant.performance={...realizedView(variant.previewSong),previewSong:variant.previewSong,source:variant.source};variant.midi=`./midi/brick-variants/${brick.slug}--${variant.id}.mid`;fs.writeFileSync(path.join(root,variant.midi.replace('./','dist/')),encodeMidi(variant.performance));});
 fs.writeFileSync(path.join(root,`dist/data/brick-variants/${brick.slug}.json`),JSON.stringify(definitions));
 const popular=[...definitions.variants].sort((a,b)=>new Set(b.standards.map(m=>songs[m.song].arrangementOf??m.song)).size-new Set(a.standards.map(m=>songs[m.song].arrangementOf??m.song)).size||b.completeOccurrences-a.completeOccurrences||a.number-b.number)[0];
 atlasBricks.push({slug:brick.slug,name:brick.name,representativeName:brick.representativeName,sourceNames:brick.sourceNames,standards:brick.standardCount,variantId:popular?.id,performance:popular?.performance??data});
}
const catalogueGroups=groupBricks(atlasBricks,read('src/music/brick-types.json'));
fs.writeFileSync(path.join(root,'dist/data/atlas.json'),JSON.stringify({version:1,groups:catalogueGroups}));
fs.writeFileSync(path.join(root,'dist/data/bricks.json'),JSON.stringify({...bricks,groups:catalogueGroups.map(group=>({type:group.type,slugs:group.bricks.map(brick=>brick.slug)}))}));
fs.writeFileSync(path.join(root,'evidence/runtime-projection.json'),JSON.stringify({version:1,charts:songs.length,primaryStandards:songs.filter(s=>!Number.isInteger(s.arrangementOf)).length,originalCharts:original.songs.length,additionalCharts:additional.songs.length,rawSourceIdentities:sourceIndex.bricks.length,coverage:coverage.stats,reuse:reuse.stats,definitions:definitionCount,unresolvedOccurrences,unchangedMusicalDataSha256:fingerprint(musicalData(songs)),decisions:reuse.decisions.map(d=>({action:d.action,source:d.source.name,target:d.target?.name,reason:d.reason}))},null,2));
// Generated compatibility mirror: never edit the local CSS implementation.
fs.copyFileSync(libraryFile('legacy-style.css'),path.join(root,'packages/rawl-notation/src/style.css'));
fs.copyFileSync(libraryFile('legacy-style.css'),path.join(root,'dist/rawl-notation.css'));
fs.copyFileSync(path.join(libraryDist,'palette.js'),path.join(root,'dist/rawl-colors.mjs'));
fs.copyFileSync(path.join(libraryDist,'../LICENSE'),path.join(root,'dist/RAWL-LICENSE.txt'));
fs.copyFileSync(path.join(libraryDist,'../NOTICE.md'),path.join(root,'dist/LIBRAWL-NOTICE.md'));
fs.copyFileSync(path.join(libraryDist,'provenance.json'),path.join(root,'dist/librawl-provenance.json'));
fs.copyFileSync(libraryFile('browser/soundfont-playback-sax.js'),path.join(root,'dist/soundfont-playback.js'));
await build({entryPoints:[path.join(root,'src/rawl-view.jsx')],outfile:path.join(root,'dist/rawl-view.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],jsx:'automatic',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
await build({entryPoints:[path.join(root,'src/audio-player.mjs')],outfile:path.join(root,'dist/audio-player.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],minify:true});
await build({entryPoints:[path.join(root,'src/music/modulations.mjs')],outfile:path.join(root,'dist/modulations.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],minify:true});
await build({entryPoints:[path.join(root,'src/music/aaba-groups.mjs')],outfile:path.join(root,'dist/aaba-groups.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],minify:true});
console.log(JSON.stringify({songs:songs.length,bricks:bricks.bricks.length,notes:total,clipped,coverage:coverage.stats,reuse:reuse.stats,status:'built'}));
