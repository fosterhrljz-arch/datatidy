// Literal, case-insensitive search over a worksheet. Never changes source values.
export function searchRows(rows, headers, search={}, edits=new Map(), mode='Original') {
  const query=String(search.query||'').slice(0,256).trim().toLowerCase();
  const kind=search.kind||'content';
  if(!query)return {rows,matches:[],columns:[],query:''};
  const has=value=>String(value??'').toLowerCase().includes(query);
  if(kind==='column'){
    const columns=headers.flatMap((h,c)=>has(h||`Column ${c+1}`)?[c]:[]);
    return {rows:columns.length?rows:[],columns,matches:columns.map(c=>({row:null,column:c})),query};
  }
  const matches=[],found=[];
  for(const row of rows){
    if(kind==='row'){
      if(/^\d+$/.test(query)&&row.ref===Number(query)){found.push(row);matches.push({row:row.ref,column:null});}
    }else{
      let matched=false;
      for(let c=0;c<row.values.length;c++){
        if(has(row.values[c])||(mode==='Compare'&&Object.hasOwn(edits.get(row.ref)||{},c)&&has(edits.get(row.ref)[c]))){matches.push({row:row.ref,column:c});matched=true;}
      }
      if(matched)found.push(row);
    }
  }
  return {rows:found,matches,columns:[],query};
}
