import * as React from 'react';
export interface MidiNote { id:string; pitch:number; start:number; duration:number; voice:number; velocity?:number; }
export interface ScoreRow { start:number; end:number; label?:number; }
export interface TonicChange { beat:number; tonic:number; }
export interface RawlNotationHandle { setPosition(beat:number|null):void; element:HTMLDivElement|null; }
export interface RawlNotationProps {
 notes:MidiNote[]; beats:number; rows?:ScoreRow[]; tonic?:number; changes?:TonicChange[];
 barBeats?:number; position?:number|null; mutedVoices?:number[];
 onSeek?:(beat:number)=>void; onNote?:(note:MidiNote)=>void;
 renderHeader?:(row:ScoreRow)=>React.ReactNode; renderFooter?:(row:ScoreRow)=>React.ReactNode;
}
export const RawlNotation:React.ForwardRefExoticComponent<RawlNotationProps & React.RefAttributes<RawlNotationHandle>>;
export function pitchRange(notes:MidiNote[],span?:ScoreRow|null,fallback?:{low:number;high:number}):{low:number;high:number};
export function staveGeometry(range:{low:number;high:number},options?:{above?:number;transpose?:number}):{low:number;high:number;noteTop:number;noteHeight:number;notesBottom:number;guideTop:number;markerTop:number;pitchToY:(pitch:number)=>number};
export const RAWL_COLORS:ReadonlyArray<{background:string;foreground:string;dot?:{color:string;size:number}}>;
