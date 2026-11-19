import React,{useRef,useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Check,CheckCheck,ArrowRight,ArrowLeft,Download,LoaderCircle,AlertCircle,X,Undo2,ShieldCheck} from 'lucide-react';
import {useDataTidy,countRules} from './session.js';
import {Icon,Button,Dialog} from './ui.jsx';
import {Sidebar,FileNavigator} from './Sidebar.jsx';
import {Preview} from './Preview.jsx';
import {Inspector} from './RulesPanel.jsx';
import {Home,ImportPage,QualityReport,SettingsPage,ExportPage} from './pages.jsx';
const steps=['Import','Configure','Review','Export'];
const titles=['Start with your files.','Choose what changes.','Review your changes.','A fresh copy. Full confidence.'];
const subtitles=['Bring in a file or a whole batch. Nothing changes during import.','Select only the rules you need. You stay in control.','Every edit is visible. Your originals stay untouched.','Export the files you reviewed, with a clear record of every change.'];
function Stepper({step,files,ready,busy,onStep}){
  return <nav className="stepper" aria-label="Cleaning workflow">{steps.map((name,i)=><React.Fragment key={name}>{i>0&&<span className={`step-line ${i<=step?'complete':''}`}/>}<button className={`step ${i===step?'current':''} ${i<step?'complete':''}`} aria-current={i===step?'step':undefined} disabled={busy || i===1&&!files.length || i>1&&!ready} onClick={()=>onStep(i)}><span className="step-number">{i<step?<Icon as={Check}/>:i+1}</span><span>{name}</span></button></React.Fragment>)}</nav>;
}
function App(){
  const s=useDataTidy(),input=useRef(null);
  const [collapsed,setCollapsed]=useState(false),[inspectorOpen,setInspectorOpen]=useState(true),[scope,setScope]=useState('all'),[ack,setAck]=useState(false);
  const [pendingBatch,setPendingBatch]=useState(null);
  async function beginBatch(kind){setPendingBatch(null);if(await s.newBatch(kind==='samples')){setCollapsed(false);setInspectorOpen(true);}}
  function requestBatch(kind){if(s.busy)return;if(s.hasWork)setPendingBatch(kind);else beginBatch(kind);}
  useEffect(()=>{setAck(false);setScope('all');},[s.revision]);
  const main=useRef(null),previousRoute=useRef('Home:0');
  useEffect(()=>{
    const route=`${s.page}:${s.page==='Data Cleaner'?s.step:0}`;
    document.title=`${s.page}${s.page==='Data Cleaner'?' · '+steps[s.step]:''} — DataTidy`;
    if(previousRoute.current!==route){const heading=main.current?.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
    previousRoute.current=route;
  },[s.page,s.step]);
  const clearCell=()=>{main.current?.querySelector('[data-inspected="true"]')?.focus();s.setTableState(t=>({...t,cell:null}));};
  const changeScope=value=>{setScope(value);s.clearLastExport();};
  const browse=()=>input.current.click();
  const chosen=scope==='all'?s.files:s.files.filter(f=>f.id===scope);
  const removals=chosen.flatMap(f=>f.sheets).reduce((n,f)=>n+f.removed,0);
  const canDownload=s.ready&&chosen.length>0&&(!removals||ack)&&!s.busy;
  const nextLabels=['Continue to Configure','Preview changes','Continue to Export',scope==='all'?'Download ZIP':'Download file'];
  const disabledNext=!!s.busy||!s.files.length||s.step===2&&!s.ready||s.step===3&&!canDownload;
  const next=()=>s.step===1?s.preview():s.step===3?s.exportFiles(scope==='all'?undefined:scope):s.navigateStep(s.step+1);
  const totals=s.files.flatMap(f=>f.sheets).reduce((n,f)=>n+f.changes,0);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><Sidebar page={s.page} onNavigate={s.setPage} fileCount={s.files.length}/><main className="app-main" id="main-content" tabIndex={-1} ref={main}><header className="app-toolbar"><strong>{s.page}</strong><div><span className="session-status">{s.files.length>0?`${s.files.length} files in this session`:'Offline Batch Data Cleaner'}</span><span className="offline"><i/>Offline</span></div></header><input ref={input} className="visually-hidden" aria-label="Import data files" type="file" accept=".csv,.tsv,.xlsx" multiple onChange={e=>{s.addFiles(e.target.files);e.target.value='';}}/>
    <div className="feedback-region">{s.busy&&<div className="busy" role="status"><Icon as={LoaderCircle} className="spin"/>{s.busy}</div>}
    <div className="notifications">{s.messages.map(m=><div role={m.type==='error'?'alert':'status'} className={`message ${m.type}`} key={m.id}><Icon as={m.type==='error'?AlertCircle:Check}/><span>{m.text}</span>{m.type==='error'&&<button className="text-button" onClick={()=>s.setPage('Settings')}>Get help</button>}<button className="icon-button" aria-label="Dismiss message" onClick={()=>s.setMessages(prev=>prev.filter(x=>x.id!==m.id))}><Icon as={X}/></button></div>)}</div>
    </div>
    {s.page==='Home'&&<Home onNew={()=>requestBatch('new')} onContinue={()=>s.setPage('Data Cleaner')} onSamples={()=>requestBatch('samples')} busy={!!s.busy} files={s.files} hasWork={s.hasWork} step={steps[s.step]}/>}
    {s.page==='Reports'&&<QualityReport files={s.files} file={s.file} sheetIndex={s.sheetIndex} onSelect={s.select} ready={s.ready} onDownload={s.report} busy={!!s.busy} onLocate={s.locate} revision={s.revision}/>}
    {s.page==='Settings'&&<SettingsPage options={s.options} setOptions={s.setOptions} notify={s.notify}/>}
    {s.page==='Data Cleaner'&&<div className="cleaner"><div className="workflow-header"><div><h1>{titles[s.step]}</h1><p>{subtitles[s.step]}</p></div><Stepper step={s.step} files={s.files} ready={s.ready} busy={!!s.busy} onStep={s.navigateStep}/></div>
      {s.removed&&<div className="undo-bar"><span>Removed {s.removed} from this session.</span><button className="text-button" disabled={!!s.busy} onClick={s.undoRemove}><Icon as={Undo2}/>Undo removal</button></div>}
      <div className={`workflow-body ${s.step===1||s.step===2?'workspace-body':''}`}>
        {s.step===0&&<ImportPage files={s.files} onBrowse={browse} onDrop={s.addFiles} onRemove={s.remove} onSamples={s.loadSamples} busy={!!s.busy} onSettings={()=>s.setPage('Settings')} importErrors={s.importErrors} onErrorOptions={s.setErrorOptions} onRetry={s.retryImport} onDismissError={s.dismissImportError}/>}
        {(s.step===1||s.step===2)&&s.file&&<div className={`workspace ${!inspectorOpen?'inspector-hidden':''}`}><FileNavigator files={s.files} selected={s.file.id} sheetIndex={s.sheetIndex} onSelect={s.select} onRemove={s.remove} onAdd={()=>{s.setStep(0);browse();}} busy={!!s.busy} collapsed={collapsed} onToggle={()=>setCollapsed(!collapsed)}/><Preview file={s.file} sheetIndex={s.sheetIndex} mode={s.mode} setMode={s.setMode} ready={s.ready} revision={s.revision} tableState={s.tableState} setTableState={s.setTableState} locate={s.locate} inspectorOpen={inspectorOpen} clearCell={clearCell} onToggleInspector={()=>setInspectorOpen(!inspectorOpen)}/>{inspectorOpen&&<Inspector step={s.step} file={s.file} sheetIndex={s.sheetIndex} rules={s.rules} onChange={s.changeRules} onApplyAll={()=>s.changeRules(s.rules,true)} canApplyAll={s.files.length>1} canUndoRules={s.canUndoRules} onUndoRules={s.undoRules} busy={!!s.busy} ready={s.ready} cell={s.tableState.cell} clearCell={clearCell} locate={s.locate} filter={s.tableState.filter}/>}</div>}
        {s.step===3&&<ExportPage files={s.files} file={s.file} ready={s.ready} scope={scope} setScope={changeScope} ack={ack} setAck={setAck} lastExport={s.lastExport} failedCount={s.importErrors.length} onImport={()=>s.navigateStep(0)} onReport={s.report} busy={!!s.busy}/>}
      </div>
      <footer className="workflow-footer"><Button icon={ArrowLeft} onClick={()=>s.step===0?s.setPage('Home'):s.navigateStep(s.step-1)} disabled={!!s.busy}>Back</Button><div className="workflow-status">{s.step<2?<><Icon as={ShieldCheck}/><span>{s.step===0?`${s.files.length} files imported`: `${countRules(s.rules)} rules selected · this file only`}</span></>:<><Icon as={CheckCheck}/><span>{s.step===2?`Preview up to date · ${totals} batch changes`:'Your originals stay untouched'}</span></>}</div><Button primary disabled={disabledNext} title={disabledNext?(s.busy||(!s.files.length?"Import at least one file to continue.":s.step===3&&removals&&!ack?"Review and acknowledge the rows selected for removal.":"Create a current preview to continue.")):undefined} onClick={next}>{nextLabels[s.step]}<Icon as={s.step===3?Download:ArrowRight}/></Button></footer>
    </div>}
  </main>{pendingBatch&&<Dialog title={pendingBatch==='samples'?'Start a sample batch?':'Start a new batch?'} onClose={()=>setPendingBatch(null)} footer={<><Button data-initial-focus onClick={()=>setPendingBatch(null)}>Keep Current Batch</Button><Button primary onClick={()=>beginBatch(pendingBatch)}>Start New Batch</Button></>}><p>Your current batch has {s.files.length} imported {s.files.length===1?'file':'files'}{s.importErrors.length?` and ${s.importErrors.length} failed imports`:''}. Starting over clears its files, rules, preview, and undo history.</p><p>Source files and downloaded copies stay untouched. Import preferences are kept.{pendingBatch==='samples'?' Sample files will be added to the new batch.':''}</p></Dialog>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
