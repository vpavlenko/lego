/** Shared row geometry: every measure keeps the same width within a view. */
export function notationRows({song,performance,form=null,compact=false,mobile=false,measureWidth=null,barsPerRow=null,continuous=false}){
 if(continuous)return [{start:0,end:performance.beats,style:{width:measureWidth?performance.beats/performance.barBeats*measureWidth:'100%'}}];
 if(form?.aligned&&!compact)return (form.layoutSections??form.sections).map(s=>({start:s.start*performance.barBeats,end:s.end*performance.barBeats,section:s.label,style:{gridRow:s.layoutRow+1,gridColumn:`${s.layoutColumn+1} / span ${s.bars}`}}));
 const sourceCapacity=song.columns??Math.max(...performance.rows.map(r=>(r.end-r.start)/performance.barBeats));
 const capacity=barsPerRow??Math.max(1,Math.min(compact||mobile?4:8,sourceCapacity)),step=capacity*performance.barBeats,rows=[];
 for(const source of performance.rows)for(let start=source.start;start<source.end;start+=step){const end=Math.min(source.end,start+step),bars=(end-start)/performance.barBeats;rows.push({start,end,style:{width:measureWidth?bars*measureWidth:bars/capacity*100+'%'}});}
 return rows;
}
