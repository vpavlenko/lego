import {RAWL_COLORS} from 'librawl/palette';
const degrees={i:0,ii:2,iii:4,iv:5,v:7,vi:9,vii:11},mod=value=>(value%12+12)%12;
const escape=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const degree=rn=>{const match=/^([b♭#♯]?)([ivIV]+)$/.exec(rn);return match&&degrees[match[2].toLowerCase()]!==undefined?mod(degrees[match[2].toLowerCase()]+(/[b♭]/.test(match[1])?-1:/[#♯]/.test(match[1])?1:0)):null;};
/** Only standalone Roman numerals carry pitch meaning; numbers in pattern
 * names count repetitions/chords and proper-name letters remain grayscale. */
export function brickNameParts(name){
 const result=[],pattern=/(?<![\p{L}\p{N}])([b♭#♯]?[ivIV]+)(?:[°øo](?:7)?|7)?(?:\/([b♭#♯]?[ivIV]+))?(?![\p{L}\p{N}])/gu;let end=0;
 for(const match of name.matchAll(pattern)){
  const root=degree(match[1]),target=match[2]?degree(match[2]):0;if(root===null||target===null)continue;
  if(match.index>end)result.push({text:name.slice(end,match.index),degree:null});result.push({text:match[0],degree:mod(root+target)});end=match.index+match[0].length;
 }
 if(end<name.length)result.push({text:name.slice(end),degree:null});return result;
}
export function brickNameHTML(name){return brickNameParts(name).map(part=>part.degree===null?escape(part.text):`<span class="brick-degree" data-degree="${part.degree}" style="color:${RAWL_COLORS[part.degree].background}">${escape(part.text)}</span>`).join('');}
