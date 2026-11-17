import React,{forwardRef,useImperativeHandle,useLayoutEffect,useMemo,useRef} from 'react';
import {pitchRange,staveGeometry,tonalSegments,tonalLines,tonicAt,mod,NOTE_HEIGHT,keyMarkers,TONIC_NAMES,modulationLabelOffset} from './geometry.mjs';
import {RAWL_COLORS} from './palette.mjs';

const names=['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const noteName=p=>names[mod(p)]+(Math.floor(p/12)-1);

/** A host-independent Rawl score. Times are quarter-note beats, pitches MIDI. */
export const RawlNotation=forwardRef(function RawlNotation({notes,beats,rows,tonic=0,changes=[],barBeats=4,hideInitialTonic=false,position=null,mutedVoices=[],onSeek,onNote,onNoteHover,onMeasureSelect,selectedMeasure=null,renderHeader,renderFooter,className='',style},ref){
 const root=useRef(null),noteElements=useRef(new Map()),hoveredId=useRef(null);
 const spans=rows?.length?rows:[{start:0,end:beats,label:1}];
 const markers=useMemo(()=>keyMarkers(tonic,changes),[tonic,changes]);
 const prepared=useMemo(()=>spans.map(row=>{
  const visible=notes.filter(n=>n.start<row.end-1e-6&&n.start+n.duration>row.start+1e-6),range=pitchRange(visible),axis=staveGeometry(range);
  return {row,visible,range,axis,regions:tonalSegments(tonic,changes,row.start,row.end)};
 }),[notes,rows,beats,tonic,changes]);
 function updateNote(item){
  const {el,baseTop}=item,muted=mutedVoices.includes(item.note.voice),height=muted?.5:NOTE_HEIGHT*(item.active||item.hover?2:1);
  el.style.height=height+'px';el.style.top=(muted?baseTop+NOTE_HEIGHT-height:baseTop-(height-NOTE_HEIGHT))+'px';
  el.style.boxShadow=muted?'':'0 0 0px 0.5px black';
 }
 function setPosition(beat){
  for(const item of noteElements.current.values()){const {el,note,row}=item;item.active=Number.isFinite(beat)&&beat>=row.start&&beat<row.end&&beat>=note.start&&beat<note.start+note.duration&&!mutedVoices.includes(note.voice);el.classList.toggle('rawln-sounding',item.active);updateNote(item);}
 }
 useImperativeHandle(ref,()=>({setPosition,element:root.current}),[prepared,mutedVoices]);
 useLayoutEffect(()=>{setPosition(position);},[position,prepared,mutedVoices]);
 return <div className={'rawln'+(className?' '+className:'')} style={style} ref={root}>
  {prepared.map(({row,visible,range,axis,regions},ri)=>{
   const span=row.end-row.start,x=beat=>(beat-row.start)/span*100;
   const bars=[];for(let beat=Math.ceil((row.start-1e-6)/barBeats)*barBeats;beat<row.end-1e-6;beat+=barBeats)bars.push(beat);
   return <div className="rawln-row" data-section={row.section} key={`${row.start}-${row.end}`} data-start={row.start} data-end={row.end} style={row.style}>
    {renderHeader&&<div className="rawln-header">{renderHeader(row)}</div>}
    <div className="rawln-score" role="group" aria-label="Rawl notation" style={{height:axis.notesBottom}} onClick={e=>{const box=e.currentTarget.getBoundingClientRect();if(box.width>0)onSeek?.(row.start+Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*span);}}>
     <div className="rawln-grid" aria-hidden="true">
      {regions.flatMap((region,i)=>tonalLines(range,axis,region.tonic).map((line,j)=><div key={`${i}-${j}`} data-tonic={region.tonic} className={`rawln-${line.kind}-line`} style={{left:x(region.start)+'%',width:(region.end-region.start)/span*100+'%',top:line.y}}/>))}
      {bars.map(beat=><div className="rawln-bar" key={beat} style={{left:x(beat)+'%'}}/>)}
     </div>
     <div className="rawln-modulations">
      {markers.filter(m=>m.beat>=row.start&&m.beat<row.end&&m.delta!==0&&!(hideInitialTonic&&m.previousTonic===null)).map(m=><div key={m.beat} className="rawln-modulation" data-beat={m.beat} data-tonic={m.tonic} data-join={m.join?m.name:undefined} style={{left:x(m.beat)+'%'}} title={m.name}>
       {m.delta!==null&&<div className="rawln-modulation-flag" data-degree={mod(m.delta)} style={{background:RAWL_COLORS[mod(m.delta)].background}}/>}
       <span className="rawln-modulation-label" style={{left:modulationLabelOffset(m.beat,barBeats)}}>
        {m.delta!==null&&<><svg viewBox="0 0 24 24" aria-hidden="true">{m.delta<0?<><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></>:<><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></>}</svg>{Math.abs(m.delta)} </>}{TONIC_NAMES[m.tonic]}
       </span>
      </div>)}
     </div>
     <div className="rawln-measure-labels" aria-hidden={onMeasureSelect?undefined:true}>
      {bars.map(beat=>{const hasFlag=markers.some(m=>m.beat===beat&&m.delta!==null&&m.delta!==0);return <span className="rawln-measure-number" role={onMeasureSelect?'button':undefined} tabIndex={onMeasureSelect?0:undefined} aria-pressed={onMeasureSelect?selectedMeasure===beat:undefined} onClick={onMeasureSelect?e=>{e.stopPropagation();onMeasureSelect(beat);}:undefined} onKeyDown={onMeasureSelect?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onMeasureSelect(beat);}}:undefined} key={beat} data-beat={beat} data-modulation={hasFlag?'true':undefined} style={{left:x(beat)+'%',color:selectedMeasure===beat?'red':hasFlag?'black':undefined,pointerEvents:onMeasureSelect?'auto':undefined,cursor:onMeasureSelect?'pointer':undefined}}>{Math.round(beat/barBeats)+1}</span>;})}
     </div>
     {visible.map(note=>{
      const start=Math.max(row.start,note.start),end=Math.min(row.end,note.start+note.duration),degree=mod(note.pitch-tonicAt(tonic,changes,note.start+note.duration/2)),color=RAWL_COLORS[degree];
      return <button key={`${note.id}-${ri}`} ref={el=>{const key=`${note.id}-${ri}`;if(el)noteElements.current.set(key,{el,note,row,baseTop:axis.pitchToY(note.pitch),active:false,hover:hoveredId.current===key});else noteElements.current.delete(key);}} type="button" tabIndex={-1} aria-label={noteName(note.pitch)} title={noteName(note.pitch)} data-note={note.id} data-pitch={note.pitch} data-degree={degree} data-voice={note.voice} className={`rawln-note rawln-voice-${note.voice}${mutedVoices.includes(note.voice)?' rawln-muted':''}`} style={{left:x(start)+'%',top:axis.pitchToY(note.pitch),width:(end-start)/span*100+'%',height:NOTE_HEIGHT,background:color.background,zIndex:100+(84-note.pitch)+(note.voice===1?128:0)}} onMouseEnter={()=>{const item=noteElements.current.get(`${note.id}-${ri}`);hoveredId.current=`${note.id}-${ri}`;if(item){item.hover=true;updateNote(item);}onNoteHover?.(note);}} onMouseLeave={()=>{const item=noteElements.current.get(`${note.id}-${ri}`);hoveredId.current=null;if(item){item.hover=false;updateNote(item);}onNoteHover?.(null);}} onClick={e=>{e.stopPropagation();onNote?.(note);}}>
       {color.dot&&<i aria-hidden="true" style={{width:color.dot.size,height:color.dot.size,background:color.dot.color}}/>}
      </button>;
     })}
    </div>
    {renderFooter&&<div className="rawln-footer">{renderFooter(row)}</div>}
   </div>;
  })}
 </div>;
});
export {pitchRange,staveGeometry,modulationLabelOffset} from './geometry.mjs';
export {RAWL_COLORS} from './palette.mjs';
