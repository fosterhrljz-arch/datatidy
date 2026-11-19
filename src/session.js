import {useRef, useState} from 'react';

export const defaults = {trim:false, empty:false, duplicates:false};
export const labels = {duplicates:'Duplicate rows', empty:'Empty rows', missing:'Missing values', whitespace:'Extra whitespace', mixed:'Mixed-type columns'};
export const formatNumber = n => (n || 0).toLocaleString('en-US');
export const countRules = rules => Object.values(rules).filter(Boolean).length;
const workerUrl = URL.createObjectURL(new Blob([__WORKER__], {type:'text/javascript'}));
const worker = new Worker(workerUrl);
URL.revokeObjectURL(workerUrl);
let sequence = 0;
const requests = new Map();
worker.onmessage = ({data}) => { const p = requests.get(data.requestId); if (!p) return; clearTimeout(p.timer); requests.delete(data.requestId); data.error ? p.reject(new Error(data.error)) : p.resolve(data.result); };
worker.onerror = () => { for (const p of requests.values()) { clearTimeout(p.timer); p.reject(new Error('The processing worker stopped. Reload DataTidy and use a smaller batch.')); } requests.clear(); };
export function rpc(action, payload = {}) { return new Promise((resolve,reject) => { const requestId = ++sequence; const timer = setTimeout(() => {requests.delete(requestId); reject(new Error('Processing timed out. Reload DataTidy and try a smaller file.'));}, 120000); requests.set(requestId,{resolve,reject,timer}); worker.postMessage({requestId,action,payload}); }); }
export function download(bytes, name, type = 'application/octet-stream') { const url = URL.createObjectURL(new Blob([bytes],{type})); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),60000); }

