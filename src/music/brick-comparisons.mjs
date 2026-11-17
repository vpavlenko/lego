/** Curated full source variants on one visual bar grid; musical time stays intact. */
export const BRICK_COMPARISON_ALIGNMENT={id:'dropback-pullback-autumn',measureWidth:100,items:[
 {slug:'dropback',variantId:'v-zryolr-my997p',offsetBars:2,beats:16,chords:[['C',0,8],['A7',8,16]],anchors:[{symbol:'C',beat:0,screenBar:2}]},
 {slug:'ttfa-dropback',variantId:'v-1cdct8p-1c6rnm7',offsetBars:2,beats:16,chords:[['CM7',0,8],['Em7',8,12],['A7',12,16]],anchors:[{symbol:'CM7',beat:0,screenBar:2}]},
 {slug:'pullback',variantId:'v-hu8opg-1d2z1a2',offsetBars:0,beats:16,chords:[['Dm7',0,4],['G7',4,8],['Em7b5',8,12],['A7',12,16]],anchors:[{symbol:'Dm7',beat:0,screenBar:0}]},
 {slug:'autumn-leaves-opening',variantId:'v-3ji1qf-1uurvh',offsetBars:0,beats:32,chords:[['Dm7',0,4],['G7',4,8],['CM7',8,12],['FM7',12,16],['Bm7b5',16,20],['E7',20,24],['Am7',24,32]],anchors:[{symbol:'Dm7',beat:0,screenBar:0},{symbol:'CM7',beat:8,screenBar:2}]}
]};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function identityMatches(variant,record){
 const p=variant.performance;
 return p&&p.beats===record.beats&&p.barBeats===4&&equal(p.meter,[4,4])&&p.tonic===0&&equal(p.chords.map(c=>[c.symbol,c.start,c.end]),record.chords)&&
  p.changes.every(c=>c.tonic===0)&&(!p.measureMap||(p.measureMap.length===record.beats/4&&p.measureMap.every((m,i)=>m.start===i*4&&m.duration===4)));
}
const usage=(variant,songs)=>new Set(variant.standards.map(ref=>songs[ref.song]?.arrangementOf??ref.song)).size;
/** Definitions and display metadata are current build outputs, never resynthesized. */
export function buildBrickComparisons(allDefinitions,{atlasBricks,songs}){
 return BRICK_COMPARISON_ALIGNMENT.items.map(record=>{
  const definition=allDefinitions.find(d=>d.slug===record.slug),brick=atlasBricks.find(b=>b.slug===record.slug);
  if(!definition||!brick)throw Error('Missing comparison family: '+record.slug);
  let variant=definition.variants.find(v=>v.id===record.variantId),basis='curated-id';
  if(variant&&!identityMatches(variant,record))throw Error('Curated comparison identity changed: '+record.slug+'/'+record.variantId);
  if(!variant){
   basis='exact-identity';variant=definition.variants.filter(v=>identityMatches(v,record)).sort((a,b)=>usage(b,songs)-usage(a,songs)||(b.completeOccurrences??0)-(a.completeOccurrences??0)||a.id.localeCompare(b.id))[0];
  }
  if(!variant)throw Error('Missing source identity for comparison: '+record.slug);
  for(const anchor of record.anchors){
   if(!variant.performance.chords.some(chord=>chord.symbol===anchor.symbol&&chord.start===anchor.beat)||record.offsetBars+anchor.beat/4!==anchor.screenBar)throw Error('Invalid comparison alignment: '+record.slug);
  }
  return {id:BRICK_COMPARISON_ALIGNMENT.id+'-'+record.slug,slug:brick.slug,name:brick.name,nameColorRoots:brick.nameColorRoots,representativeName:brick.representativeName,sourceNames:brick.sourceNames,variantId:variant.id,standards:usage(variant,songs),familyStandards:brick.standards,performance:structuredClone(variant.performance),offsetBars:record.offsetBars,measureWidth:BRICK_COMPARISON_ALIGNMENT.measureWidth,alignment:{id:BRICK_COMPARISON_ALIGNMENT.id,basis,requestedVariantId:record.variantId,anchor:{...record.anchors[0]},anchors:record.anchors.map(anchor=>({...anchor})),screenAnchorBar:record.anchors[0].screenBar}};
 });
}
