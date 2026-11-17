import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BRICK_ALIASES,brickIdentity} from '../src/music/brick-aliases.mjs';
import {buildBrickIndex} from '../src/music/bricks.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const {songs}=read('../dist/data/roadmaps.json'),audit=read('../evidence/typography-audit.json');
const sourceLabels=new Set(songs.flatMap(s=>s.rows.flatMap(r=>r.bricks.map(b=>b.name))));
const natural={C:0,D:2,E:4,F:5,G:7,A:9,B:11},pc=root=>{const m=/^([A-G])([b#]*)/.exec(root);return (natural[m[1]]+[...m[2]].reduce((n,c)=>n+(c==='#'?1:-1),0)+24)%12;};

test('typography audit inventories all source labels and passages without semantic fuzzy matching',()=>{
 const source=fs.readFileSync(new URL('../src/music/brick-aliases.mjs',import.meta.url),'utf8'),literalKeys=[...source.matchAll(/^\s+(['"])(.*?)\1\s*:/gm)].map(m=>m[2]);assert.equal(literalKeys.length,new Set(literalKeys).size,'No duplicate literal aliases');
 assert.equal(audit.sourceLabelCount,sourceLabels.size);assert.equal(sourceLabels.size,354);assert.equal(audit.sourcePassageCount,songs.reduce((n,s)=>n+s.rows.reduce((n,r)=>n+r.bricks.length,0),0));
 assert.deepEqual(new Set(audit.inventory.map(i=>i.label)),sourceLabels);assert.equal(new Set([...sourceLabels].map(brickIdentity)).size,299);assert.equal(audit.canonicalCountAfter,299);assert.equal(audit.addedAliases.length,31);
 for(const [alias,target]of Object.entries(BRICK_ALIASES)){assert.ok(sourceLabels.has(alias));assert.equal(BRICK_ALIASES[target],undefined,'No transitive aliases');assert.equal(brickIdentity(alias),target);}
});

test('every added alias has its original passages, OCR readings, and structural comparisons recorded',()=>{
 for(const entry of audit.addedAliases){
  assert.equal(brickIdentity(entry.alias),entry.canonical);assert.ok(entry.reason);assert.ok(entry.dictionary.length);assert.equal(entry.comparisons.length,entry.occurrences);
  for(const {source,exactComparisons,scaledComparisons}of entry.comparisons){
   const song=songs[source.song],row=song.rows[source.row];assert.ok(row.bricks.some(b=>b.name===entry.alias&&row.startBar+b.start===source.startBar&&row.startBar+b.end===source.endBar));assert.ok(source.readings.length);assert.ok(source.chords.length);
   for(const c of source.chords){assert.ok(c.duration>0);assert.ok(c.tones?.length);}
   for(const match of exactComparisons)assert.equal(match.fingerprint,source.exact);
   for(const match of scaledComparisons)assert.equal(match.fingerprint,source.scaled);
  }
 }
});

test('yen and missing IV strokes resolve to IV while preserving visible modifiers',()=>{
 const expected={'I¥ n Back':'IV n Back','I¥ n Bauble':'IV n Bauble','I¥ n Bird':'IV n Bird','I¥ n Bird SPOT':'IV n Bird SPOT','I¥ n Hack + Dropback':'IV n Hack + Dropback','I¥ n Mack':'IV n Mack','I¥ n Yak To':'IV n Yak To','IiVn Bird +...':'IV n Bird +...','Tol¥Vn Yak +...':'To IV n Yak +...','TolVn Back +...':'To IV n Back +...','TolVn Mack +...':'To IV n Mack +...','Vn Bird SPOT +...':'IV n Bird SPOT +...','Vn Hack +...':'IV n Hack +...','Wn Yak +...':'IV n Yak +...'};
 for(const [alias,target]of Object.entries(expected))assert.equal(brickIdentity(alias),target);
 const back=audit.addedAliases.find(a=>a.alias==='I¥ n Back');assert.equal(back.comparisons.filter(c=>c.exactComparisons.length).length,7);
 for(const {source}of back.comparisons){const first=pc(source.chords[0].symbol);assert.deepEqual(source.chords.map(c=>(pc(c.symbol)-first+12)%12),[0,1,7]);}
 assert.notEqual(brickIdentity('I¥ n Bird'),brickIdentity('IiVn Bird +...'));assert.notEqual(brickIdentity('IV n Hack + Dropback'),brickIdentity('Vn Hack +...'));
});

test('Roman glyph repairs preserve the degree accidental and mode supported by actual chord roots',()=>{
 const offsets={'On Off Major #1V':6,'On Off Major bil':1,'On Off Major bill':3,'On Off Major Ill':4,'On Off Major Vil':11,'On Off Minor #1V':6,'On Off Minor bil':1,'On Off Minor blll':3};
 for(const [label,degree]of Object.entries(offsets))for(const {source}of audit.addedAliases.find(a=>a.alias===label).comparisons){assert.equal((pc(source.chords[1].symbol)-pc(source.chords[0].symbol)+12)%12,degree,label);}
 assert.equal(brickIdentity('Diatonic I II iii II'),'Diatonic I ii iii ii');assert.equal(brickIdentity('Diatonic I IV iii II'),'Diatonic I IV iii ii');assert.notEqual(brickIdentity('On Off Minor bil'),brickIdentity('On Off Major bil'));
});

test('structure matches do not conflate hidden modifiers, explicit extension qualities, or functions',()=>{
 for(const label of ['Minor...','Straight...','Straigh...','Nowhere...','Yardbir...','Chromatic Minor...','Diatonic I II iii IV + Overrun'])assert.equal(brickIdentity(label),label);
 assert.notEqual(brickIdentity('Minor Dropback'),brickIdentity('Minor Dropback +...'));
 assert.notEqual(brickIdentity('Straight Cadence with Dropback'),brickIdentity('Straight Cadence + Dropback'));
 const preserved=audit.preservedSemanticPairs.find(p=>p.left==='Straight Cadence with Dropback');assert.deepEqual(preserved.leftExamples[0].chords.at(-1).tones,[0,3,7,10]);assert.deepEqual(preserved.rightExamples[0].chords.at(-1).tones,[0,4,7,10]);
 assert.ok(audit.crossIdentityStructureCollisionsKeptDistinct.some(c=>c.identities.some(i=>i.name==='Straight Approach')&&c.identities.some(i=>i.name==='Straight Launcher')));assert.notEqual(brickIdentity('Straight Approach'),brickIdentity('Straight Launcher'));
});

test('all original 354 brick routes retain their identity and sharp-IV cannot steal natural-IV',()=>{
 const bricks=buildBrickIndex(songs).bricks,routes=new Map();
 for(const brick of bricks)for(const slug of [brick.slug,...brick.aliasSlugs]){
  assert.ok(!routes.has(slug)||routes.get(slug)===brick.name,'Route collision: '+slug+' / '+routes.get(slug)+' / '+brick.name);routes.set(slug,brick.name);
 }
 assert.equal(audit.inventory.length,354);assert.equal(new Set(audit.inventory.map(i=>i.legacySlug)).size,354);
 for(const original of audit.inventory)assert.equal(routes.get(original.legacySlug),brickIdentity(original.label),original.label+' @ '+original.legacySlug);
 const sharp=bricks.find(b=>b.name==='On Off Major #IV'),natural=bricks.find(b=>b.name==='On Off Major IV');assert.ok(sharp&&natural);assert.notEqual(sharp.slug,natural.slug);assert.equal(routes.get(sharp.slug),sharp.name);assert.equal(routes.get(natural.slug),natural.name);
 // This route was disambiguated in the original 354-label catalogue, before
 // any merge; do not regenerate its expected value using today's slug code.
 const oldClipped=audit.inventory.find(i=>i.label==='Straight Launc...');assert.equal(oldClipped.legacySlug,'straight-launc-clipped-10lq4m0');assert.equal(routes.get(oldClipped.legacySlug),'Straight Launcher');
});
