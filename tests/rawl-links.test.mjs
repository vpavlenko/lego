import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const links=read('../src/music/rawl-links.json'),audit=read('../evidence/rawl-links-audit.json');

test('all Rawl links identify verified public MIDI records and retain actual rendition titles',()=>{
 assert.equal(links.version,1);assert.equal(Object.keys(links.standards).length,242);assert.equal(links.verifiedAt,audit.verifiedAt);
 const records=new Map(audit.records.map(r=>[r.midiId,r]));let count=0,standards=0;
 for(let i=0;i<242;i++){
  const list=links.standards[i];assert.ok(Array.isArray(list));if(list.length)standards++;const urls=new Set(),hashes=new Set();
  for(const link of list){count++;assert.ok(link.midiId);assert.ok(link.title);assert.match(link.url,/^https:\/\/rawl\.rocks\/f\/[^?#]+$/);assert.ok(!urls.has(link.url));urls.add(link.url);
   const record=records.get(link.midiId);assert.ok(record);assert.equal(record.standardIndex,i);assert.equal(record.title,link.title);assert.equal(record.url,link.url);assert.equal(record.slug,link.slug);assert.equal(record.midiHeader,'MThd');assert.ok(record.noteOnCount>0);assert.ok(record.blobBytes>=14);assert.match(record.sha256,/^[a-f0-9]{64}$/);assert.ok(!hashes.has(record.sha256));hashes.add(record.sha256);assert.ok(record.compositionEvidence);
  }
 }
 assert.equal(count,69);assert.equal(standards,34);assert.equal(audit.coverage.renditions,count);assert.equal(audit.coverage.matchedStandards,standards);assert.equal(audit.unverifiedCandidates.length,0);assert.equal(audit.indexCount,4208);
});

test('same-title compositions and unconfirmed title fragments are not linked to jazz standards',()=>{
 for(const i of [4,9,24,29,47,60,69,88,119,127,132,136,165,173,186,195,200,206,207])assert.equal(links.standards[i].length,0,'False composition match at standard '+i);
 assert.equal(links.standards[5].length,1);assert.ok(!links.standards[5][0].title.includes('John_Legend'));
 const excluded=new Set(audit.excluded.map(r=>r.midiId));for(const list of Object.values(links.standards))for(const link of list)assert.ok(!excluded.has(link.midiId));
 assert.ok(audit.excluded.some(r=>r.standardIndex===4&&r.reason.includes('Danny Elfman')));assert.ok(audit.excluded.some(r=>r.standardIndex===47&&r.reason.includes('Kingdom Hearts')));assert.ok(audit.excluded.some(r=>r.standardIndex===189&&r.reason.includes('game soundtrack')));
 assert.ok(audit.reviewCandidates.some(r=>r.standardIndex===200));
});
