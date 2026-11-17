import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {RawlNotation} from '../packages/rawl-notation/src/RawlNotation.jsx';
import {pitch,mod,chordParts,roman} from '../dist/harmony.mjs';
import {modulationAt} from './music/modulations.mjs';
import {colorIndex} from '../packages/rawl-notation/src/palette.mjs';

function HostView({song,performance,brickMap,onSeek,onNote,controller,mutedVoices,selected}){
 const [mobile,setMobile]=useState(()=>matchMedia('(max-width:760px)').matches),notation=useRef(null);
 useEffect(()=>{const q=matchMedia('(max-width:760px)'),fn=()=>setMobile(q.matches);q.addEventListener('change',fn);return()=>q.removeEventListener('change',fn);},[]);
 const rows=React.useMemo(()=>performance.rows.flatMap(r=>{const out=[],step=(mobile?4:8)*performance.barBeats;for(let start=r.start;start<r.end;start+=step)out.push({start,end:Math.min(r.end,start+step)});return out;}),[performance,mobile]);
 useEffect(()=>{controller.current=notation.current;notation.current?.setPosition(controller.position);return()=>{controller.current=null;};});
 const changes=performance.changes;
 const header=row=>song.rows.flatMap(r=>r.bricks.map(b=>({...b,start:(r.startBar+b.start)*performance.barBeats,end:(r.startBar+b.end)*performance.barBeats}))).filter(b=>b.start<row.end&&b.end>row.start).map((b,i)=>{
  const span=row.end-row.start,start=Math.max(row.start,b.start),end=Math.min(row.end,b.end);
  return <a key={`${b.name}-${i}`} className={'rawln-annotation'+(selected===b.name?' selected-brick':'')} style={{left:(start-row.start)/span*100+'%',width:(end-start)/span*100+'%'}} href={'#brick/'+brickMap.get(b.name)?.slug} title={b.name}>{b.name}</a>;
 });
 const footer=row=>{
  const span=row.end-row.start,chords=performance.chords.filter(c=>c.start<row.end&&c.end>row.start);
  return <>
   {chords.map(c=>{
    const base=modulationAt(changes,c.start).root,parts=chordParts(c.symbol),degree=mod(pitch(c.symbol)-pitch(base));
    const style={left:(Math.max(c.start,row.start)-row.start)/span*100+'%',width:(Math.min(c.end,row.end)-Math.max(c.start,row.start))/span*100+'%'};
    return <div key={c.id} className={'rawln-chord'+(c.clipped?' uncertain':'')} style={style} title={c.symbol}><div className="rawln-symbol degree-color harmony-band" data-degree={colorIndex(degree)}>{parts.root}<sup>{parts.quality}</sup></div><div className="rawln-rn degree-color harmony-band" data-degree={colorIndex(degree)}>{roman(c.symbol,base)}</div></div>;
   })}

  </>;
 };
 return <RawlNotation ref={notation} notes={performance.notes} beats={performance.beats} rows={rows} tonic={0} changes={changes} barBeats={performance.barBeats} mutedVoices={mutedVoices} onSeek={onSeek} onNote={onNote} renderHeader={header} renderFooter={footer}/>;
}
export function mountRawlView(element,options){
 const root=createRoot(element),controller={current:null,position:null};let props=options;
 const render=()=>root.render(<HostView {...props} controller={controller}/>);render();
 return {setPosition(position){controller.position=position;controller.current?.setPosition(position);},update(next){props={...props,...next};render();},destroy(){root.unmount();controller.current=null;}};
}
