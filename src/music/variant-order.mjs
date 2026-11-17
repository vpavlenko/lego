// Presentation ordering only. Definitions, IDs and MIDI data remain untouched.
const EPS=1e-10;
const compareText=(a,b)=>a<b?-1:a>b?1:0;
const mod=n=>(n%12+12)%12;
function compareValue(a,b){
 if(Array.isArray(a)&&Array.isArray(b)){for(let i=0;i<Math.min(a.length,b.length);i++){const next=compareValue(a[i],b[i]);if(next)return next;}return a.length-b.length;}
 if(typeof a==='number'&&typeof b==='number')return a-b;
 return compareText(String(a),String(b));
}
function rational(text){const [n,d='1']=String(text??0).split('/').map(Number);return d?n/d:0;}
function describe(variant){
 const chords=(variant.structure?.chords??[]).map(chord=>{
  const [root,quality,bass]=chord.harmony??[null,[],null];
  return {root:root===null?null:mod(root),quality:Array.isArray(quality)?[...new Set(quality)].sort((a,b)=>a-b):String(quality),bass:bass==null?null:mod(bass),at:rational(chord.at),duration:rational(chord.duration)};
 });
 const harmony=chords.map(chord=>[chord.root,chord.quality,chord.bass]);
 const keys=(variant.structure?.keys??[]).map(([at,root,mode])=>[rational(at),mod(root),String(mode).toLowerCase()]);
 const complexity=[chords.length,chords.reduce((n,c)=>n+(Array.isArray(c.quality)?c.quality.length:100),0),chords.filter(c=>c.bass!==null).length,keys.length];
 const semantic=[complexity,harmony,chords.map(c=>[c.at,c.duration]),keys];
 return {variant,chords,harmony,keys,complexity,semantic};
}
const semanticCompare=(a,b)=>compareValue(a.semantic,b.semantic)||compareText(String(a.variant.id??''),String(b.variant.id??''));
function intervalDifference(a,b){
 if(!Array.isArray(a)||!Array.isArray(b))return a===b?0:1;
 const union=new Set([...a,...b]);if(!union.size)return 0;
 const intersection=a.filter(n=>b.includes(n)).length;return 1-intersection/union.size;
}
function chordDifference(a,b,{rhythm=true}={}){
 const root=a.root===b.root?0:1.25;
 const quality=.4*intervalDifference(a.quality,b.quality);
 const bass=a.bass===b.bass?0:.15;
 // Register-aware intervals intentionally retain 2 versus 14, etc.
 const time=rhythm?.12*(Math.abs(a.at-b.at)+Math.abs(a.duration-b.duration)):0;
 return root+quality+bass+time;
}
/** Weighted edit alignment: insert/delete a chord = 1; same-root quality,
 * extension and slash-bass changes cost less than replacing its root.
 * Ties prefer matching/substitution, then deletion, then insertion.
 */
function align(a,b,{rhythm=true}={}){
 const matrix=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 const moves=Array.from({length:a.length+1},()=>Array(b.length+1).fill(null));
 for(let i=1;i<=a.length;i++){matrix[i][0]=i;moves[i][0]='delete';}
 for(let j=1;j<=b.length;j++){matrix[0][j]=j;moves[0][j]='insert';}
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  const options=[{cost:matrix[i-1][j-1]+chordDifference(a[i-1],b[j-1],{rhythm}),move:'match'},{cost:matrix[i-1][j]+1,move:'delete'},{cost:matrix[i][j-1]+1,move:'insert'}];
  const best=options.reduce((best,next)=>next.cost<best.cost-EPS?next:best);matrix[i][j]=best.cost;moves[i][j]=best.move;
 }
 const additions=[];let i=a.length,j=b.length;
 while(i||j){const move=moves[i][j];if(move==='insert'){additions.push(b[j-1]);j--;}else if(move==='delete')i--;else{i--;j--;}}
 return {cost:matrix[a.length][b.length],additions:additions.reverse()};
}
function distance(a,b){
 const chord=align(a.chords,b.chords).cost/Math.max(1,a.chords.length,b.chords.length);
 const length=Math.max(a.keys.length,b.keys.length,1);let keys=0;
 for(let i=0;i<length;i++){const ka=a.keys[i],kb=b.keys[i];keys+=!ka||!kb?1:Number(ka[1]!==kb[1])+Number(ka[2]!==kb[2])+.2*Math.abs(ka[0]-kb[0]);}
 return chord+.12*keys/length;
}
/** Distance uses only the already tonic-relative structure, never names,
 * source song, source key, occurrence count, IDs or hash signatures.
 */
