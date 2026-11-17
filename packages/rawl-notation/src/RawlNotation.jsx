import React,{forwardRef,useImperativeHandle,useLayoutEffect,useMemo,useRef} from 'react';
import {pitchRange,staveGeometry,tonalSegments,tonalLines,tonicAt,mod,NOTE_HEIGHT} from './geometry.mjs';
import {RAWL_COLORS} from './palette.mjs';

const names=['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const noteName=p=>names[mod(p)]+(Math.floor(p/12)-1);

/** A host-independent Rawl score. Times are quarter-note beats, pitches MIDI. */
export const RawlNotation=forwardRef(function RawlNotation({notes,beats,rows,tonic=0,changes=[],barBeats=4,position=null,mutedVoices=[],onSeek,onNote,renderHeader,renderFooter},ref){
 const root=useRef(null),noteElements=useRef(new Map()),playheads=useRef([]);
 const spans=rows?.length?rows:[{start:0,end:beats,label:1}];
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
  playheads.current.forEach((el,i)=>{if(!el)return;const row=prepared[i].row,active=Number.isFinite(beat)&&beat>=row.start&&beat<row.end;el.hidden=!active;if(active)el.style.left=(beat-row.start)/(row.end-row.start)*100+'%';});
  for(const item of noteElements.current.values()){const {el,note,row}=item;item.active=Number.isFinite(beat)&&beat>=row.start&&beat<row.end&&beat>=note.start&&beat<note.start+note.duration&&!mutedVoices.includes(note.voice);el.classList.toggle('rawln-sounding',item.active);updateNote(item);}
 }
 useImperativeHandle(ref,()=>({setPosition,element:root.current}),[prepared,mutedVoices]);
 useLayoutEffect(()=>{setPosition(position);},[position,prepared,mutedVoices]);
 return <div className="rawln" ref={root}>
  {prepared.map(({row,visible,range,axis,regions},ri)=>{
   const span=row.end-row.start,x=beat=>(beat-row.start)/span*100;
   const bars=[];for(let beat=Math.ceil((row.start-1e-6)/barBeats)*barBeats;beat<row.end-1e-6;beat+=barBeats)bars.push(beat);
   return <div className="rawln-row" key={`${row.start}-${row.end}`} data-start={row.start} data-end={row.end}>
    {renderHeader&&<div className="rawln-header">{renderHeader(row)}</div>}
    <div className="rawln-score" role="group" aria-label="Rawl notation" style={{height:axis.notesBottom}} onClick={e=>{const box=e.currentTarget.getBoundingClientRect();if(box.width>0)onSeek?.(row.start+Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*span);}}>
     <div className="rawln-grid" aria-hidden="true">
      {regions.flatMap((region,i)=>tonalLines(range,axis,region.tonic).map((line,j)=><div key={`${i}-${j}`} className={`rawln-${line.kind}-line`} style={{left:x(region.start)+'%',width:(region.end-region.start)/span*100+'%',top:line.y}}/>))}
      {bars.map(beat=><div className="rawln-bar" key={beat} style={{left:x(beat)+'%'}}><span>{Math.round(beat/barBeats)+1}</span></div>)}
     </div>
     {visible.map(note=>{
      const start=Math.max(row.start,note.start),end=Math.min(row.end,note.start+note.duration),degree=mod(note.pitch-tonicAt(tonic,changes,note.start+note.duration/2)),color=RAWL_COLORS[degree];
      return <button key={`${note.id}-${ri}`} ref={el=>{const key=`${note.id}-${ri}`;if(el)noteElements.current.set(key,{el,note,row,baseTop:axis.pitchToY(note.pitch),active:false,hover:false});else noteElements.current.delete(key);}} type="button" tabIndex={-1} aria-label={noteName(note.pitch)} title={noteName(note.pitch)} data-note={note.id} data-pitch={note.pitch} data-degree={degree} data-voice={note.voice} className={`rawln-note rawln-voice-${note.voice}${mutedVoices.includes(note.voice)?' rawln-muted':''}`} style={{left:x(start)+'%',top:axis.pitchToY(note.pitch),width:(end-start)/span*100+'%',height:NOTE_HEIGHT,background:color.background,zIndex:100+(84-note.pitch)}} onMouseEnter={()=>{const item=noteElements.current.get(`${note.id}-${ri}`);if(item){item.hover=true;updateNote(item);}}} onMouseLeave={()=>{const item=noteElements.current.get(`${note.id}-${ri}`);if(item){item.hover=false;updateNote(item);}}} onClick={e=>{e.stopPropagation();onNote?.(note);}}>
       {color.dot&&<i aria-hidden="true" style={{width:color.dot.size,height:color.dot.size,background:color.dot.color}}/>}
      </button>;
     })}
     <div className="rawln-playhead" ref={el=>{playheads.current[ri]=el;}} hidden aria-hidden="true"/>
    </div>
    {renderFooter&&<div className="rawln-footer">{renderFooter(row)}</div>}
   </div>;
  })}
 </div>;
});
export {pitchRange,staveGeometry} from './geometry.mjs';
export {RAWL_COLORS} from './palette.mjs';
