import {pitch,mod} from '../../dist/harmony.mjs';

const EPS=1e-7;
const degrees=['I','♭II','II','♭III','III','IV','♯IV','V','♭VI','VI','♭VII','VII'];
const titleOrder=(a,b)=>a.title.localeCompare(b.title)||a.index-b.index;
const formAt=(forms,index)=>(forms.forms??forms)[index];

/** The B-entry source key area can begin before B. Require actual coverage;
 * neither a later key label nor the root of B's first chord replaces it.
 */
export function aabaBEntryKey(song,form){
 const at=form?.sections?.[2]?.start;if(!Number.isFinite(at))return null;
 const candidates=(song.rows??[]).flatMap((row,ri)=>(row.keys??[]).map(key=>({...key,start:row.startBar+key.start,end:row.startBar+key.end,row:ri}))).filter(key=>key.start<=at+EPS&&key.end>at+EPS);
 candidates.sort((a,b)=>b.start-a.start||b.row-a.row||a.root.localeCompare(b.root));
 const key=candidates[0],tonic=pitch(song.tonic?.[0]??'');
 if(!key||!Number.isFinite(pitch(key.root))||!Number.isFinite(tonic)||!key.mode)return null;
 const degree=mod(pitch(key.root)-tonic),mode=String(key.mode).toLowerCase(),numeral=mode==='minor'?degrees[degree].toLowerCase():degrees[degree];
 return {key:`b-key:${degree}:${mode}`,label:`${numeral} ${mode}`,degree,mode};
}

function coveredDuration(spans){
 let total=0,start=null,end=null;
 for(const [a,b]of [...spans].sort((x,y)=>x[0]-y[0]||x[1]-y[1])){
  if(start===null){start=a;end=b;}else if(a<=end+EPS)end=Math.max(end,b);else{total+=end-start;start=a;end=b;}
 }
 return total+(start===null?0:end-start);
}
/** Canonical families in the first 75% of the first A, with their actual
 * clipped span duration. Repeated/overlapping aliases count once per family.
 */
export function aabaACoreBricks(song,form,brickMap=new Map()){
 const section=form?.sections?.[0];if(!section||!(section.end>section.start))return [];
 const start=section.start,end=start+(section.end-start)*.75,groups=new Map();
 for(const row of song.rows??[])for(const brick of row.bricks??[]){
  const a=Math.max(start,row.startBar+brick.start),b=Math.min(end,row.startBar+brick.end);if(b<=a+EPS||!brick.name)continue;
  const name=brickMap.get(brick.name)?.name??brick.name,spans=groups.get(name)??[];spans.push([a,b]);groups.set(name,spans);
 }
 return [...groups].map(([name,spans])=>({name,duration:coveredDuration(spans),first:Math.min(...spans.map(s=>s[0]))})).sort((a,b)=>a.name.localeCompare(b.name));
}

/** Exclusive sidebar partitions. Document frequency is calculated across all
 * AABA songs passed in: callers should group the complete catalogue before
 * applying a search filter, so a song's representative does not change while
 * searching. Returns the original song objects without mutating input data.
 */
export function groupAABA(songs,forms,brickMap=new Map(),mode='b-key'){
 const members=songs.filter(song=>formAt(forms,song.index)?.family==='AABA'),cores=new Map(),frequency=new Map();
 if(mode==='a-brick')for(const song of members){
  const candidates=aabaACoreBricks(song,formAt(forms,song.index),brickMap);cores.set(song.index,candidates);
  for(const candidate of candidates)frequency.set(candidate.name,(frequency.get(candidate.name)??0)+1);
 }
 const groups=new Map();
 for(const song of members){
  let descriptor;
  if(mode==='a-brick'){
   const candidates=[...(cores.get(song.index)??[])].sort((a,b)=>(frequency.get(b.name)??0)-(frequency.get(a.name)??0)||b.duration-a.duration||a.first-b.first||a.name.localeCompare(b.name));
   if(candidates.length)descriptor={key:'a-brick:'+candidates[0].name,label:candidates[0].name};
  }else descriptor=aabaBEntryKey(song,formAt(forms,song.index));
  descriptor??={key:'other',label:'Other'};
  const group=groups.get(descriptor.key)??{...descriptor,songs:[]};group.songs.push(song);groups.set(descriptor.key,group);
 }
 return [...groups.values()].sort((a,b)=>b.songs.length-a.songs.length||(a.degree??99)-(b.degree??99)||String(a.mode??'').localeCompare(String(b.mode??''))||a.label.localeCompare(b.label)).map(({mode,...group})=>({...group,songs:[...group.songs].sort(titleOrder)}));
}
