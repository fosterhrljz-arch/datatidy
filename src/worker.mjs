import JSZip from 'jszip';
import {parseInput, planDocument, documentSummary, reportDocument, exportDocument, exportBatch, outputName, RULES, LIMITS} from './core.mjs';
import {searchRows} from './search.mjs';
import {actionCounts} from './reporting.mjs';
const documents=new Map(),plans=new Map(),fileRules=new Map();
let nextId=1,recentlyRemoved=null,previousRules=null;
const normalize=rules=>Object.fromEntries(Object.keys(RULES).map(k=>[k,rules?.[k]===true]));
const summary=id=>{
  const doc=documents.get(id),plan=plans.get(id),result=documentSummary(doc,plan);
  return {...result,rules:{...fileRules.get(id)},sheets:result.sheets.map((s,i)=>({...s,actions:actionCounts(plan?.sheets[i].changes)}))};
};
const summaries=()=>[...documents.keys()].map(summary);
function report(id){
  const doc=documents.get(id),plan=plans.get(id),base=reportDocument(doc,plan||planDocument(doc,RULES));
  return {...base,previewCurrent:!!plan,requestedRules:{...fileRules.get(id)},sheets:base.sheets.map((s,i)=>({...s,appliedRules:plan&&s.editable?{...plan.rules}:{...RULES},actions:actionCounts(plan?.sheets[i].changes)}))};
}
export async function handleAction(action,payload={}){
  if(action==='reset'){documents.clear();plans.clear();fileRules.clear();recentlyRemoved=null;previousRules=null;return [];}
  if(action==='import'){
    if(documents.size>=LIMITS.files)throw new Error('A batch can contain up to 25 files. Export or remove files before adding more.');
    const total=[...documents.values()].reduce((n,d)=>n+d.bytes.length,0);
    if(total+payload.bytes.byteLength>LIMITS.batchBytes)throw new Error('Batch exceeds 100 MB. Process fewer files at a time.');
    const doc=await parseInput(payload.name,payload.bytes,payload.options);
    doc.id=String(nextId++);documents.set(doc.id,doc);fileRules.set(doc.id,{...RULES});plans.clear();previousRules=null;return summaries();
  }
  if(action==='remove'){
    if(!documents.has(payload.id))throw new Error('This file is no longer in the batch.');
    recentlyRemoved={doc:documents.get(payload.id),rules:fileRules.get(payload.id)};
    documents.delete(payload.id);fileRules.delete(payload.id);plans.clear();previousRules=null;return summaries();
  }
  if(action==='restore'){
    if(!recentlyRemoved)throw new Error('There is no file removal to undo.');
    const total=[...documents.values()].reduce((n,d)=>n+d.bytes.length,0);
    if(documents.size>=LIMITS.files||total+recentlyRemoved.doc.bytes.length>LIMITS.batchBytes)throw new Error('The session is full. Re-import the removed original file in a smaller batch.');
    const {doc,rules}=recentlyRemoved;documents.set(doc.id,doc);fileRules.set(doc.id,rules);recentlyRemoved=null;plans.clear();previousRules=null;return {files:summaries(),id:doc.id};
  }
  if(action==='rules'){
    if(!documents.has(payload.id))throw new Error('Select a file before changing rules.');
    const rules=normalize(payload.rules);
    if(payload.all){previousRules=new Map(fileRules);for(const id of documents.keys())fileRules.set(id,{...rules});}
    else {previousRules=null;fileRules.set(payload.id,rules);}
    plans.clear();return summaries();
  }
  if(action==='undoRules'){
    if(!previousRules)throw new Error('There are no batch rule changes to undo.');
    for(const [id,rules] of previousRules)if(documents.has(id))fileRules.set(id,rules);
    previousRules=null;plans.clear();return summaries();
  }
  if(action==='preview'){
    // Build plans atomically from worker-owned per-file settings.
    const next=new Map();for(const [id,doc] of documents)next.set(id,planDocument(doc,fileRules.get(id)));
    plans.clear();for(const [id,plan] of next)plans.set(id,plan);return summaries();
  }
  if(action==='invalidate'){plans.clear();return summaries();}
  if(action==='page'){
    const doc=documents.get(payload.id),sheet=doc?.sheets[payload.sheet||0];
    if(!sheet)throw new Error('Select a file to view.');
    const plan=plans.get(doc.id)?.sheets[payload.sheet||0];
    if(payload.mode!=='Original'&&!plan)throw new Error('Preview the current rules before comparing or viewing cleaned data.');
    const source=payload.mode==='Cleaned'?plan.rows:sheet.rows,removed=new Set(plan?.removed||[]),edited=new Map();
    for(const change of plan?.changes||[])if(change.column){if(!edited.has(change.row))edited.set(change.row,{});edited.get(change.row)[change.column-1]=change.after;}
    const match=r=>payload.filter==='issues'?r.issues.empty||r.issues.duplicateOf!==null||r.issues.missing.length||r.issues.whitespace.length||r.issues.mixed.length:payload.filter==='changes'?removed.has(r.ref)||edited.has(r.ref):payload.filter==='duplicates'?r.issues.duplicateOf!==null:payload.filter==='empty'?r.issues.empty:['missing','whitespace','mixed'].includes(payload.filter)?r.issues[payload.filter].length>0:true;
    const found=searchRows(source.filter(match),Array.from({length:sheet.width},(_,c)=>sheet.headers[c]||`Column ${c+1}`),payload.search,edited,payload.mode);
    const filtered=found.rows;
    const activeIndex=payload.matchIndex==null||!found.matches.length?null:Math.max(0,Math.min(payload.matchIndex,found.matches.length-1));
    const active=activeIndex===null?null:found.matches[activeIndex];
    const target=payload.focusRef||active?.row,located=target?filtered.findIndex(r=>r.ref===target):-1;
    if(payload.focusRef&&located<0)throw new Error(`Source row ${payload.focusRef} is not in this view. Choose Original and All records to locate it.`);
    const maxPage=Math.max(0,Math.ceil(filtered.length/10)-1),page=Math.max(0,Math.min(located>=0?Math.floor(located/10):payload.page||0,maxPage));
    const visible=filtered.slice(page*10,page*10+10),visibleRefs=new Set(visible.map(r=>r.ref));
    // Pagination keeps match navigation anchored to the visible page.
    const visibleMatch=activeIndex??found.matches.findIndex(m=>m.row===null||visibleRefs.has(m.row));
    return {rows:visible.map(r=>({...r,originalValues:sheet.rows[r.ref-2]?.values||r.values,removed:removed.has(r.ref),edits:edited.get(r.ref)||{}})),total:filtered.length,page,maxPage,search:{query:found.query,columns:found.columns,total:found.matches.length,active:visibleMatch<0?null:found.matches[visibleMatch],activeIndex:visibleMatch<0?null:visibleMatch}};
  }
  if(action==='changes'){
    const changes=plans.get(payload.id)?.sheets[payload.sheet||0]?.changes||[],maxPage=Math.max(0,Math.ceil(changes.length/20)-1),page=Math.max(0,Math.min(payload.page||0,maxPage));
    return {changes:changes.slice(page*20,page*20+20),total:changes.length,page,maxPage};
  }
  if(action==='export'){
    if(plans.size!==documents.size||!documents.size)throw new Error('Preview the current rules before exporting.');
    if(payload.id){const doc=documents.get(payload.id);if(!doc)throw new Error('This file is no longer in the batch.');return {bytes:await exportDocument(doc,plans.get(payload.id)),name:outputName(doc.name)};}
    const archive=await JSZip.loadAsync(await exportBatch([...documents].map(([id,doc])=>({doc,plan:plans.get(id)}))));
    const originalReport=JSON.parse(await archive.file('data-quality-report.json').async('string'));
    const files=[...documents.keys()].map((id,i)=>({...report(id),exportedAs:originalReport.files[i].exportedAs}));
    archive.file('data-quality-report.json',JSON.stringify({...originalReport,state:'export',excludedImports:payload.failedImports||[],files},null,2));
    return {bytes:await archive.generateAsync({type:'uint8array',compression:'DEFLATE'}),name:'DataTidy-cleaned-batch.zip'};
  }
  if(action==='report')return {version:1,state:plans.size===documents.size&&documents.size?'preview':'analysis',generatedAt:new Date().toISOString(),excludedImports:payload.failedImports||[],files:[...documents.keys()].map(report)};
  throw new Error('Unknown action.');
}
if(typeof self!=='undefined')self.onmessage=async({data:{requestId,action,payload}})=>{
  try{self.postMessage({requestId,result:await handleAction(action,payload)});}catch(error){self.postMessage({requestId,error:error.message||'Unable to process this file.'});}
};
