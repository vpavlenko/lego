import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {RawlNotation,RawlMeasureHeader} from 'librawl';
import {pitch,mod,chordParts,chordDisplay,roman} from '../dist/harmony.mjs';
import {modulationAt} from './music/modulations.mjs';
import {notationRows} from './music/notation-rows.mjs';
import {brickNameParts} from './music/brick-labels.mjs';
import {RAWL_COLORS} from 'librawl/palette';
import {melodyDisplay} from './music/melody-display.mjs';
import {performedNotes} from './music/performance-style.mjs';

function HostView({song,performance,brickMap,onSeek,onNote,onNoteHover,onMeasureSelect,selectedMeasure=null,controller,mutedVoices,selected,compact=false,form=null,measureWidth=null,barsPerRow=null,continuous=false}){
 const [mobile,setMobile]=useState(()=>matchMedia('(max-width:760px)').matches),notation=useRef(null);
 const display=React.useMemo(()=>melodyDisplay(performedNotes(performance)),[performance.notes,performance.playbackStyle,performance.measureMap,performance.beats]);
 const sourceById=React.useMemo(()=>new Map(performance.notes.map(n=>[n.id,n])),[performance.notes]);
 const sourceNote=note=>note?sourceById.get(note.id)??note:null;
 useEffect(()=>{const q=matchMedia('(max-width:760px)'),fn=()=>setMobile(q.matches);q.addEventListener('change',fn);return()=>q.removeEventListener('change',fn);},[]);
 const rows=React.useMemo(()=>notationRows({song,performance,form,compact,mobile,measureWidth,barsPerRow,continuous}),[song,performance,form,compact,mobile,measureWidth,barsPerRow,continuous]);
 useEffect(()=>{controller.current=notation.current;notation.current?.setPosition(controller.position);return()=>{controller.current=null;};});
 const changes=performance.changes,offset=performance.clockOffset??0,phraseStarts=React.useMemo(()=>offset?form?.phraseStarts?.map(beat=>beat+offset):form?.phraseStarts,[form?.phraseStarts,offset]);
 const header=row=>song.rows.flatMap(r=>r.bricks.map(b=>({...b,sourceStart:(r.startBar+b.start)*performance.barBeats,start:(r.startBar+b.start)*performance.barBeats+offset,end:(r.startBar+b.end)*performance.barBeats+offset}))).filter(b=>b.start<row.end&&b.end>row.start).map((b,i)=>{
  const span=row.end-row.start,start=Math.max(row.start,b.start),end=Math.min(row.end,b.end);
  return <a key={`${b.name}-${i}`} data-brick-start={b.start} data-brick-end={b.end} data-brick={brickMap.get(b.name)?.slug} className={'rawln-annotation'+(selected===brickMap.get(b.name)?.name?' selected-brick':'')} style={{left:(start-row.start)/span*100+'%',width:(end-start)/span*100+'%'}} href={'#brick/'+brickMap.get(b.name)?.slug+'?song='+song.index+'&beat='+b.sourceStart} title={b.name}>{brickNameParts(brickMap.get(b.name)?.name??b.name,brickMap.get(b.name)).map((part,i)=><span key={i} data-degree={part.degree??undefined} style={part.degree===null?undefined:{color:RAWL_COLORS[part.degree].background}}>{part.text}</span>)}</a>;
 });
 const footer=(row,{changes=performance.changes}={})=>{
  const span=row.end-row.start,chords=performance.chords.filter(c=>c.start<row.end&&c.end>row.start);
  const cells=chords.map(c=>{
   const base=modulationAt(changes,c.start).root,parts=chordParts(c.symbol),degree=mod(pitch(c.symbol)-pitch(base));
   return {c,parts,display:chordDisplay(c.symbol,base),degree,rn:roman(c.symbol,base),style:{left:(Math.max(c.start,row.start)-row.start)/span*100+'%',width:(Math.min(c.end,row.end)-Math.max(c.start,row.start))/span*100+'%',color:RAWL_COLORS[degree].background}};
  });
  return <div className="harmony-stripe">
   <div className="harmony-chords">{cells.map(({c,parts,display,degree,style})=><div key={c.id} className={'rawln-chord harmony-cell'+(c.clipped?' uncertain':'')} data-degree={degree} style={style} title={c.symbol}><span className="harmony-symbol">{display.root}<sup>{display.figures.map((figure,i)=><span key={i} className="chord-figure" data-degree={figure.degree??undefined} style={{color:figure.degree===null?'#888':RAWL_COLORS[figure.degree].background}}>{figure.text}</span>)}</sup>{display.bass&&<><span className="chord-slash">/</span><span className="chord-bass" data-degree={display.bass.degree} style={{color:RAWL_COLORS[display.bass.degree].background}}>{display.bass.text}</span></>}</span></div>)}</div>
   <div className="harmony-rns">{cells.map(({c,rn,display,degree,style})=><div key={c.id} className={'rawln-rn harmony-cell'+(c.clipped?' uncertain':'')} data-degree={degree} style={style} title={rn}>{display?.bass?<>{rn.slice(0,rn.lastIndexOf('/'))}<span className="chord-slash">/</span><span className="chord-bass" data-degree={display.bass.degree} style={{color:RAWL_COLORS[display.bass.degree].background}}>{rn.slice(rn.lastIndexOf('/')+1)}</span></>:rn}</div>)}</div>
  </div>;
 };
 return <RawlNotation className={(form?.layoutAligned??form?.aligned)&&!compact?'rawln-form':''} style={(form?.layoutAligned??form?.aligned)&&!compact?{gridTemplateColumns:`repeat(${form.layoutColumns??form.columns},minmax(0,1fr))`,minWidth:Math.max(1,(form.layoutColumns??form.columns)/(form.layoutSections??form.sections)[0].bars)*300}:undefined} ref={notation} notes={display.notes} beats={performance.beats} rows={rows} tonic={0} changes={changes} barBeats={performance.barBeats} beatBeats={4/(song.meter?.[1]??4)} phraseStarts={phraseStarts} measureMap={performance.measureMap} hideInitialTonic={compact} mutedVoices={mutedVoices} onSeek={onSeek} onNote={note=>onNote?.(sourceNote(note))} onNoteAudition={note=>onNote?.(sourceNote(note))} onNoteHover={note=>onNoteHover?.(sourceNote(note))} onMeasureSelect={onMeasureSelect} selectedMeasure={selectedMeasure} renderHeader={compact?undefined:header} renderFooter={footer}/>;
}
export function mountRawlView(element,options){
 const root=createRoot(element),controller={current:null,position:null};let props=options;
 const render=()=>root.render(<HostView {...props} controller={controller}/>);render();
 return {setPosition(position){controller.position=position;controller.current?.setPosition(position);},update(next){props={...props,...next};render();},destroy(){root.unmount();controller.current=null;}};
}

export function mountRawlMeasureHeader(element,options){
 const root=createRoot(element);root.render(<RawlMeasureHeader {...options}/>);
 return {destroy(){root.unmount();}};
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
