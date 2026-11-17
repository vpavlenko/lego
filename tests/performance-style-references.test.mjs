import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const metadata=read('src/music/performance-style-references.json'),audit=read('evidence/performance-style-audit.json'),songs=read('dist/data/standards.json').songs,melodies=read('dist/data/melody-sources.json'),pool=melodies.entries;
const entries=new Map(metadata.entries.map(e=>[e.id,e]));
const compositionKey=s=>s.compositionKey??'original-'+s.index;
const canonical=new Map(songs.filter(s=>s.arrangementOf===undefined).map(s=>[compositionKey(s),s]));

test('performance-style inventory covers the current catalogue with exact default and explicit source pins',()=>{
 assert.equal(metadata.defaultFeel,'swing');assert.equal(metadata.defaultRatio,.67);assert.equal(metadata.unitBeats,1);assert.equal(entries.size,metadata.entries.length);
 assert.equal(audit.records.length,songs.length);assert.equal(audit.arrangements,507);assert.equal(audit.canonicalCompositions,canonical.size);assert.equal(canonical.size,269);const active=new Set([...songs.flatMap(s=>s.melodyId?[s.melodyId]:[]),...melodies.existingMatches.map(m=>m.melodyId)]);assert.equal(audit.sourceHeads,active.size);assert.equal(audit.sourceHeads,266);assert.equal(audit.explicitMelodyIdCharts,265);assert.equal(audit.existingMatchCharts,1);assert.equal(audit.sourceBackedCharts,266);
 assert.ok(audit.sources.every(s=>s.verified===true&&/^[a-f0-9]{64}$/.test(s.sha256)&&s.path&&s.url.startsWith('https://')));
 for(const entry of entries.values()){
  assert.ok(['swing','straight'].includes(entry.feel));assert.equal(entry.ratio,entry.feel==='swing'?.67:.5);assert.equal(entry.unitBeats,1);
  const song=canonical.get(entry.compositionKey);assert.ok(song,entry.id);assert.equal(entry.canonicalSong,song.index);assert.ok(['Major','Minor'].includes(entry.mode));
  if(entry.melodyId){const source=pool[entry.melodyId];assert.ok(source,entry.id);assert.equal(entry.id,entry.melodyId);assert.equal(entry.sourceSha256,source.provenance.sha256);assert.equal(entry.sourcePath,source.provenance.path);assert.equal(entry.sourceVersion,source.provenance.sourceVersion);}
  if(entry.evidence.basis==='same-composition'&&entry.evidence.referenceId){const reference=entries.get(entry.evidence.referenceId);assert.ok(reference);assert.equal(reference.compositionKey,entry.compositionKey);assert.equal(reference.mode,entry.mode);assert.equal(reference.feel,entry.feel);assert.equal(reference.ratio,entry.ratio);}
  else{const source=entry.evidence.source;assert.ok(audit.sources.some(s=>s.url===source.url&&s.sha256===source.sha256&&s.path===source.path));assert.ok(entry.evidence.declarations.length);assert.ok(entry.evidence.declarations.every(d=>Number.isInteger(d.line)&&d.line>0&&d.quote));if(entry.melodyId&&entry.evidence.basis==='own-source')assert.equal(source.sha256,entry.sourceSha256);}
 }
});

test('Honeysuckle and Ain’t Misbehavin retain explicit swing conventions despite cut-time notation',()=>{
 for(const [id,key]of [['openbook-honeysuckle-rose-fake','original-79'],['openbook-ain-t-misbehavin-fake','original-2']]){
  const entry=entries.get(id),source=pool[id];assert.equal(entry.feel,'swing');assert.equal(entry.ratio,.67);assert.equal(entry.unitBeats,1);assert.equal(source.meter[1],2);assert.equal(entry.sourceSha256,source.provenance.sha256);
  const convention=entries.get('composition:'+key);assert.equal(entry.evidence.referenceId,convention.id);assert.ok(convention.evidence.declarations.some(d=>d.quote==='(swing 0.67)'));assert.ok(convention.evidence.declarations.some(d=>d.quote==='(style swing'));
 }
});

test('own straight/Latin directions override default swing and remain source-specific',()=>{
 for(const id of ['psjazz-realbook-emily','psjazz-realbook-it-never-entered-my-mind','psjazz-realbook-ceora','psjazz-realbook-favela','psjazz-realbook-ladies-in-mercedes','psjazz-realbook-little-sunflower','psjazz-realbook-just-the-way-you-are','openbook-blue-bossa-real','openbook-the-girl-from-ipanema-fake','openbook-st-thomas-fake']){
  const entry=entries.get(id);assert.equal(entry.feel,'straight',id);assert.equal(entry.evidence.basis,'own-source');assert.equal(entry.evidence.source.sha256,pool[id].provenance.sha256);
 }
 assert.ok(entries.get('psjazz-realbook-emily').evidence.declarations.some(d=>d.quote==='Straight'));
 assert.ok(entries.get('psjazz-realbook-it-never-entered-my-mind').evidence.declarations.some(d=>d.quote==='(Straight Ballade)'));
 // A convention labelled latin must not override a different explicit swing edition.
 assert.equal(entries.get('composition:original-4').feel,'straight');assert.equal(entries.get('psjazz-realbook-alice-in-wonderland').feel,'swing');
});

test('mixed-style and irregular subdivision evidence stays in the audit without a whole-piece mixed exclusion',()=>{
 assert.ok(audit.records.some(r=>r.compositionKey==='original-153'&&r.ownSourceFeel==='mixed'));
 assert.ok(!entries.has('composition:original-153'));assert.ok(!metadata.entries.some(e=>e.feel==='mixed'));
 for(const id of ['openbook-honeysuckle-rose-fake','openbook-ain-t-misbehavin-fake']){const row=audit.records.find(r=>r.melodyId===id);assert.equal(row.timing.swingCommand,false);assert.equal(row.timing.tuplets,false);assert.equal(row.timing.grace,false);assert.equal(row.timing.ties,true);}
 assert.ok(audit.records.some(r=>r.timing?.tuplets));assert.ok(audit.records.some(r=>r.timing?.grace));
});


test('directly attached Ipanema head is included and obeys its own literal Straight annotation',()=>{
 const id='psjazz-realbook-girl-from-ipanema',entry=entries.get(id),source=pool[id],match=melodies.existingMatches.find(m=>m.melodyId===id);
 assert.ok(entry);assert.equal(entry.feel,'straight');assert.equal(entry.evidence.basis,'own-source');assert.equal(entry.sourceSha256,'8675c22c78221382e091b7060bb4429d67471cdca25cd9f1aada3a23d7010bfc');assert.equal(entry.sourceSha256,source.provenance.sha256);assert.equal(entry.sourcePath,source.provenance.path);
 assert.ok(entry.evidence.declarations.some(d=>d.line===114&&d.quote==='Straight'));assert.deepEqual(entry.evidence.canonicalAttachment,{type:'existing-match',...match});
 const row=audit.records.find(r=>r.song===73);assert.equal(row.melodyId,id);assert.equal(row.ownSourceFeel,'straight');assert.equal(row.reference,id);assert.equal(row.effectiveDefault,'straight');
 const xml=audit.sources.filter(s=>s.url.includes('/florento/PSjazzEval/'));assert.equal(xml.length,31);assert.ok(xml.some(s=>s.sha256===entry.sourceSha256&&s.verified===true));
});
