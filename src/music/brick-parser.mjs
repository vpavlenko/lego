import {pitch,mod,roman} from '../../dist/harmony.mjs';
import {parseChord} from './realization.mjs';

const EPS=1e-7;
const display=name=>String(name).replace(/-/g,' ');
const same=(a,b)=>Math.abs(a-b)<EPS;
const json=value=>JSON.stringify(value);
function atoms(text){
 const clean=text.replace(/\/\*[\s\S]*?\*\//g,s=>s.replace(/[^\n]/g,' ')).replace(/\/\/[^\n]*/g,s=>' '.repeat(s.length));
 const tokens=[...clean.matchAll(/\(|\)|[^\s()]+/g)].map(match=>({value:match[0],line:clean.slice(0,match.index).split('\n').length}));let position=0;
 function read(){const token=tokens[position++];if(token.value!=='(')return token;const values=[];while(position<tokens.length&&tokens[position].value!==')')values.push(read());if(position>=tokens.length)throw Error('Unclosed dictionary expression');position++;return values;}
 const forms=[];while(position<tokens.length)forms.push(read());return forms;
}
const value=atom=>Array.isArray(atom)?atom.map(value):atom?.value;
/** Read the actual My.dictionary grammar, retaining source line/qualifier.
 * The explicit equivalence lists are matching families, never substitutions
 * into the source chords or their MIDI realization.
 */
export function parseBrickDictionary(text){
 const definitions=[],equivalences=[],typeCosts={};
 for(const form of atoms(text)){
  if(!Array.isArray(form)||!form.length)continue;const f=value(form);
  if(f[0]==='brick-type')typeCosts[f[1]]=Number(f[2]);
  if(f[0]==='equiv')equivalences.push(f.slice(1).map(symbol=>symbol.replace(/^[A-G][b#]*/,'')));
  if(f[0]!=='defbrick')continue;
  let cursor=2;const qualifier=Array.isArray(f[cursor])?f[cursor++].join(' '):'';
  const mode=f[cursor++],type=f[cursor++],key=f[cursor++],components=[];
  for(const [i,c]of f.slice(cursor).entries()){
   if(!Array.isArray(c)||!['chord','brick'].includes(c[0]))continue;
   let at=2;const subQualifier=Array.isArray(c[at])?c[at++].join(' '):'';
   const root=c[0]==='chord'?pitch(c[1]):pitch(c[at++]);const duration=c[at]==='*'?null:Number(c[at]);
   if(!Number.isFinite(root)||duration!==null&&!(duration>0))throw Error('Invalid component at dictionary line '+form[0].line);
   components.push({kind:c[0],name:c[0]==='brick'?display(c[1]):c[1],qualifier:subQualifier,relativeRoot:mod(root-pitch(key)),duration,line:form[cursor+i]?.[0]?.line??form[0].line});
  }
  definitions.push({id:'dictionary-'+form[0].line,name:display(f[1]),qualifier,mode,type,key,root:pitch(key),line:form[0].line,components});
 }
 return {version:1,definitions,equivalences,typeCosts};
}
function chordData(symbol,qualities){
 const parsed=parseChord(symbol,qualities);if(!parsed)return null;
 return {...parsed,qualityClass:null};
}
/** Conservative nested grammar matching. Unlike Java's 100x-cost fallback
 * for non-scaling durations, this importer requires exact relative timing.
 * Wildcard '*' components allow arbitrary positive duration explicitly.
 */
export function createBrickParser(dictionary,{qualities,maxChordSpan=32,maxResults=512}={}){
 if(!qualities)throw Error('Chord vocabulary required');
 const byName=new Map();for(const definition of dictionary.definitions){const list=byName.get(definition.name)??[];list.push(definition);byName.set(definition.name,list);}
 const classes=new Map();dictionary.equivalences.forEach((group,i)=>group.forEach(q=>classes.set(q,i)));
 function qualityMatch(a,b){
  if(json(a.intervals)===json(b.intervals))return 'exact';
  return classes.has(a.quality)&&classes.get(a.quality)===classes.get(b.quality)?'equivalence':null;
 }
 function parse(chordEvents,{boundaries=[]}={}){
  const chords=chordEvents.map(c=>({...c,parsed:c.clipped?null:chordData(c.symbol,qualities)}));
  for(let i=0;i<chords.length;i++)if(!(chords[i].end>chords[i].start)||i&&chords[i].start<chords[i-1].end-EPS)throw Error('Invalid chord timeline');
  const cache=new Map(),pending=new Set(),diagnostics={cycleGuards:0,truncatedResults:0,maxChordSpan,maxResults};
  function matches(name,start){
   const cacheKey=name+'|'+start;if(cache.has(cacheKey))return cache.get(cacheKey);if(pending.has(cacheKey)){diagnostics.cycleGuards++;return [];}
   pending.add(cacheKey);const results=[];
   for(const definition of byName.get(name)??[]){
    let states=[{next:start,tonic:null,scale:null,penalty:0,proof:[]}];
    for(const component of definition.components){
     const next=[];
     for(const state of states){
      if(state.next>=chords.length||state.next-start>=maxChordSpan)continue;
      let options=[];
      if(component.kind==='chord'){
       const actual=chords[state.next],expected=chordData(component.name,qualities);if(!actual.parsed||!expected)continue;
       const kind=qualityMatch(actual.parsed,expected);if(!kind)continue;
       if(actual.parsed.slash!==expected.slash||expected.slash&&mod(actual.parsed.bass-actual.parsed.root)!==mod(expected.bass-expected.root))continue;
       options=[{next:state.next+1,tonic:actual.parsed.root,start:actual.start,end:actual.end,penalty:kind==='exact'?0:.2,proof:{kind:'chord',symbol:actual.symbol,expected:component.name,match:kind,line:component.line}}];
      }else options=matches(component.name,state.next);
      for(const option of options){
       if(option.next-start>maxChordSpan||state.next>start&&!same(chords[state.next-1].end,option.start))continue;
       const tonic=mod(option.tonic-component.relativeRoot);if(state.tonic!==null&&tonic!==state.tonic)continue;
       const duration=option.end-option.start,scale=component.duration===null?state.scale:duration/component.duration;
       if(component.duration!==null&&state.scale!==null&&!same(scale,state.scale))continue;
       const end=option.end;if(boundaries.some(boundary=>boundary>chords[start].start+EPS&&boundary<end-EPS))continue;
       next.push({next:option.next,tonic,scale,penalty:state.penalty+option.penalty,proof:[...state.proof,option.proof]});
      }
     }
     const unique=new Map();for(const state of next){const key=[state.next,state.tonic,state.scale].join('|'),old=unique.get(key);if(!old||state.penalty<old.penalty)unique.set(key,state);}
     states=[...unique.values()].sort((a,b)=>a.penalty-b.penalty||b.next-a.next||a.tonic-b.tonic);
     if(states.length>maxResults){diagnostics.truncatedResults+=states.length-maxResults;states.length=maxResults;}
     if(!states.length)break;
    }
    if(!definition.components.length)continue;
    for(const state of states)if(state.next>start)results.push({next:state.next,tonic:state.tonic,start:chords[start].start,end:chords[state.next-1].end,penalty:state.penalty,name:definition.name,mode:definition.mode,type:definition.type,definition:{id:definition.id,line:definition.line,qualifier:definition.qualifier},proof:{kind:'brick',name:definition.name,definition:definition.id,line:definition.line,qualifier:definition.qualifier,children:state.proof}});
   }
   pending.delete(cacheKey);cache.set(cacheKey,results);return results;
  }
  const candidates=Array.from({length:chords.length},()=>[]);
  const visible=[...byName].filter(([,defs])=>defs.some(d=>d.type!=='Invisible')).map(([name])=>name);
  for(let start=0;start<chords.length;start++)for(const name of visible)for(const candidate of matches(name,start))if(candidate.type!=='Invisible')candidates[start].push({...candidate,startIndex:start,endIndex:candidate.next,cost:(dictionary.typeCosts[candidate.type]??100)+candidate.penalty});
  const best=Array(chords.length+1).fill(null);best[chords.length]={cost:0,segments:[]};
  for(let start=chords.length-1;start>=0;start--){
   const fallback={kind:'unparsed',start:chords[start].start,end:chords[start].end,startIndex:start,endIndex:start+1,cost:1000};
   for(const candidate of [...candidates[start].sort((a,b)=>a.cost-b.cost||b.endIndex-a.endIndex||a.definition.line-b.definition.line),fallback]){
    const tail=best[candidate.endIndex];if(!tail)continue;const cost=candidate.cost+tail.cost;
    if(!best[start]||cost<best[start].cost-EPS)best[start]={cost,segments:[{kind:'known',...candidate},...tail.segments]};
   }
  }
  return {segments:best[0]?.segments??[],cost:best[0]?.cost??0,candidates:candidates.flat(),diagnostics};
 }
 return {parse,dictionary};
}

function fraction(value,total){const ratio=value/total;for(let d=1;d<=4096;d++){const n=Math.round(ratio*d);if(same(n/d,ratio))return `${n}/${d}`;}return ratio.toPrecision(12);}
function patternFor(chords,qualities){
 const first=chordData(chords[0].symbol,qualities);if(!first)return null;const duration=chords.at(-1).end-chords[0].start;
 const sequence=[];for(const chord of chords){const p=chordData(chord.symbol,qualities);if(!p||chord.clipped)return null;sequence.push([mod(p.root-first.root),p.intervals,p.slash?mod(p.bass-first.root):null,fraction(chord.end-chord.start,duration)]);}
 return {signature:json(sequence),sequence,reference:first.root,duration};
}
function genericCadence(sequence){
 const roots=sequence.map(c=>c[0]),last=roots.at(-1),relative=roots.map(r=>mod(r-last));
 return roots.length===3&&json(relative)===json([2,7,0])||roots.length===4&&json(roots)===json([0,9,2,7])||new Set(roots).size<3;
}
function hash(text){let h=2166136261;for(const char of text)h=Math.imul(h^char.charCodeAt(0),16777619);return(h>>>0).toString(36);}
/** Find exact relative-root/compound-quality/bass/rhythm patterns only inside
 * uncovered spans (single-chord generic On blocks may be replaced). Support
 * counts distinct compositions, so repeated choruses cannot invent a family.
 */
export function discoverRepeatedPatterns(standards,{qualities,minimumStandards=3,minChords=3,maxChords=6,maxPatterns=16}={}){
 const groups=new Map();
 for(const standard of standards){
  const covered=new Set(standard.parse.segments.filter(s=>s.kind==='known'&&!(s.type==='On'&&s.endIndex-s.startIndex===1)).flatMap(s=>Array.from({length:s.endIndex-s.startIndex},(_,i)=>s.startIndex+i)));
  for(let start=0;start<standard.chords.length;start++)for(let length=minChords;length<=maxChords&&start+length<=standard.chords.length;length++){
   const indices=Array.from({length},(_,i)=>start+i);if(indices.some(i=>covered.has(i)))continue;
   const chords=standard.chords.slice(start,start+length);if(chords.some((c,i)=>i&&!same(chords[i-1].end,c.start)))continue;
   const p=patternFor(chords,qualities);if(!p||p.duration<2-EPS||genericCadence(p.sequence))continue;
   const group=groups.get(p.signature)??{...p,matches:[]};group.matches.push({song:standard.index,title:standard.title,composition:standard.normalizedTitle??standard.title,startIndex:start,endIndex:start+length,start:chords[0].start,end:chords.at(-1).end,reference:p.reference});groups.set(p.signature,group);
  }
 }
 const eligible=[...groups.values()].map(g=>({...g,support:new Set(g.matches.map(m=>m.composition)).size})).filter(g=>g.support>=minimumStandards).sort((a,b)=>b.support*b.sequence.length-a.support*a.sequence.length||b.sequence.length-a.sequence.length||a.signature.localeCompare(b.signature));
 const allocated=new Map(),patterns=[];
 for(const group of eligible){
  const matches=[];
  for(const match of group.matches.sort((a,b)=>a.song-b.song||a.start-b.start)){const used=allocated.get(match.song)??new Set();if(Array.from({length:match.endIndex-match.startIndex},(_,i)=>match.startIndex+i).some(i=>used.has(i)))continue;matches.push(match);}
  if(new Set(matches.map(m=>m.composition)).size<minimumStandards)continue;
  const representative=standards.find(s=>s.index===matches[0].song),sourceChords=representative.chords.slice(matches[0].startIndex,matches[0].endIndex),root=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][matches[0].reference],name=sourceChords.map(c=>roman(c.symbol,root)).join(' → ');
  const pattern={id:'discovered-'+hash(group.signature),name,type:'Discovered',referenceBasis:'first-chord-reference',signature:group.signature,sequence:group.sequence,support:new Set(matches.map(m=>m.composition)).size,matches};patterns.push(pattern);
  for(const match of matches){const used=allocated.get(match.song)??new Set();for(let i=match.startIndex;i<match.endIndex;i++)used.add(i);allocated.set(match.song,used);}
  if(patterns.length>=maxPatterns)break;
 }
 return patterns;
}
