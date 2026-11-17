import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const audit=read('evidence/dotted-timing-inventory.json'),candidates=read('evidence/dotted-timing-candidates.json'),pool=read('dist/data/melody-sources.json'),songs=read('dist/data/standards.json').songs;
test('the written-timing inventory covers every performance and active head including exact existing matches',()=>{
 const ids=new Set([...songs.filter(s=>s.melodyId).map(s=>s.melodyId),...pool.existingMatches.map(m=>m.melodyId)]);assert.equal(audit.counts.performances,507);assert.equal(audit.performances.length,507);assert.equal(new Set(audit.performances.map(p=>p.song)).size,507);assert.deepEqual(new Set(audit.heads.map(h=>h.melodyId)),ids);assert.equal(ids.size,266);assert.equal(audit.counts.melodyCharts,266);assert.equal(audit.counts.sourceHashVerifiedHeads,266);assert.equal(audit.sourcePins.length,266);assert.ok(audit.heads.find(h=>h.melodyId==='psjazz-realbook-girl-from-ipanema').usage.some(u=>u.song===73&&u.basis==='existingMatches'));
 for(const h of audit.heads){assert.equal(h.noteCount,pool.entries[h.melodyId].notes.length);assert.equal(h.source.sourceSha256,pool.entries[h.melodyId].provenance.sha256);assert.match(h.source.sourceSha256,/^[a-f0-9]{64}$/);}
});
test('all candidates and written dot figures are retained, counted separately and remain unapproved',()=>{
 assert.equal(candidates.cells.length,716);assert.equal(new Set(candidates.cells.map(c=>c.id)).size,716);assert.equal(new Set(candidates.cells.map(c=>c.melodyId)).size,32);assert.equal(candidates.writtenDottedFigures.length,716);assert.equal(audit.counts.uniquePhysicalDottedGlyphs,503);assert.equal(audit.counts.fractionalAbsoluteStartFigures,39);assert.equal(audit.counts.writtenDottedSixteenthFigures,0);assert.equal(audit.counts.literalDottedSixteenthTokens,0);assert.equal(audit.counts.restEdgeCells,89);assert.equal(audit.counts.heldOrTieEdgeCells,88);
 assert.ok(candidates.cells.every(c=>c.normalizationApproved===false));assert.ok(candidates.writtenDottedFigures.every(c=>c.normalizationApproved===false));assert.equal(audit.heads.reduce((n,h)=>n+h.candidateCells,0),candidates.cells.length);assert.equal(audit.heads.reduce((n,h)=>n+h.writtenDottedFigures,0),candidates.writtenDottedFigures.length);
 assert.equal(candidates.cells.filter(c=>c.classification==='probable-swing-encoding').length,82);assert.equal(candidates.cells.filter(c=>c.classification==='unresolved').length,634);
});
test('grace/articulation and repeat-map differences are explicit source issues, never silent source omissions',()=>{
 const issues=audit.heads.filter(h=>h.source.issues.length);assert.deepEqual(issues.map(h=>h.melodyId).sort(),['openbook-a-night-in-tunisia-fake','openbook-recorda-me-wikifonia','openbook-whisper-not-laurent','psjazz-realbook-in-a-sentimental-mood','psjazz-realbook-just-the-way-you-are'].sort());assert.equal(audit.counts.sourceAuditedHeads,261);const unresolved=issues.find(h=>h.melodyId==='psjazz-realbook-just-the-way-you-are');assert.equal(unresolved.source.independentLiteralGlyphAudit.dottedEighthGlyphs,0);assert.equal(unresolved.source.independentLiteralGlyphAudit.dottedSixteenthGlyphs,0);assert.equal(unresolved.source.issues[0].kind,'unresolved-source-to-performance-map');
});
test('the source-unit scanner retains offbeat dots, isolated fragments, true dotted-sixteenths, rests and merged ties',()=>{
 const python=String.raw`
import sys,importlib.util
spec=importlib.util.spec_from_file_location('audit',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
e={'barBeats':4,'totalBeats':4,'measures':[{'start':0,'duration':4,'sourceNumber':'1'}],'notes':[]}
def u(start,duration,denominator,dots,kind='note'):
 return {'start':start,'end':start+duration,'kind':kind,'sourceDenominator':denominator,'dots':dots,'pitches':[60] if kind=='note' else []}
off=[u(.5,.75,8,1),u(1.25,.25,16,0)];f=m.written_figure(e,off[0],off);assert f['classification']=='syncopated-dotted-eighth' and f['hasExactComplementaryWrittenUnit'] and not f['gridAligned'];cells=m.add_written_cells(e,{},off);assert (.5,1) in cells and not cells[(.5,1)]['gridAligned']
isolated=[u(0,.75,8,1),u(.75,1,4,0,'rest')];assert m.written_figure(e,isolated[0],isolated)['classification']=='isolated-or-tied-dotted-fragment'
sixteenth=[u(0,.375,16,1),u(.375,.125,32,0)];assert m.written_figure(e,sixteenth[0],sixteenth)['classification']=='genuine-written-dotted-sixteenth';assert (0,.5) in m.add_written_cells(e,{},sixteenth)
tied={**e,'notes':[{'pitch':60,'start':0,'duration':1}]};units,issues=m.match_written_units(tied,[u(0,.75,8,1),u(.75,.25,16,0)]);assert not issues and [u['noteIndex'] for u in units]==[0,0] and all(u['tiePiece'] for u in units);assert (0,1) in m.add_written_cells(tied,{},units)
unknown,issues=m.match_written_units({**e,'notes':[]},[u(0,.75,8,1)]);assert len(unknown)==1 and unknown[0]['unresolvedCoverage'] and issues
pickup={**e,'totalBeats':4.5,'measures':[{'start':0,'duration':.5,'sourceNumber':'0'},{'start':.5,'duration':4,'sourceNumber':'1'}]};assert m.written_figure(pickup,off[0],off)['gridAligned']
`;
 const result=spawnSync('/opt/homebrew/bin/python3.11',['-c',python,new URL('../scripts/audit-dotted-timings.py',import.meta.url).pathname],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
