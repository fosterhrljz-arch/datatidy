export function actionCounts(changes=[]){
  const counts={trim:0,empty:0,duplicates:0};
  for(const change of changes){
    if(change.action==='trim whitespace')counts.trim++;
    else if(change.action==='remove row'&&change.reason==='Empty row')counts.empty++;
    else if(change.action==='remove row'&&change.reason?.startsWith('Exact duplicate'))counts.duplicates++;
  }
  return counts;
}
export function actionLabel(key,sheet,rules,ready){
  if(!sheet.editable)return 'Protected · unchanged';
  if(key==='missing')return 'Review only · no values filled';
  if(key==='mixed')return 'Review only · no type conversion';
  const rule=key==='whitespace'?'trim':key;
  if(!ready)return rules?.[rule]?'Selected · preview required':'Not selected';
  if(!rules?.[rule])return 'Not selected';
  const count=sheet.actions?.[rule]||0;
  if(!count)return 'Selected · no matching changes';
  return rule==='trim'?`${count} ${count===1?'cell':'cells'} trimmed`:`${count} ${count===1?'row':'rows'} removed`;
}
