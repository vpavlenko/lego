import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {RawlNotation} from '../packages/rawl-notation/src/RawlNotation.jsx';
import {pitch,mod,chordParts,roman} from '../dist/harmony.mjs';
import {modulationAt} from './music/modulations.mjs';
import {RAWL_COLORS} from '../packages/rawl-notation/src/palette.mjs';

function HostView({song,performance,brickMap,onSeek,onNote,controller,mutedVoices,selected,compact=false,form=null}){
 const [mobile,setMobile]=useState(()=>matchMedia('(max-width:760px)').matches),notation=useRef(null);
 useEffect(()=>{const q=matchMedia('(max-width:760px)'),fn=()=>setMobile(q.matches);q.addEventListener('change',fn);return()=>q.removeEventListener('change',fn);},[]);
 const rows=React.useMemo(()=>form?.aligned&&!compact?form.sections.map(s=>({start:s.start*performance.barBeats,end:s.end*performance.barBeats,section:s.label,style:{gridRow:s.layoutRow+1,gridColumn:`${s.layoutColumn+1} / span ${s.bars}`}})):performance.rows.flatMap(r=>{const out=[],step=(compact||mobile?4:8)*performance.barBeats;for(let start=r.start;start<r.end;start+=step)out.push({start,end:Math.min(r.end,start+step)});return out;}),[performance,mobile,compact,form]);
 useEffect(()=>{controller.current=notation.current;notation.current?.setPosition(controller.position);return()=>{controller.current=null;};});
 const changes=performance.changes;
 const header=row=>song.rows.flatMap(r=>r.bricks.map(b=>({...b,start:(r.startBar+b.start)*performance.barBeats,end:(r.startBar+b.end)*performance.barBeats}))).filter(b=>b.start<row.end&&b.end>row.start).map((b,i)=>{
  const span=row.end-row.start,start=Math.max(row.start,b.start),end=Math.min(row.end,b.end);
  return <a key={`${b.name}-${i}`} className={'rawln-annotation'+(selected===brickMap.get(b.name)?.name?' selected-brick':'')} style={{left:(start-row.start)/span*100+'%',width:(end-start)/span*100+'%'}} href={'#brick/'+brickMap.get(b.name)?.slug+'?song='+song.index+'&beat='+b.start} title={b.name}>{brickMap.get(b.name)?.name??b.name}</a>;
 });
 const footer=row=>{
  const span=row.end-row.start,chords=performance.chords.filter(c=>c.start<row.end&&c.end>row.start);
  const cells=chords.map(c=>{
   const base=modulationAt(changes,c.start).root,parts=chordParts(c.symbol),degree=mod(pitch(c.symbol)-pitch(base));
   return {c,parts,degree,rn:roman(c.symbol,base),style:{left:(Math.max(c.start,row.start)-row.start)/span*100+'%',width:(Math.min(c.end,row.end)-Math.max(c.start,row.start))/span*100+'%',color:RAWL_COLORS[degree].background}};
  });
  return <div className="harmony-stripe">
   <div className="harmony-chords">{cells.map(({c,parts,degree,style})=><div key={c.id} className={'rawln-chord harmony-cell'+(c.clipped?' uncertain':'')} data-degree={degree} style={style} title={c.symbol}><span className="harmony-symbol">{parts.root}<sup>{parts.quality}</sup></span></div>)}</div>
   <div className="harmony-rns">{cells.map(({c,rn,degree,style})=><div key={c.id} className={'rawln-rn harmony-cell'+(c.clipped?' uncertain':'')} data-degree={degree} style={style} title={rn}>{rn}</div>)}</div>
  </div>;
 };
 return <RawlNotation className={form?.aligned&&!compact?'rawln-form':''} style={form?.aligned&&!compact?{gridTemplateColumns:`repeat(${form.columns},minmax(0,1fr))`,minWidth:Math.max(1,form.columns/form.sections[0].bars)*300}:undefined} ref={notation} notes={performance.notes} beats={performance.beats} rows={rows} tonic={0} changes={changes} barBeats={performance.barBeats} mutedVoices={mutedVoices} onSeek={onSeek} onNote={onNote} renderHeader={compact?undefined:header} renderFooter={footer}/>;
}
export function mountRawlView(element,options){
 const root=createRoot(element),controller={current:null,position:null};let props=options;
 const render=()=>root.render(<HostView {...props} controller={controller}/>);render();
 return {setPosition(position){controller.position=position;controller.current?.setPosition(position);},update(next){props={...props,...next};render();},destroy(){root.unmount();controller.current=null;}};
}

const harmonyBindings=new WeakMap();
/** One delegated hover binding for every Rawl and Analysis stripe on a page. */
export function bindHarmonyHover(doc){
 if(harmonyBindings.has(doc))return ()=>{};
 const state={hovered:null,focused:null};
 const stripe=target=>target?.closest?.('.harmony-stripe')??null;
 const update=()=>{if(!state.hovered?.isConnected)state.hovered=null;if(!state.focused?.isConnected)state.focused=null;doc.body.classList.toggle('harmony-rn',!!(state.hovered||state.focused));};
 const over=e=>{state.hovered=stripe(e.target);update();};
 const out=e=>{if(state.hovered===stripe(e.target))state.hovered=stripe(e.relatedTarget);update();};
 const focus=e=>{state.focused=stripe(e.target);update();};
 const blur=e=>{state.focused=stripe(e.relatedTarget);update();};
 for(const [event,fn]of [['pointerover',over],['pointerout',out],['focusin',focus],['focusout',blur]])doc.addEventListener(event,fn);
 const observer=new doc.defaultView.MutationObserver(update);observer.observe(doc.body,{childList:true,subtree:true});
 const destroy=()=>{for(const [event,fn]of [['pointerover',over],['pointerout',out],['focusin',focus],['focusout',blur]])doc.removeEventListener(event,fn);observer.disconnect();doc.body.classList.remove('harmony-rn');harmonyBindings.delete(doc);};
 harmonyBindings.set(doc,destroy);return destroy;
}
