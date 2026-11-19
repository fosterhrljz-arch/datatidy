import React,{useRef} from 'react';
import {AlertCircle,RotateCcw,X,Upload} from 'lucide-react';
import {Icon,Button} from './ui.jsx';

function FailedImport({entry,busy,onOptions,onRetry,onDismiss}){
  const input=useRef(null),text=/\.(csv|tsv)$/i.test(entry.name);
  return <article className="failed-import" aria-label={`Import error: ${entry.name}`}>
    <div className="failed-heading"><Icon as={AlertCircle}/><strong>{entry.name}</strong><button className="icon-button" disabled={busy} aria-label={`Dismiss failed import ${entry.name}`} onClick={()=>onDismiss(entry.id)}><Icon as={X}/></button></div>
    <p className="import-error-text">{entry.message}</p>
    <div className="retry-options">{text&&<><label>Encoding<select aria-label={`Encoding for ${entry.name}`} disabled={busy} value={entry.options.encoding} onChange={e=>onOptions(entry.id,{...entry.options,encoding:e.target.value})}><option value="auto">Auto (UTF-8 / BOM)</option><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option></select></label>{/\.csv$/i.test(entry.name)&&<label>Separator<select aria-label={`Separator for ${entry.name}`} disabled={busy} value={entry.options.delimiter} onChange={e=>onOptions(entry.id,{...entry.options,delimiter:e.target.value})}><option value="auto">Detect automatically</option><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value={'\t'}>Tab</option><option value="|">Pipe (|)</option></select></label>}</>}
      <Button icon={RotateCcw} disabled={busy} onClick={()=>onRetry(entry.id)}>Retry import</Button><button className="text-button" disabled={busy} onClick={()=>input.current.click()}><Icon as={Upload}/>Choose replacement</button>
    </div><input ref={input} type="file" className="visually-hidden" tabIndex={-1} aria-label={`Replacement for ${entry.name}`} accept=".csv,.tsv,.xlsx" onChange={e=>{if(e.target.files[0])onRetry(entry.id,e.target.files[0]);e.target.value='';}}/>
    <p className="muted">Retry uses this file's settings. For malformed data, fix the source and choose the corrected file.</p>
  </article>;
}
export function ImportErrors({entries,busy,onOptions,onRetry,onDismiss}){
  if(!entries.length)return null;
  return <section className="import-errors" aria-label="Files needing attention"><h2>Needs attention <span>{entries.length}</span></h2><p className="muted">These files are not in your batch. Successfully imported files are kept.</p>{entries.map(entry=><FailedImport key={entry.id} entry={entry} busy={busy} onOptions={onOptions} onRetry={onRetry} onDismiss={onDismiss}/>)}</section>;
}
