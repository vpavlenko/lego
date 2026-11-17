import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {RawlNotation} from '../packages/rawl-notation/src/RawlNotation.jsx';
import {pitch,mod,transposeChord,transposeRoot,prettyRoot,chordParts,roman} from '../dist/harmony.mjs';
import {colorIndex} from '../packages/rawl-notation/src/palette.mjs';

function Token({children,degree}){return <span className="degree-color" data-degree={colorIndex(degree)}>{children}</span>;}
const Arrow=({delta})=><svg viewBox="0 0 24 24" aria-hidden="true">{delta<0?<><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></>:<><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></>}</svg>;
function HostView({song,performance,brickMap,rnMode,onSeek,onNote,controller,mutedVoices,selected}){
 const [mobile,setMobile]=useState(()=>matchMedia('(max-width:760px)').matches),notation=useRef(null);
 useEffect(()=>{const q=matchMedia('(max-width:760px)'),fn=()=>setMobile(q.matches);q.addEventListener('change',fn);return()=>q.removeEventListener('change',fn);},[]);
 const rows=React.useMemo(()=>performance.rows.flatMap(r=>{const out=[],step=(mobile?4:8)*performance.barBeats;for(let start=r.start;start<r.end;start+=step)out.push({start,end:Math.min(r.end,start+step)});return out;}),[performance,mobile]);
 useEffect(()=>{controller.current=notation.current;notation.current?.setPosition(controller.position);return()=>{controller.current=null;};});
 const changes=rnMode==='brick'?performance.changes:[];
 const header=row=>song.rows.flatMap(r=>r.bricks.map(b=>({...b,start:(r.startBar+b.start)*performance.barBeats,end:(r.startBar+b.end)*performance.barBeats}))).filter(b=>b.start<row.end&&b.end>row.start).map((b,i)=>{
  const span=row.end-row.start,start=Math.max(row.start,b.start),end=Math.min(row.end,b.end);
  return <a key={`${b.name}-${i}`} className={'rawln-annotation'+(selected===b.name?' selected-brick':'')} style={{left:(start-row.start)/span*100+'%',width:(end-start)/span*100+'%'}} href={'#brick/'+brickMap.get(b.name)?.slug} title={b.name}>{b.name}</a>;
 });
 const footer=row=>{
  const span=row.end-row.start,chords=performance.chords.filter(c=>c.start<row.end&&c.end>row.start),joins=song.rows.flatMap(r=>r.joins.map(j=>({...j,beat:(r.startBar+j.at)*performance.barBeats}))).filter(j=>j.beat>row.start&&j.beat<=row.end);
  return <>
   {chords.map(c=>{
    const sourceRow=song.rows[c.row],sourceCell=sourceRow.chords.find(x=>Math.abs((sourceRow.startBar+x.start)*performance.barBeats-c.start)<.001),key=sourceRow.keys.find(k=>sourceCell?.start>=k.start-.001&&sourceCell.start<k.end-.001)||sourceRow.keys[0];
    const base=rnMode==='brick'?transposeRoot(key.root,song.tonic[0]):'C',parts=chordParts(c.symbol),degree=mod(pitch(c.symbol)-pitch(base));
    const style={left:(Math.max(c.start,row.start)-row.start)/span*100+'%',width:(Math.min(c.end,row.end)-Math.max(c.start,row.start))/span*100+'%'};
    return <div key={c.id} className={'rawln-chord'+(c.clipped?' uncertain':'')} style={style} title={c.symbol}><div><Token degree={degree}>{parts.root}</Token><sup>{parts.quality}</sup></div><div className="rawln-rn"><Token degree={degree}>{roman(c.symbol,base)}</Token></div></div>;
   })}
   {joins.map((j,i)=><a key={i} className="rawln-join degree-color" data-degree={colorIndex(j.delta)} href={'#'+String(song.index).padStart(3,'0')+'?beat='+(j.beat+(performance.source?.start||0))} style={{left:`clamp(14px, ${(j.beat-row.start)/span*100}%, calc(100% - 14px))`}} title={j.name}><Arrow delta={j.delta}/><span>{Math.abs(j.delta)}</span></a>)}
  </>;
 };
 return <RawlNotation ref={notation} notes={performance.notes} beats={performance.beats} rows={rows} tonic={0} changes={changes} barBeats={performance.barBeats} mutedVoices={mutedVoices} onSeek={onSeek} onNote={onNote} renderHeader={header} renderFooter={footer}/>;
}
export function mountRawlView(element,options){
 const root=createRoot(element),controller={current:null,position:null};let props=options;
 const render=()=>root.render(<HostView {...props} controller={controller}/>);render();
 return {setPosition(position){controller.position=position;controller.current?.setPosition(position);},update(next){props={...props,...next};render();},destroy(){root.unmount();controller.current=null;}};
}
