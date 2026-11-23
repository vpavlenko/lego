export const NATURAL = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const LETTERS=['C','D','E','F','G','A','B'];
const FLATS=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export const mod=n=>((n%12)+12)%12;
export function pitch(root){const m=/^([A-G])([b#]*)/.exec(root);return m?mod(NATURAL[m[1]]+[...m[2]].reduce((a,x)=>a+(x==='#'?1:-1),0)):null;}
export function signedInterval(from,to){const n=mod(pitch(to)-pitch(from));return n>6?n-12:n;}
export function transposeRoot(root,tonic){
 const shift=mod(-pitch(tonic));if(!shift)return root;
 const m=/^([A-G])([b#]*)$/.exec(root);if(!m)return root;
 const steps=(7-LETTERS.indexOf(tonic[0]))%7;
 const letter=LETTERS[(LETTERS.indexOf(m[1])+steps)%7];
 const target=mod(pitch(root)+shift);let acc=mod(target-NATURAL[letter]);if(acc>6)acc-=12;
 return Math.abs(acc)>2?FLATS[target]:letter+(acc<0?'b'.repeat(-acc):'#'.repeat(acc));
}
export function transposeChord(chord,tonic){
 return chord.replace(/(^|\/)([A-G][b#]*)/g,(_,sep,root)=>sep+transposeRoot(root,tonic));
}
export function prettyRoot(s){return s.replace(/b/g,'♭').replace(/#/g,'♯');}
export function chordParts(chord){const m=/^([A-G][b#]*)(.*)$/.exec(chord);return m?{root:prettyRoot(m[1]),quality:m[2].replace(/b(?=\d)/g,'♭').replace(/#/g,'♯').replace(/\.{2,}/g,'…')}:{root:chord,quality:''};}
export function romanRoot(root,base='C'){
 if(pitch(root)===null||pitch(base)===null)return root;
 const degree=(LETTERS.indexOf(root[0])-LETTERS.indexOf(base[0])+7)%7;
 const major=[0,2,4,5,7,9,11];let acc=mod(pitch(root)-pitch(base)-major[degree]);if(acc>6)acc-=12;
 return (Math.abs(acc)>2?['I','♭II','II','♭III','III','IV','♯IV','V','♭VI','VI','♭VII','VII'][mod(pitch(root)-pitch(base))]:(acc<0?'♭'.repeat(-acc):'♯'.repeat(acc))+['I','II','III','IV','V','VI','VII'][degree]);
}
export function roman(chord,base='C'){
 if(/^(NC|N\.C\.)$/.test(chord))return '—';
 const m=/^([A-G][b#]*)(.*)$/.exec(chord);if(!m)return chord;
 let root=romanRoot(m[1],base),q=m[2],bass='';
 q=q.replace(/\/([A-G][b#]*)$/,(_,b)=>{bass='/'+romanRoot(b,base);return '';});
 const half=/^(m7b5|ø7?)/.exec(q),dim=/^(o|dim|°)/.exec(q),minor=/^(m(?!aj)|-)/.exec(q);
 if(half){root=root.toLowerCase();q='ø7'+q.slice(half[0].length);}
 else if(dim){root=root.toLowerCase();q='°'+q.slice(dim[0].length);}
 else if(minor){root=root.toLowerCase();q=q.slice(minor[0].length);}
 q=q.replace(/^(M|maj)/,'Δ').replace(/b(?=\d)/g,'♭').replace(/#/g,'♯').replace(/\.{2,}/g,'…');
 return root+q+bass;
}

const CIRCLED_BASS_DEGREES={I:'①',II:'②',III:'③',IV:'④',V:'⑤',VI:'⑥',VII:'⑦'};
export function romanDisplayParts(notation,slashBass){
 const match=slashBass&&/\/([♭♯]*)(I|II|III|IV|V|VI|VII)$/.exec(notation);
 if(!match)return {numeral:notation,bass:null,label:notation};
 const numeral=notation.slice(0,match.index),bass=match[1]+CIRCLED_BASS_DEGREES[match[2]];
 return {numeral,bass,label:numeral+'/'+bass};
}

// Jazz superscripts name sounding chord tones, colored against the current
// notation tonic (the same semantic rule used by Caplin's Roman figures).
export function chordDisplay(chord,base='C'){
 const m=/^([A-G][b#]*)(.*?)(?:\/([A-G][b#]*))?$/.exec(chord);if(!m)return {root:chord,rootSuffix:'',degree:null,figures:[],bass:null};
 const root=pitch(m[1]),q=m[2],reference=pitch(base)??0,minor=/^m(?!aj)|^-/.test(q),diminished=/^(?:o|dim|°)/.test(q),augmented=/aug|\+|#5/.test(q),major7=/(?:M|maj|Δ)(?:7|9|11|13)|^mM/.test(q);
 const interval=(n,altered)=>n===7?(altered?11:diminished?9:major7?11:10):n===3?(altered?4:minor?3:4):n===5?(altered?7:diminished||/m7b5|ø/.test(q)?6:augmented?8:7):({1:0,2:2,4:5,6:9,8:12,9:14,11:17,13:21}[n]??null);
 const rootSuffix=/^(?:mM|m(?!aj)|M(?!aj))/.exec(q)?.[0]??'';
 const figures=[],push=(text,degree=null)=>figures.push({text,degree});
 for(const token of q.slice(rootSuffix.length).matchAll(/([b#♭♯]{0,2})(69|13|11|[1-9])|(?:dim|aug|sus|maj|add|alt|omit|no)|[\s\S]/g)){
  const text=token[0];if(token[2]){for(const digit of token[2]==='69'?['6','9']:[token[2]]){const n=Number(digit),value=interval(n,!!token[1]),offset=[...token[1]].reduce((sum,char)=>sum+('b♭'.includes(char)?-1:1),0);push(prettyRoot(token[1])+digit,value===null?null:mod(root+value+offset-reference));}}
  else if(/^(?:o|dim|°|ø)$/.test(text))push(text==='dim'?'o':text,mod(root+6-reference));
  else if(/^(?:aug|\+)$/.test(text))push(text,mod(root+8-reference));
  else push(text,/[()\/]/.test(text)?null:mod(root-reference));
 }
 return {root:prettyRoot(m[1]),rootSuffix,degree:mod(root-reference),figures,bass:m[3]?{text:prettyRoot(m[3]),degree:mod(pitch(m[3])-reference)}:null};
}