export function variantDistance(a,b){return distance(describe(a),describe(b));}

function blocks(items,key){
 const groups=new Map();for(const item of items){const value=key(item);const group=groups.get(value)??[];group.push(item);groups.set(value,group);}return [...groups.values()];
}
/** Average-linkage hierarchy keeps each semantic block contiguous. Starting
 * with the simplest core, orient each neighboring branch toward its closest
 * endpoint. A structural comparator resolves equal distances reproducibly.
 */
function orderBlocks(groups){
 if(groups.length<=1)return groups;
 const leaves=groups.map(members=>({members,children:null}));
 const first=cluster=>cluster.members.reduce((best,item)=>semanticCompare(item,best)<0?item:best);
 const cmp=(a,b)=>semanticCompare(first(a),first(b));
 let clusters=[...leaves].sort(cmp);
 const cache=new Map();
 function pair(a,b){let row=cache.get(a);if(!row){row=new Map();cache.set(a,row);}if(!row.has(b)){const value=distance(a,b);row.set(b,value);let other=cache.get(b);if(!other){other=new Map();cache.set(b,other);}other.set(a,value);}return row.get(b);}
 const between=(a,b)=>a.members.reduce((sum,x)=>sum+b.members.reduce((n,y)=>n+pair(x,y),0),0)/(a.members.length*b.members.length);
 while(clusters.length>1){
  let best=null;
  for(let i=0;i<clusters.length;i++)for(let j=i+1;j<clusters.length;j++){
   const candidate={i,j,cost:between(clusters[i],clusters[j])};
   if(!best||candidate.cost<best.cost-EPS)best=candidate;
  }
  const left=clusters[best.i],right=clusters[best.j],joined={members:[...left.members,...right.members],children:[left,right]};
  clusters=clusters.filter((_,i)=>i!==best.i&&i!==best.j);clusters.push(joined);clusters.sort(cmp);
 }
 const nearest=(cluster,anchor)=>cluster.members.reduce((best,item)=>{const a=pair(item,anchor),b=pair(best,anchor);return a<b-EPS||Math.abs(a-b)<=EPS&&semanticCompare(item,best)<0?item:best;},cluster.members[0]);
 function visit(cluster,anchor){
  if(!cluster.children)return [cluster.members];
  let [left,right]=cluster.children;if(!left.members.includes(anchor))[left,right]=[right,left];
  const ordered=visit(left,anchor),last=ordered.at(-1).at(-1);return [...ordered,...visit(right,nearest(right,last))];
 }
 return visit(clusters[0],first(clusters[0]));
}

/** Return the same variant objects in a deterministic semantic order.
 * 1. Choose the fewest-chord / fewest-tone core.
 * 2. Align every sequence to it without rhythm influencing insertions.
 * 3. Keep identical ordered added-chord families together, regardless of
 *    their source spelling, location or rhythmic realization.
 * 4. Within each family, keep identical full harmony sequences together;
 *    neighboring qualities, extensions and slash variants use edit distance.
 * 5. Arrange rhythm versions by the same hierarchy, with simple core first.
 * This is a browsing order, not a claim that different definitions are equal.
 */
export function orderBrickVariants(variants){
 if(variants.length<2)return [...variants];
 const items=variants.map(describe).sort(semanticCompare),core=items[0];
 const family=item=>JSON.stringify(align(core.chords,item.chords,{rhythm:false}).additions.map(c=>[c.root,c.quality,c.bass]));
 const families=orderBlocks(blocks(items,family)),ordered=[];
 for(const members of families){
  const harmonies=orderBlocks(blocks(members,item=>JSON.stringify(item.harmony)));
  for(const rhythmVersions of harmonies)ordered.push(...orderBlocks(rhythmVersions.map(item=>[item])).flat());
 }
 return ordered.map(item=>item.variant);
}