// Session ownership stays above page navigation. The worker owns per-file rules.
export const emptyTable=()=>({page:0,filter:'all',focusRef:null,cell:null,search:{kind:'content',query:''},searchDraft:{kind:'content',query:''},matchIndex:null});
const importMessage=error=>error.message.replace('Choose its encoding in Import settings and import it again.','Choose an encoding below, then retry this file.').replace('Fix the source and re-import.','Fix the source data, then choose a corrected replacement file.');
const sampleFiles=()=>__SAMPLES__.map(s=>new File([Uint8Array.from(atob(s.base64),c=>c.charCodeAt(0))],s.name));
export function useDataTidy(){
  const [files,setFiles]=useState([]),[selection,setSelection]=useState({id:null,sheet:0});
  const [page,setPage]=useState('Home'),[step,setStep]=useState(0);
  const [ready,setReady]=useState(false),[mode,setMode]=useState('Original');
  const [busy,setBusy]=useState(''),[messages,setMessages]=useState([]),[options,setOptions]=useState({encoding:'auto',delimiter:'auto'});
  const [revision,setRevision]=useState(0),[removed,setRemoved]=useState(null),[lastExport,setLastExport]=useState(null);
  const [tableState,setTableState]=useState(emptyTable),[importErrors,setImportErrors]=useState([]),[canUndoRules,setCanUndoRules]=useState(false);
  const lock=useRef(false);
  const file=files.find(f=>f.id===selection.id)||files[0];
  const rules=file?.rules||defaults,sheetIndex=file?Math.min(selection.sheet,file.sheets.length-1):0;
  const notify=(text,type='success')=>setMessages(m=>[...m.slice(-3),{id:++sequence,text,type}]);
  async function run(label,fn){if(lock.current)return false;lock.current=true;setBusy(label);try{await fn();return true;}catch(e){notify(e.message,'error');return false;}finally{setBusy('');lock.current=false;}}
  function invalidate(){setReady(false);setMode('Original');setRevision(r=>r+1);setLastExport(null);setTableState(emptyTable());}
  function select(id,sheet=0){if(id===file?.id&&sheet===sheetIndex)return;setSelection({id,sheet});setTableState(emptyTable());}
  async function readFile(source,importOptions){
    if(source.size>25*1024*1024)throw new Error('File exceeds 25 MB. Split it into smaller files.');
    return rpc('import',{name:source.name,bytes:await source.arrayBuffer(),options:importOptions});
  }
  async function importMany(incoming){
    let firstId=null,added=0;
    for(const source of incoming){
      setBusy(`Checking ${source.name}…`);
      try{const latest=await readFile(source,options);if(!firstId)firstId=latest.at(-1).id;setFiles(latest);invalidate();setCanUndoRules(false);added++;}
      catch(e){setImportErrors(list=>[...list,{id:String(++sequence),source,name:source.name,message:importMessage(e),options:{...options}}]);notify(`${source.name}: ${importMessage(e)}`,'error');}
    }
    setPage('Data Cleaner');setStep(0);
    if(firstId){setSelection({id:firstId,sheet:0});notify(`${added} ${added===1?'file':'files'} added. Your originals are safe.`);}
  }
  async function addFiles(list){const incoming=Array.from(list);if(incoming.length)await run('Reading and checking files…',()=>importMany(incoming));}
  async function loadSamples(){await addFiles(sampleFiles());}
  async function newBatch(withSamples=false){return run('Starting a new batch…',async()=>{
    await rpc('reset');setFiles([]);setSelection({id:null,sheet:0});setImportErrors([]);setRemoved(null);setCanUndoRules(false);setMessages([]);invalidate();setStep(0);setPage('Data Cleaner');
    if(withSamples)await importMany(sampleFiles());
  });}
  function setErrorOptions(id,next){setImportErrors(list=>list.map(e=>e.id===id?{...e,options:next}:e));}
  function dismissImportError(id){if(!lock.current)setImportErrors(list=>list.filter(e=>e.id!==id));}
  async function retryImport(id,replacement){
    const entry=importErrors.find(e=>e.id===id);if(!entry)return;
    const source=replacement||entry.source;
    await run(`Retrying ${source.name}…`,async()=>{
      try{const latest=await readFile(source,entry.options);setFiles(latest);setImportErrors(list=>list.filter(e=>e.id!==id));setSelection({id:latest.at(-1).id,sheet:0});invalidate();setCanUndoRules(false);setStep(0);setPage('Data Cleaner');notify(`${source.name} imported successfully.`);}
      catch(e){setImportErrors(list=>list.map(item=>item.id===id?{...item,source,name:source.name,message:importMessage(e)}:item));notify(`${source.name}: ${importMessage(e)}`,'error');}
    });
  }
  async function remove(id){await run('Removing file from this session…',async()=>{const name=files.find(f=>f.id===id)?.name;const next=await rpc('remove',{id});setFiles(next);setRemoved(name);setCanUndoRules(false);if(file?.id===id)setSelection({id:next[0]?.id||null,sheet:0});invalidate();setStep(s=>next.length?Math.min(s,1):0);});}
  async function undoRemove(){await run('Restoring file…',async()=>{const restored=await rpc('restore');setFiles(restored.files);setSelection({id:restored.id,sheet:0});setRemoved(null);setCanUndoRules(false);invalidate();setStep(s=>Math.min(s,1));notify('File and its rules restored. Preview again before exporting.');});}
  async function changeRules(next,all=false){if(!file)return;await run('Updating rules…',async()=>{invalidate();setFiles(await rpc('rules',{id:file.id,rules:next,all}));setCanUndoRules(all);if(all)notify('Rules copied to all current files. Each file can still be adjusted independently.');});}
  async function undoRules(){await run('Restoring file-specific rules…',async()=>{invalidate();setFiles(await rpc('undoRules'));setCanUndoRules(false);setStep(s=>Math.min(s,1));notify('Previous rules restored for every file. Preview again before exporting.');});}
  async function preview(){await run('Preparing your comparison…',async()=>{setFiles(await rpc('preview'));setReady(true);setMode('Compare');setRevision(r=>r+1);setLastExport(null);setTableState(emptyTable());setStep(2);});}
  const failedImports=()=>importErrors.map(({name,message,options})=>({file:name,error:message,options}));
  async function exportFiles(id){if(!ready){notify('Preview the current rules before exporting.','error');return;}await run('Preparing your download…',async()=>{const result=await rpc('export',{id,failedImports:failedImports()});download(result.bytes,result.name);setLastExport(result.name);notify(`${result.name} download started. Your originals are unchanged.`);});}
  async function report(){await run('Creating quality report…',async()=>{download(JSON.stringify(await rpc('report',{failedImports:failedImports()}),null,2),'DataTidy-quality-report.json','application/json');notify('Quality report download started.');});}
  function locate(filter='all',ref=null,id=file?.id,sheet=sheetIndex){setSelection({id,sheet});setPage('Data Cleaner');setStep(page==='Data Cleaner'&&(step===1||step===2)?step:ready?2:1);setMode('Original');setTableState({...emptyTable(),filter,focusRef:ref});}
  function navigateStep(n){if(busy)return;if(n===0||n===1&&files.length||n>1&&ready){setStep(n);setTableState(s=>({...s,cell:null}));}}
  return {files,file,sheetIndex,select,page,setPage,step,setStep,navigateStep,rules,ready,mode,setMode,busy,messages,setMessages,notify,options,setOptions,revision,removed,undoRemove,lastExport,clearLastExport:()=>setLastExport(null),tableState,setTableState,addFiles,loadSamples,remove,changeRules,preview,exportFiles,report,locate,newBatch,importErrors,setErrorOptions,retryImport,dismissImportError,canUndoRules,undoRules,hasWork:!!(files.length||importErrors.length||removed)};
}
