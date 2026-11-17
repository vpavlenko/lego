const automaticBasis=basis=>/dictionary-parser|repeated-source-pattern|first-chord-reference/.test(basis??'');

// Keep the imported analyses in their source datasets, but exclude their
// unreviewed conclusions from every website index and notation surface.
export function visibleAnalysis(song){
 const automatic=automaticBasis(song.provenance?.analysisBasis);
 const rows=song.rows.map(row=>{
  const bricks=automatic?[]:row.bricks.filter(span=>!automaticBasis(span.basis));
  const joins=automatic?[]:row.joins.filter(join=>!automaticBasis(join.basis));
  const keys=automatic?[]:row.keys.filter(key=>!automaticBasis(key.basis));
  return {...row,bricks,joins,keys:keys.length?keys:[{start:0,end:row.bars,root:song.tonic[0],mode:song.tonic[1],basis:'source-reference'}]};
 });
 return {...song,rows,bricks:[...new Set(rows.flatMap(row=>row.bricks.map(span=>span.name)))].sort((a,b)=>a.localeCompare(b))};
}
