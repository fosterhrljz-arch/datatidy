import React,{useEffect,useState} from 'react';
import {ShieldCheck,ChevronRight,ArrowRight,ArrowLeft,CheckCheck,Info} from 'lucide-react';
import {Icon,Button,SegmentedControl} from './ui.jsx';
import {formatNumber,labels,countRules} from './session.js';

export function RulesPanel({rules,onChange,busy,file,onApplyAll,canApplyAll,canUndoRules,onUndoRules}){
  return <section className="rules"><p className="scope-label" title={file.name}>This file · {file.name}</p><h3>Cleaning rules</h3><p className="muted">Applies only to this file and its editable worksheets.</p>
    <div className="rule-options">{[['trim','Trim whitespace','Remove spaces at the edges of text.'],['empty','Remove empty rows','Remove rows with no values.'],['duplicates','Remove exact duplicates','Keep the first identical record.']].map(([key,title,desc])=><label key={key} className={`rule ${rules[key]?'chosen':''}`}><input type="checkbox" checked={rules[key]} onChange={e=>onChange({...rules,[key]:e.target.checked})} disabled={busy}/><span><strong>{title}</strong><small>{desc}</small></span></label>)}</div>
    <div className="rule-note"><Icon as={ShieldCheck}/><p>Missing values and mixed types are review-only. Nothing is filled or converted.</p></div><span className="rule-count">{countRules(rules)} of 3 rules selected</span><div className="apply-rules"><Button onClick={onApplyAll} disabled={busy||!canApplyAll}>Apply to All</Button><p className="muted">Copy these rules to all current files. Each file remains independent.</p>{canUndoRules&&<button className="text-button" disabled={busy} onClick={onUndoRules}>Undo Apply to All</button>}</div>
  </section>;
}
export function Inspector({step,file,sheetIndex,rules,onChange,busy,ready,cell,clearCell,locate,filter,onApplyAll,canApplyAll,canUndoRules,onUndoRules}){
  const sheet=file.sheets[sheetIndex];
  const [panel,setPanel]=useState(step===1?'Rules':'Issues');
  useEffect(()=>setPanel(step===1?'Rules':'Issues'),[step]);
  return <aside className="inspector" aria-label="Context inspector" onKeyDown={e=>{if(e.key==='Escape'&&cell){e.preventDefault();clearCell();}}}>
    <div className="inspector-navigation">{cell?<button className="text-button" aria-label="Close cell details" onClick={clearCell}><Icon as={ArrowLeft}/>Back to {panel.toLowerCase()}</button>:step===1?<SegmentedControl label="Inspector view" items={['Rules','Issues']} value={panel} onChange={setPanel}/>:<span className="inspector-label">Worksheet inspector</span>}</div>
    <div className="inspector-content">{cell?<section className="cell-inspector">
      <p className="scope-label">Selected {cell.c===null?'record':'cell'} · {sheet.name}</p><h3>Source row {cell.row.ref}</h3><p className="muted">{cell.c===null?'Record details':sheet.headers[cell.c]||`Column ${cell.c+1}`}</p>
      {cell.c!==null&&<><span className="field-label">Original value</span><pre>{JSON.stringify(cell.row.originalValues[cell.c]??'')}</pre>{Object.hasOwn(cell.row.edits,cell.c)&&<><span className="field-label">After preview</span><pre className="new-value">{JSON.stringify(cell.row.edits[cell.c])}</pre></>}</>}
      {cell.row.removed&&<p className="notice">This row will be removed from the exported copy.</p>}
      {cell.row.issues.duplicateOf!==null&&<p>Exact duplicate of source row {cell.row.issues.duplicateOf}.</p>}
      {cell.c!==null&&['missing','whitespace','mixed'].filter(k=>cell.row.issues[k].includes(cell.c)).map(k=><p className="cell-issue" key={k}><Icon as={Info}/>{labels[k]}</p>)}
      <button className="text-button" onClick={()=>locate('all',cell.row.ref)}>Locate in original<Icon as={ArrowRight}/></button>
      <p className="muted">Read-only inspection. Source values are never edited here.</p>
    </section>:<>{step===1&&panel==='Rules'?<RulesPanel rules={rules} onChange={onChange} busy={busy} file={file} onApplyAll={onApplyAll} canApplyAll={canApplyAll} canUndoRules={canUndoRules} onUndoRules={onUndoRules}/>:<>
      <section className="issue-inspector"><p className="scope-label">This worksheet · {sheet.name}</p><h3>Detected issues</h3><div className="issue-list">{Object.entries(labels).map(([key,label])=><button key={key} className={filter===key?'active':''} disabled={!sheet.analysis.counts[key]} onClick={()=>locate(key)} aria-label={`Locate ${label.toLowerCase()}`}><span>{label}</span><b>{formatNumber(sheet.analysis.counts[key])}</b><Icon as={ChevronRight}/></button>)}</div><p className="muted">Select an issue to find it in the original data. Counts may overlap.</p></section>
      {ready&&<section className="inspector-summary"><h3>Worksheet preview</h3><dl><div><dt>Proposed changes</dt><dd>{formatNumber(sheet.changes)}</dd></div><div><dt>Rows to remove</dt><dd>{formatNumber(sheet.removed)}</dd></div><div><dt>Records remaining</dt><dd>{formatNumber(sheet.after?.records)}</dd></div></dl><p><Icon as={CheckCheck}/>Preview up to date</p></section>}
    </>}</>}
    {!sheet.editable&&<div className="notice">This workbook is protected. It will export unchanged.</div>}</div>
  </aside>;
}
