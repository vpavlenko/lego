import {RAWL_COLORS} from 'librawl/palette';
const degrees={i:0,ii:2,iii:4,iv:5,v:7,vi:9,vii:11},mod=value=>(value%12+12)%12;
const escape=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const degree=rn=>{const match=/^([b♭#♯]?)([ivIV]+)$/.exec(rn);return match&&degrees[match[2].toLowerCase()]!==undefined?mod(degrees[match[2].toLowerCase()]+(/[b♭]/.test(match[1])?-1:/[#♯]/.test(match[1])?1:0)):null;};
function romanParts(name){
 const result=[],pattern=/(?<![\p{L}\p{N}])([b♭#♯]?[ivIV]+)(?:(?:[°øoΔ](?:7|9|11|13)?)|(?:7|9|11|13)|\(ø\))?(?:\/([b♭#♯]?[ivIV]+))?(?![\p{L}\p{N}])/gu;let end=0;
 for(const match of name.matchAll(pattern)){
  const root=degree(match[1]),target=match[2]?degree(match[2]):0;if(root===null||target===null)continue;
  if(match.index>end)result.push({text:name.slice(end,match.index),degree:null});result.push({text:match[0],degree:mod(root+target)});end=match.index+match[0].length;
 }
 if(end<name.length)result.push({text:name.slice(end),degree:null});return result;
}
const suppliedRoots=context=>Array.isArray(context)?context:context?.nameColorRoots??context?.roots??context?.rootDegrees;
// Balanced 2–3-letter chunks encode representative roots without inserting
// syllable boundaries, spaces, gradients or an invented phonetic analysis.
function wordChunks(word){
 const letters=Array.from(word),count=Math.max(1,Math.ceil(letters.length/2.5)),small=Math.floor(letters.length/count),large=letters.length%count,result=[];let at=0;
 for(let i=0;i<count;i++){const size=small+(i>=count-large?1:0);result.push(letters.slice(at,at+size).join(''));at+=size;}return result;
}
/** With no score context only explicit RNs have colors. A brick's supplied
 * representative root sequence additionally colors mnemonic name chunks,
 * cycling for long names and taking a prefix for short names. This is a visual
 * encoding requested by the user, not a claim that names derive from chords. */
export function brickNameParts(name,rootsOrContext){
 const original=romanParts(name),supplied=suppliedRoots(rootsOrContext),roots=Array.isArray(supplied)?supplied.filter(Number.isInteger).map(mod):[];
 if(!roots.length)return original;
 // Exact user-authored six-chunk association, normally heard in minor.
 const autumn=/\bAutumn\s+Leaves\b/i.test(name),sequence=autumn?[5,10,3,2,7,0]:roots,result=[];let cursor=0;
 const appendPlain=text=>{
  const pattern=autumn?/Autumn\s+Leaves|[\p{L}\p{M}]+/giu:/[\p{L}\p{M}]+/gu;let end=0;
  for(const match of text.matchAll(pattern)){
   if(match.index>end)result.push({text:text.slice(end,match.index),degree:null});
   if(autumn&&/^Autumn\s+Leaves$/i.test(match[0])){
    const matchWords=/^(Autumn)(\s+)(Leaves)$/i.exec(match[0]),left=Array.from(matchWords[1]),right=Array.from(matchWords[3]);
    for(let i=0;i<3;i++)result.push({text:left.slice(i*2,i*2+2).join(''),degree:sequence[i]});result.push({text:matchWords[2],degree:null});
    for(let i=0;i<3;i++)result.push({text:right.slice(i*2,i*2+2).join(''),degree:sequence[i+3]});cursor=6;
   }else for(const chunk of wordChunks(match[0]))result.push({text:chunk,degree:sequence[cursor++%sequence.length]});
   end=match.index+match[0].length;
  }
  if(end<text.length)result.push({text:text.slice(end),degree:null});
 };
 for(const part of original){if(part.degree===null)appendPlain(part.text);else result.push(part);}
 return result;
}
export function brickNameHTML(name,rootsOrContext){return brickNameParts(name,rootsOrContext).map(part=>part.degree===null?escape(part.text):`<span class="brick-degree" data-degree="${part.degree}" style="color:${RAWL_COLORS[part.degree].background}">${escape(part.text)}</span>`).join('');}
