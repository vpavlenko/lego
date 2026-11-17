import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseMidi} from 'midi-file';
import {encodeMidi} from '../src/music/midi.mjs';
import {sourceMeasureMap} from '../src/music/measure-map.mjs';

test('reviewed return routes copy whole source events and reject unreviewed cuts or source changes',()=>{
 const script=String.raw`
import sys,copy
sys.path.insert(0,sys.argv[1])
from openbook_navigation import apply_navigation_plan
e={'provenance':{'path':'fixture.ly','sha256':'pinned','sourceVersion':'Real','compilerNavigationMarks':[{'text':'Fine','start':7,'duration':1}]},'totalBeats':8,'bars':2,'notes':[{'pitch':60,'start':0,'duration':2,'velocity':90},{'pitch':62,'start':4,'duration':4,'velocity':90}],'chords':[{'symbol':'C','start':0,'end':4},{'symbol':'G7','start':4,'end':8}],'measures':[{'sourceNumber':'1','start':0,'duration':4},{'sourceNumber':'2','start':4,'duration':4}]}
p={'sourcePath':'fixture.ly','sourceSha256':'pinned','sourceVersion':'Real','linearTotalBeats':8,'playbackRanges':[[0,8],[0,4]],'playbackTotalBeats':12,'compilerLandmarks':[{'pattern':'Fine','end':8}]}
r=apply_navigation_plan(e,p)
assert [(n['pitch'],n['start'],n['duration']) for n in r['notes']]==[(60,0,2),(62,4,4),(60,8,2)]
assert [m['sourceNumber'] for m in r['measures']]==['1','2','3']
assert r['provenance']['reviewedNavigation']['trace'][1]['sourceEventIndexes']['notes']==[0]
for bad in [dict(p,sourceSha256='other'),dict(p,compilerLandmarks=[{'pattern':'Coda','at':4}]),dict(p,playbackRanges=[[0,6]],playbackTotalBeats=6)]:
 try: apply_navigation_plan(e,bad)
 except ValueError: pass
 else: raise AssertionError('unsafe route accepted')
cross=copy.deepcopy(e);cross['notes'][0]['duration']=5
try: apply_navigation_plan(cross,p)
except ValueError: pass
else: raise AssertionError('source note cropped')
`;
 const result=spawnSync(process.env.MELODY_PYTHON??'/opt/homebrew/bin/python3.11',['-c',script,new URL('../scripts/',import.meta.url).pathname],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});

test('repeated pickups require exact pinned partial events and full-measure counts',()=>{
 const measures=[{start:0,duration:1.5,sourceNumber:'0',meter:[4,4],beatBeats:1},{start:1.5,duration:4,sourceNumber:'1',meter:[4,4],beatBeats:1},{start:5.5,duration:1.5,sourceNumber:'0',meter:[4,4],beatBeats:1},{start:7,duration:4,sourceNumber:'2',meter:[4,4],beatBeats:1}];
 const entry={bars:4,barBeats:4,totalBeats:11,pickupBeats:1.5,sourceFullMeasureCount:2,measures,provenance:{format:'LilyPond',path:'fixture.ly',sha256:'pinned',sourceVersion:'Real',repeatedPartialReview:{sourcePath:'fixture.ly',sourceSha256:'pinned',sourceVersion:'Real',partialEvents:[{start:0,duration:1.5},{start:5.5,duration:1.5}]}}};
 assert.deepEqual(sourceMeasureMap(entry),measures);
 for(const change of [e=>e.sourceFullMeasureCount++,e=>e.provenance.repeatedPartialReview.partialEvents.pop(),e=>e.measures[2].start++,e=>e.measures[2].beatBeats=2]){const bad=structuredClone(entry);change(bad);assert.throws(()=>sourceMeasureMap(bad));}
 const xml=structuredClone(entry);delete xml.provenance.repeatedPartialReview;xml.provenance.format='MusicXML';xml.provenance.musicXmlMeasureReview={sourceSha256:'pinned',member:'fixture.ly',measures:structuredClone(measures)};assert.throws(()=>sourceMeasureMap(xml),/unreviewed-midscore-pickup/);
});

test('opt-in MIDI resolution preserves source grace onsets while default exports stay at 480 PPQ',()=>{
 const p={title:'Fixture',tempo:120,meter:[4,4],beats:4,notes:[{id:'melody',voice:1,pitch:60,start:1/384,duration:5/384,velocity:90}],chords:[]};
 assert.equal(parseMidi(encodeMidi(p)).header.ticksPerBeat,480);
 const midi=parseMidi(encodeMidi({...p,midiPPQ:1920}));assert.equal(midi.header.ticksPerBeat,1920);
 const ticks=[];for(const track of midi.tracks){let at=0;for(const e of track){at+=e.deltaTime;if(e.type==='noteOn'||e.type==='noteOff')ticks.push(at);}}
 assert.deepEqual(ticks,[5,30]);
 assert.throws(()=>encodeMidi({...p,midiPPQ:32768}));
});

test('all 486 earlier performances and MIDI files remain byte-identical after reviewed source admissions',()=>{
 const root=new URL('../',import.meta.url),audit=JSON.parse(fs.readFileSync(new URL('evidence/reviewed-melody-preservation.json',root)));
 for(const [key,dir]of [['performance','dist/data/performances/'],['midi','dist/midi/']]){assert.equal(Object.keys(audit.hashes[key]).length,486);for(const [name,hash]of Object.entries(audit.hashes[key]))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(dir+name,root))).digest('hex'),hash,name);}
});
