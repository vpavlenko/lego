import {sliceMeasureMap} from './measure-map.mjs';
export function slugify(name){return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\+/g,' plus ').replace(/[…]|\.{2,}/g,' clipped ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'brick';}
function suffix(name){let h=2166136261;for(const c of name)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36);}
export function buildBrickIndex(songs){
 const byName=new Map(),slugs=new Set();
 const sourceLabels=[...new Set(songs.flatMap(s=>s.rows.flatMap(r=>r.bricks.map(b=>b.name))))],labels=[...new Set(sourceLabels.map(brickIdentity))].sort((a,b)=>a.localeCompare(b));
 const oldSlugs=new Map(),oldUsed=new Set();
 const historical=new Set(songs.filter(song=>song.image&&song.page).flatMap(song=>song.rows.flatMap(row=>row.bricks.map(brick=>brick.name))));
 const routeOrder=historical.size?[...sourceLabels.filter(name=>historical.has(name)).sort((a,b)=>a.localeCompare(b)),...sourceLabels.filter(name=>!historical.has(name)).sort((a,b)=>a.localeCompare(b))]:[...sourceLabels].sort((a,b)=>a.localeCompare(b));
 for(const name of routeOrder){let slug=slugify(name);if(oldUsed.has(slug))slug+='-'+suffix(name);oldUsed.add(slug);oldSlugs.set(name,slug);}
 const reserved=new Map([...oldSlugs].map(([name,slug])=>[slug,brickIdentity(name)]));
 for(const name of labels){let slug=oldSlugs.get(name)||slugify(name);if(slugs.has(slug)||(reserved.has(slug)&&reserved.get(slug)!==name))slug+='-'+suffix(name);while(slugs.has(slug)||(reserved.has(slug)&&reserved.get(slug)!==name))slug+='x';slugs.add(slug);const aliases=sourceLabels.filter(n=>n!==name&&brickIdentity(n)===name).sort((a,b)=>a.localeCompare(b)),aliasSlugs=[...new Set([oldSlugs.get(name),...aliases.map(n=>oldSlugs.get(n))].filter(s=>s&&s!==slug))];byName.set(name,{slug,name,aliases,aliasSlugs,standards:[],passages:0,clipped:/…|\.{2,}/.test(name)});}
 for(const song of songs){
  const matches=new Map(),barBeats=song.meter[0]*4/song.meter[1];
  song.rows.forEach((row,ri)=>row.bricks.forEach(b=>{
   const name=brickIdentity(b.name);if(!matches.has(name))matches.set(name,[]);
   matches.get(name).push({row:ri,label:b.name,startBar:row.startBar+b.start,endBar:row.startBar+b.end,start:(row.startBar+b.start)*barBeats,end:(row.startBar+b.end)*barBeats});
  }));
  for(const [name,passages]of matches){const entry=byName.get(name);entry.standards.push({song:song.index,title:song.title,passages});entry.passages+=passages.length;}
 }
 return {version:2,sourceLabels:sourceLabels.length,totalStandards:songs.length,bricks:[...byName.values()]};
}

// Use a real roadmap passage, preserving its chords and local key. Prefer the
// longest fully legible passage, so row continuations do not win over a full one.
export function brickExample(brick,songs){
 const candidates=brick.standards.flatMap(match=>match.passages.map(p=>{
  const song=songs.find(s=>s.index===match.song),row=song.rows[p.row],start=p.startBar-row.startBar,end=p.endBar-row.startBar;
  return {song,row,start,end,passage:p,clipped:row.chords.some(c=>c.clipped&&c.start<end&&c.end>start)};
 }));
 candidates.sort((a,b)=>Number(a.clipped)-Number(b.clipped)||(b.end-b.start)-(a.end-a.start)||a.song.index-b.song.index);
 const {song,row,start,end,passage}=candidates[0],key=row.keys.find(k=>start>=k.start-1e-6&&start<k.end-1e-6)||{root:song.tonic[0],mode:song.tonic[1]};
 const slice=items=>items.filter(x=>x.start<end&&x.end>start).map(x=>({...x,start:Math.max(x.start,start)-start,end:Math.min(x.end,end)-start}));
 const keys=slice(row.keys);if(!keys.length||keys[0].start>0)keys.unshift({...key,start:0,end:keys[0]?.start??end-start});
 const previewSong={index:song.index,title:brick.name,tonic:[key.root,key.mode],meter:song.meter,bars:end-start,columns:end-start,...sliceMeasureMap(song,passage.startBar,passage.endBar),rows:[{startBar:0,bars:end-start,keys,chords:slice(row.chords),bricks:[{start:0,end:end-start,name:brick.name}],joins:row.joins.filter(j=>j.at>start&&j.at<end).map(j=>({...j,at:j.at-start}))}]};
 return {previewSong,source:{song:song.index,title:song.title,...passage}};
}
import {brickIdentity} from './brick-aliases.mjs';
export {brickIdentity} from './brick-aliases.mjs';
