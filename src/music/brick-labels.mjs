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
/** Assign each representative root once across all plain-name letters.
 * A short name samples the supplied sequence evenly, including its endpoints.
 * Spaces, counts and punctuation never acquire a pitch color. */
export function brickNameParts(name,rootsOrContext){
 const original=romanParts(name),supplied=suppliedRoots(rootsOrContext),roots=Array.isArray(supplied)?supplied.filter(Number.isInteger).map(mod):[];
 if(!roots.length)return original;
 const isLetter=char=>/[\p{L}\p{M}]/u.test(char),letters=original.filter(part=>part.degree===null).reduce((sum,part)=>sum+Array.from(part.text).filter(isLetter).length,0);
 if(!letters)return original;
 const selected=roots.length>letters?Array.from({length:letters},(_,i)=>roots[letters===1?0:Math.round(i*(roots.length-1)/(letters-1))]):roots;
 const small=Math.floor(letters/selected.length),large=letters%selected.length,letterDegrees=[];
 selected.forEach((root,i)=>{for(let n=0;n<small+(i>=selected.length-large?1:0);n++)letterDegrees.push(root);});
 // Preserve the exact user-authored Au/tu/mn Le/av/es association. Added
 // prefixes/suffixes extend its endpoint colors instead of repeating events.
 const autumn=/\bAutumn(\s+)Leaves\b/i.exec(name),autumnRoots=[5,10,3,2,7,0],leavesStart=autumn?autumn.index+6+autumn[1].length:0;
 const result=[];let letter=0,position=0;
 const append=(text,degree)=>{const previous=result.at(-1);if(previous&&previous.degree===degree)previous.text+=text;else result.push({text,degree});};
 for(const part of original){
  if(part.degree!==null){result.push({...part});position+=part.text.length;continue;}
  for(const char of part.text){
   if(!isLetter(char))append(char,null);
   else{
    let value=letterDegrees[letter++];
    if(autumn)value=position<autumn.index?autumnRoots[0]:position<autumn.index+6?autumnRoots[Math.floor((position-autumn.index)/2)]:position<leavesStart+6?autumnRoots[3+Math.floor((position-leavesStart)/2)]:autumnRoots.at(-1);
    append(char,value);
   }
   position+=char.length;
  }
 }
 return result;
}
export function brickNameHTML(name,rootsOrContext){return brickNameParts(name,rootsOrContext).map(part=>part.degree===null?escape(part.text):`<span class="brick-degree" data-degree="${part.degree}" style="color:${RAWL_COLORS[part.degree].background}">${escape(part.text)}</span>`).join('');}
