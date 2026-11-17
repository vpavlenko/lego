/** Shared row geometry: every measure keeps the same width within a view. */
export function notationRows({song,performance,form=null,compact=false,mobile=false,measureWidth=null,barsPerRow=null,continuous=false}){
 const offset=Number.isFinite(performance.clockOffset)&&performance.clockOffset>0?performance.clockOffset:0;
 if(continuous)return [{start:0,end:performance.beats,style:{width:measureWidth?performance.beats/performance.barBeats*measureWidth:'100%'}}];
 if((form?.layoutAligned??form?.aligned)&&!compact)return (form.layoutSections??form.sections).map((s,i)=>{
  const start=s.start*performance.barBeats+offset,end=s.end*performance.barBeats+offset,style={gridRow:s.layoutRow+1,gridColumn:`${s.layoutColumn+1} / span ${s.bars}`};
  if(offset){const sectionBeats=(s.end-s.start)*performance.barBeats,prefix=offset/sectionBeats*100;style.width=i===0?`calc(100% + ${prefix}%)`:'100%';if(i===0)style['--pickup-label-offset']=offset/(sectionBeats+offset)*100+'%';else style.marginLeft=prefix+'%';}
  return {start:offset&&i===0?0:start,end,section:s.label,style};
 });
 const sourceCapacity=song.columns??Math.max(...performance.rows.map(r=>(r.end-r.start)/performance.barBeats));
 const capacity=barsPerRow??Math.max(1,Math.min(compact||mobile?4:8,sourceCapacity)),step=capacity*performance.barBeats,rows=[];
 const append=(start,end)=>{
  const first=offset&&rows.length===0,bars=(end-start)/performance.barBeats,widthBars=bars+(first?offset/performance.barBeats:0);
  const style={width:measureWidth?widthBars*measureWidth:widthBars/capacity*100+'%'};
  if(offset&&!first)style.marginLeft=measureWidth?offset/performance.barBeats*measureWidth:offset/step*100+'%';
  rows.push({start:first?0:start,end,style});
 };
 if(performance.measureMap){
  for(const source of performance.rows){const measures=performance.measureMap.filter(m=>m.start>=Math.max(source.start,offset)-1e-7&&m.start<source.end-1e-7);for(let i=0;i<measures.length;i+=capacity){const group=measures.slice(i,i+capacity),start=group[0].start,end=Math.min(source.end,group.at(-1).start+group.at(-1).duration);append(start,end);}}
  return rows;
 }
 for(const source of performance.rows)for(let start=Math.max(source.start,offset);start<source.end;start+=step){const end=Math.min(source.end,start+step);append(start,end);}
 return rows;
}
