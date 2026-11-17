import {slugify} from './bricks.mjs';

const roles=['Approach','Cadence','Launcher'];
const clipped=name=>/\.{2,}|…/.test(name);
const tidy=name=>name.replace(/\s+/g,' ').trim();
function suffix(name){let h=2166136261;for(const c of name)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(36);}
function stripTail(name){
 const withTail=/^(.*?)\s+with\s+(?:Dropback|Overrun)$/.exec(name);if(withTail)return withTail[1];
 const at=name.indexOf('+');if(at<0)return name;
 const tail=name.slice(at+1).trim();
 // Keep internal grammar combinations such as Pullback+Cadence and
 // On Off On +Dropback IV Major; only terminal adjuncts fold into a core.
 return /^(?:(?:Dominant\s+)?Overrun|Dropback|On|\.{1,}|…)?$/.test(tail)?name.slice(0,at).trim():name;
}
function coreName(name,byLabel){
 let core=stripTail(tidy(name));core=byLabel.get(core)?.name??core;
 if(roles.includes(core))return 'Cadence';
 for(const role of roles){
  if(!core.endsWith(' '+role))continue;
  const stem=core.slice(0,-role.length).trim();
  // A named role family is meaningful; a grammatical destination such as
  // "Pullback to Cadence" remains its complete pattern identity.
  if(stem&&!/\b(?:to|with)$/i.test(stem))return stem;
 }
 return core;
}
function representative(members,name){
 const score=b=>(clipped(b.name)?1000:0)+(/[+] |\+| with /i.test(b.name)?100:0)+(b.name.endsWith(' Cadence')||b.name==='Cadence'?0:b.name===name?5:b.name.endsWith(' Approach')?10:b.name.endsWith(' Launcher')||b.name==='Launcher'?20:30);
 return [...members].sort((a,b)=>score(a)-score(b)||a.name.localeCompare(b.name))[0];
}

/** A learner layer over the source-preserving brick index. No source names,
 * passages, or role distinctions are deleted from the underlying data. */
export function buildLearnerBrickIndex(sourceIndex){
 const source=[...sourceIndex.bricks].sort((a,b)=>a.name.localeCompare(b.name)),byLabel=new Map(source.flatMap(b=>[b.name,...b.aliases].map(label=>[label,b])));
 const familyByName=new Map(source.map(b=>[b.name,coreName(b.name,byLabel)]));
 const knownFamilies=new Set(source.filter(b=>!clipped(b.name)).map(b=>familyByName.get(b.name)));
 for(const b of source){
  const initial=familyByName.get(b.name);if(!clipped(initial))continue;
  const prefix=tidy(stripTail(b.name).replace(/(?:\.{1,}|…)$/,''));
  const candidates=new Set(source.filter(other=>!clipped(other.name)&&other.name.startsWith(prefix)).map(other=>familyByName.get(other.name)));
  if(candidates.size===1){familyByName.set(b.name,[...candidates][0]);continue;}
  // A shortened terminal role can be resolved once its named family exists,
  // even if the matching complete Approach label was never printed in full.
  const split=prefix.lastIndexOf(' '),stem=prefix.slice(0,split),fragment=prefix.slice(split+1);
  if(split>0&&fragment.length>=2&&roles.some(role=>role.startsWith(fragment))&&knownFamilies.has(stem))familyByName.set(b.name,stem);
 }
 const buckets=new Map();for(const b of source){const name=familyByName.get(b.name);if(!buckets.has(name))buckets.set(name,[]);buckets.get(name).push(b);}
 const reserved=new Map();
 for(const b of source)for(const slug of [b.slug,...b.aliasSlugs]){const family=familyByName.get(b.name);if(reserved.has(slug)&&reserved.get(slug)!==family)throw Error('Conflicting source route '+slug);reserved.set(slug,family);}
 const used=new Set(),bricks=[];
 for(const [name,members]of [...buckets].sort((a,b)=>a[0].localeCompare(b[0]))){
  let slug=slugify(name);if(used.has(slug)||(reserved.has(slug)&&reserved.get(slug)!==name))slug+='-'+suffix(name);while(used.has(slug)||(reserved.has(slug)&&reserved.get(slug)!==name))slug+='x';used.add(slug);
  const aliases=[...new Set(members.flatMap(b=>[b.name,...b.aliases]))].filter(alias=>alias!==name).sort((a,b)=>a.localeCompare(b));
  const sourceNames=members.map(b=>b.name),sourceSlugs=members.map(b=>b.slug),aliasSlugs=[...new Set(members.flatMap(b=>[b.slug,...b.aliasSlugs]))].filter(old=>old!==slug).sort();
  const matches=new Map();
  for(const b of members)for(const match of b.standards){if(!matches.has(match.song))matches.set(match.song,{song:match.song,title:match.title,passages:[]});for(const passage of match.passages)matches.get(match.song).passages.push({...passage});}
  const standards=[...matches.values()].sort((a,b)=>a.song-b.song);for(const match of standards)match.passages.sort((a,b)=>a.start-b.start||a.end-b.end||a.row-b.row||a.label.localeCompare(b.label));
  const passages=standards.reduce((n,match)=>n+match.passages.length,0),chosen=representative(members,name);
  bricks.push({name,slug,aliases,aliasSlugs,standards,passages,clipped:members.every(b=>b.clipped),sourceNames,sourceSlugs,representativeName:chosen.name});
 }
 return {version:3,sourceLabels:sourceIndex.sourceLabels,totalStandards:sourceIndex.totalStandards,sourceBricks:source.length,bricks};
}
