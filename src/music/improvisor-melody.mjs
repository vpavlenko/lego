import {pitch,mod} from '../../dist/harmony.mjs';

// Source semantics: Impro-Visor 550bbb554962249aceb0e82a72142e3e5b3c0d4a,
// Duration.java132-281, NoteSymbol.java163-255/609-631, PitchClass.java115-136.
export function parseImprovisorDuration(text=''){
 if(!text)return 60;
 if(text==='0')return 0;
 if(!/^\d+(?:\/\d+)?\.*(?:[+u]\d+(?:\/\d+)?\.*)*$/.test(text))throw Error('Unsupported note duration: '+text);
 let duration=0;
 for(const term of text.split(/[+u]/)){
  const match=/^(\d+)(?:\/(\d+))?(\.*)$/.exec(term),denominator=Number(match[1]),tuplet=Number(match[2]??1);
  if(!denominator||!tuplet)throw Error('Zero duration divisor');
  let value=Math.floor(480*(tuplet>1?tuplet-1:1)/(denominator*tuplet)),increment=value;
  for(const dot of match[3]){increment=Math.floor(increment/2);value+=increment;}
  duration+=value;
 }
 if(duration<=0)throw Error('Duration below source slot resolution');return duration;
}
export function parseImprovisorMelody(tokens,{velocity=127,transpose=0}={}){
 const notes=[],rests=[],sourceTokens=[];let slots=0;
 for(const token of tokens){
  if(token==='|')continue;
  if(/^v-?\d+$/i.test(token)){velocity=Math.min(127,Math.max(0,Number(token.slice(1))));continue;}
  const m=/^([a-gr])([#bs]?)([+u-]*)(.*)$/i.exec(token);if(!m)throw Error('Unsupported melody token: '+token);
  const base=m[1].toLowerCase(),accidental=m[2].toLowerCase(),duration=parseImprovisorDuration(m[4]),start=slots/120;
  if(base==='r'){
   if(accidental||m[3])throw Error('Invalid rest token: '+token);rests.push({start,duration:duration/120});
  }else if(duration){
   const pc=mod({c:0,d:2,e:4,f:5,g:7,a:9,b:11}[base]+(accidental==='#'||accidental==='s'?1:accidental==='b'?-1:0)),octave=[...m[3]].reduce((n,c)=>n+(c==='-'?-1:1),0),midi=60+pc+12*octave+transpose;
   if(midi<0||midi>127)throw Error('Pitch outside MIDI range');notes.push({pitch:midi,start,duration:duration/120,velocity});
  }
  sourceTokens.push({token,start,duration:duration/120});slots+=duration;
 }
 return {notes,rests,totalBeats:slots/120,sourceTokens};
}

// The existing scripts/corpus.py reader uses the same s-expression grammar.
// Keep source spans here so parenthesized tune-title text is not flattened away.
export function readImprovisorLeadsheet(text){
 const clean=text.replace(/\/\*[\s\S]*?\*\//g,s=>s.replace(/[^\n]/g,' ')).replace(/\/\/[^\n]*/g,s=>' '.repeat(s.length)),tokens=[...clean.matchAll(/\(|\)|[^\s()]+/g)].map(m=>({value:m[0],start:m.index,end:m.index+m[0].length}));let cursor=0;
 function form(){
  const token=tokens[cursor++];if(token.value!== '(')return token;
  const children=[];while(cursor<tokens.length&&tokens[cursor].value!==')')children.push(form());
  if(cursor===tokens.length)throw Error('Unclosed source form');const close=tokens[cursor++];return {children,start:token.start,end:close.end};
 }
 const forms=[];while(cursor<tokens.length)forms.push(form());
 const tag=node=>node.children?.[0]?.value;
 const content=node=>clean.slice(node.children[0].end,node.end-1).trim();
 const metadata={},parts=[],styles=[];let part=null;
 for(const node of forms){
  if(tag(node)==='part'){
   const fields={};for(const item of node.children.slice(1))if(item.children?.length)fields[tag(item)]=content(item);
   part={metadata:fields,tokens:[],start:node.start,bodyStart:node.end};parts.push(part);
  }else if(node.children){
   if(tag(node)==='style')styles.push(content(node));
   if(!part)metadata[tag(node)]=content(node);
   else if(['section','phrase'].includes(tag(node)))part.tokens.push({directive:tag(node),source:content(node)});
  }else if(part)part.tokens.push(node.value);
 }
 const chordPart=parts.find(p=>p.metadata.type==='chords'),meter=(metadata.meter??'4 4').split(/\s+/).map(Number),barBeats=meter[0]*4/meter[1];
 if(!chordPart||meter.length!==2||!Number.isFinite(barBeats)||barBeats<=0)throw Error('Missing chord part or meter');
 const bars=[];let current=[];
 for(const token of chordPart.tokens){if(typeof token!=='string')continue;if(token==='|'){if(current.length)bars.push(current);current=[];}else current.push(token);}
 if(current.length)bars.push(current);
 const chords=[];let previous=null;
 for(let bar=0;bar<bars.length;bar++)for(let i=0;i<bars[bar].length;i++){
  const token=bars[bar][i],start=(bar+i/bars[bar].length)*barBeats,end=(bar+(i+1)/bars[bar].length)*barBeats;
  if(token==='/'){if(!previous)throw Error('Chord slash without predecessor');chords.at(-1).end=end;}
  else{if(!/^(?:[A-G][^\s|]*|NC)$/.test(token))throw Error('Unsupported chord token: '+token);const event={symbol:token,start,end};chords.push(event);previous=event;}
 }
 return {metadata,meter,barBeats,bars:bars.length,totalBeats:bars.length*barBeats,chords,parts,styles};
}
export function isExplicitHead(part){return part.metadata.type==='melody'&&/^head(?:\b|[, ])/i.test(part.metadata.title??'');}
export function improvisorTonic(score){
 const chords=score.chords.filter(c=>/^[A-G]/.test(c.symbol)),parsed=chords.map(c=>({root:pitch(c.symbol),quality:c.symbol.replace(/^[A-G][b#]*/,''),duration:c.end-c.start,symbol:c.symbol})),minor=q=>/^m(?!aj)|^-/.test(q),dominant=q=>/^(?:7|9|11|13)/.test(q),major=q=>!minor(q)&&!/^(?:o|dim|sus)/.test(q),rootText=c=>/^([A-G][b#]*)/.exec(c.symbol)[1],last=parsed.at(-1),first=parsed[0],fifths=Number(score.metadata.key??0),keyMajor=mod(fifths*7),keyMinor=mod(keyMajor+9);
 if(!last)return {tonic:null,confidence:'unknown',basis:'No pitched chord'};
 const previous=parsed.at(-2);
 // A recurring initial I followed by a closing ii–V identifies a written
 // instrumental key even when the saved key-signature field is still zero.
 if(first&&previous&&dominant(last.quality)&&minor(previous.quality)&&mod(previous.root-last.root)===7&&mod(first.root-last.root)===5&&major(first.quality))return {tonic:[rootText(first),'Major'],confidence:'high',basis:'Recurring initial major tonic and closing ii–V; source key field retained separately'};
 for(let i=parsed.length-1;i>=2;i--){const tonic=parsed[i],v=parsed[i-1],ii=parsed[i-2];if(!dominant(tonic.quality)&&major(tonic.quality)&&dominant(v.quality)&&mod(v.root-tonic.root)===7&&minor(ii.quality)&&mod(ii.root-tonic.root)===2&&i>=parsed.length-3)return {tonic:[rootText(tonic),'Major'],confidence:'high',basis:'Final ii–V–I chord cadence; source key field retained separately'};}
 const lastTonic=[...parsed].reverse().find(c=>(c.root===keyMajor&&major(c.quality))||(c.root===keyMinor&&minor(c.quality)));
 if(lastTonic&&(lastTonic===last||first?.root===lastTonic.root||parsed.indexOf(lastTonic)>=parsed.length-3))return {tonic:[rootText(lastTonic),minor(lastTonic.quality)?'Minor':'Major'],confidence:'high',basis:'Source key signature agrees with tonic-quality chord at start or cadence'};
 return {tonic:[['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][keyMajor],'Major'],confidence:'estimated',basis:'Source key signature major reference; mode not asserted by the source'};
}
