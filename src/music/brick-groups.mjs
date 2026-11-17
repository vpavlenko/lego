const order=['Cadence','Approach','Turnaround','Dropback','Overrun','Ending','Opening','Pullback','CESH','On','On-Off','Off-On','On-Off+','Unit','Deceptive-Cadence','Misc','Blues','Unclassified'];
const normalized=name=>name.replace(/-/g,' ').replace(/\s+/g,' ').trim();
export function brickType(name,catalog){
 const lookup=label=>catalog.names[normalized(label)];
 const entry=lookup(name)||(/Launcher/.test(name)?lookup(name.replace(/Launcher/g,'Approach')):null);
 if(entry){
  const types=Object.entries(entry.types).filter(([type])=>type!=='Invisible');
  if(types.length){
   const explicit=types.find(([type])=>normalized(name).endsWith(normalized(type)));
   const primary=explicit??types.sort((a,b)=>b[1]-a[1])[0];
   return {type:primary[0],types:types.map(([type])=>type),basis:'dictionary'};
  }
 }
 // A hidden modifier can change the type, so its base name is insufficient.
 if(/\.\.|…|\+$/.test(name))return {type:'Unclassified',types:[],basis:'unresolved'};
 if(/Overrun$/.test(name))return {type:'Overrun',types:['Overrun'],basis:'label'};
 if(/Dropback$/.test(name))return {type:'Dropback',types:['Dropback'],basis:'label'};
 if(/Launcher$|Approach$/.test(name))return {type:'Approach',types:['Approach'],basis:'legacy-label'};
 if(/Cadence$/.test(name))return {type:'Cadence',types:['Cadence'],basis:'label'};
 if(/Opening$|Gpening$/.test(name))return {type:'Opening',types:['Opening'],basis:'label'};
 if(/Turnaround/.test(name))return {type:'Turnaround',types:['Turnaround'],basis:'label'};
 if(/^On Off On|^On Off Thrice|^On Off Twice|^On Off To/.test(name))return {type:'On-Off+',types:['On-Off+'],basis:'label'};
 if(/^On Off/.test(name))return {type:'On-Off',types:['On-Off'],basis:'label'};
 if(/^Off On/.test(name))return {type:'Off-On',types:['Off-On'],basis:'label'};
 if(/^Diatonic |Dominant Cycle/.test(name))return {type:'Unit',types:['Unit'],basis:'label'};
 return {type:'Unclassified',types:[],basis:'unresolved'};
}
export function groupBricks(bricks,catalog){
 const groups=new Map();
 for(const brick of bricks){const classification=brickType(brick.name,catalog);if(!groups.has(classification.type))groups.set(classification.type,[]);groups.get(classification.type).push({...brick,classification});}
 return [...groups].sort((a,b)=>(order.indexOf(a[0])<0?99:order.indexOf(a[0]))-(order.indexOf(b[0])<0?99:order.indexOf(b[0]))).map(([type,bricks])=>({type,bricks:bricks.sort((a,b)=>a.name.localeCompare(b.name))}));
}
