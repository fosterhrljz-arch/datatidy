import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronLeft,ChevronRight,Search,AlertCircle,PanelRightOpen,PanelRightClose,Check,Minus} from 'lucide-react';
import {Icon,SegmentedControl} from './ui.jsx';
import {rpc,formatNumber,labels} from './session.js';
import {DataSearch,Highlight} from './DataSearch.jsx';

export function Preview({file,sheetIndex,mode,setMode,ready,revision,tableState,setTableState,locate,inspectorOpen,onToggleInspector,clearCell}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[rowInput,setRowInput]=useState('');
  const [activeKey,setActiveKey]=useState(null),table=useRef(null);
  const sheet=file.sheets[sheetIndex];
  const {page,filter,focusRef,cell,search,matchIndex}=tableState;
  const seenFocus=useRef(tableState.focusToken||0);
  useEffect(()=>{let alive=true;setError('');setData(null);rpc('page',{id:file.id,sheet:sheetIndex,page,mode,filter,focusRef,search,matchIndex}).then(d=>{if(alive){setData({...d,focusToken:tableState.focusToken||0});setActiveKey(`${d.rows.find(r=>r.ref===focusRef)?.ref??d.rows[0]?.ref}:1`);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[file.id,sheetIndex,page,mode,filter,focusRef,revision,search?.kind,search?.query,matchIndex,tableState.focusToken]);
  useEffect(()=>{
    if(!data||data.focusToken!==(tableState.focusToken||0)||seenFocus.current===(tableState.focusToken||0))return;
    seenFocus.current=tableState.focusToken||0;
    const active=data.search?.active;if(!active)return;
    const target=active.row===null?table.current?.querySelector(`[data-column="${active.column}"]`):table.current?.querySelector(`[data-grid-row="${active.row}"][data-grid-col="${active.column===null?0:active.column+1}"]`);
    if(target){target.scrollIntoView({block:'nearest',inline:'nearest'});target.focus({preventScroll:true});}
  },[data,tableState.focusToken]);
  const clearSearch=()=>update({search:{kind:'content',query:''},searchDraft:{kind:'content',query:''},matchIndex:null,page:0,focusRef:null,cell:null});
  const update=patch=>setTableState(s=>({...s,...patch}));
  const inspect=(row,c)=>{update({cell:{row,c}});if(!inspectorOpen)onToggleInspector();};
  function gridProps(row,c){return {'data-grid-row':row.ref,'data-grid-col':c,tabIndex:activeKey===`${row.ref}:${c}`?0:-1,onFocus:()=>setActiveKey(`${row.ref}:${c}`)};}
  function move(e){
    if(e.key==='Escape'&&cell){e.preventDefault();clearCell();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    const current=e.target.closest('[data-grid-row]');if(!current)return;
    const buttons=Array.from(table.current.querySelectorAll('[data-grid-row]'));
    const row=Number(current.dataset.gridRow),col=Number(current.dataset.gridCol);
    const sameRow=buttons.filter(b=>Number(b.dataset.gridRow)===row);
    let target;
    if(e.key==='Home'||e.key==='End'){const group=e.ctrlKey||e.metaKey?buttons:sameRow;target=e.key==='Home'?group[0]:group.at(-1);}
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const at=sameRow.indexOf(current);target=sameRow[at+(e.key==='ArrowRight'?1:-1)];}
    else{const rows=data.rows.map(r=>r.ref),next=rows[rows.indexOf(row)+(e.key==='ArrowDown'?1:-1)];target=buttons.find(b=>Number(b.dataset.gridRow)===next&&Number(b.dataset.gridCol)===col)||buttons.find(b=>Number(b.dataset.gridRow)===next);}
    e.preventDefault();if(target){target.focus();const r=data.rows.find(r=>r.ref===Number(target.dataset.gridRow)),c=Number(target.dataset.gridCol);if(c<=sheet.width)inspect(r,c===0?null:c-1);}
  }
  function jump(e){e.preventDefault();const row=Number(rowInput);if(!Number.isInteger(row)||row<2||row>sheet.analysis.records+1){setError(`Enter a source row from 2 to ${sheet.analysis.records+1}. Row 1 is the header.`);return;}locate('all',row);setRowInput('');}
  return <section className="preview" aria-label="Data preview">
    <div className="preview-heading"><div className="preview-title"><h2 title={file.name}>{file.name}</h2><p className="preview-path"><span>{sheet.name==='Data'?'Data worksheet':sheet.name}</span><ChevronRight size={12} aria-hidden="true"/><span>{formatNumber(sheet.analysis.records)} records · {sheet.width} columns</span></p></div><div className="preview-heading-controls"><SegmentedControl label="Preview mode" items={['Original','Compare','Cleaned']} value={mode} disabled={ready?[]:['Compare','Cleaned']} onChange={m=>{setMode(m);update({page:0,focusRef:null,cell:null,matchIndex:0});}}/><button className="icon-button inspector-toggle" aria-label={inspectorOpen?'Hide inspector':'Show inspector'} title={inspectorOpen?'Hide inspector':'Show inspector'} aria-expanded={inspectorOpen} onClick={onToggleInspector}><Icon as={inspectorOpen?PanelRightClose:PanelRightOpen}/></button></div></div>
    <div className="table-toolbar"><select aria-label="Filter rows" value={filter} onChange={e=>update({filter:e.target.value,page:0,focusRef:null,cell:null,matchIndex:0})}><option value="all">All records</option><option value="issues">With detected issues</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}{ready&&<option value="changes">With changes</option>}</select><form className="row-search" onSubmit={jump}><label htmlFor="source-row">Go to row</label><input id="source-row" disabled={!sheet.analysis.records} inputMode="numeric" placeholder="e.g. 12" value={rowInput} onChange={e=>setRowInput(e.target.value)}/><button type="submit" className="icon-button" disabled={!sheet.analysis.records} aria-label="Locate original row"><Icon as={Search}/></button></form></div>
    <DataSearch state={tableState} update={patch=>{if(patch.search?.kind==='row'&&patch.search.query)setMode('Original');update(patch);}} result={data?.search} onClear={clearSearch}/>
    {file.warnings.length>0&&<details className="file-warnings"><summary><Icon as={AlertCircle}/>{!sheet.editable?'Workbook protected · cleaning disabled':`${file.warnings.length} import ${file.warnings.length===1?'notice':'notices'}`}</summary>{file.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
    {filter!=='all'&&<div className="filter-note" role="status">{labels[filter]|| (filter==='changes'?'Proposed changes':'Detected issues')}<button onClick={()=>update({filter:'all',focusRef:null,page:0,cell:null})}>Clear filter</button></div>}
    {error&&<div className="notice error" role="alert"><Icon as={AlertCircle}/><span>{error}</span><button className="text-button" onClick={()=>{update({filter:'all',page:0,focusRef:null,search:{kind:'content',query:''},searchDraft:{kind:'content',query:''},matchIndex:null});setError('');}}>Reset view</button></div>}
    <p id="table-keyboard-help" className="visually-hidden">Read-only data. Use arrow keys to select cells, Home and End to move within a row, and Control or Command with Home or End to move within this page. Enter opens details. Escape closes details. Tab leaves the table.</p>
    <div className="data-table-scroll" aria-busy={!data&&!error}><table ref={table} className="data-table" aria-describedby="table-keyboard-help" onKeyDown={move}><caption className="visually-hidden">{file.name}, {sheet.name}, {mode.toLowerCase()} view. Row numbers refer to the original file.</caption><thead><tr><th scope="col" className="row-ref">Source row</th>{Array.from({length:sheet.width},(_,i)=><th scope="col" key={i} tabIndex={-1} data-column={i} className={data?.search?.active?.row===null&&data?.search?.active?.column===i?'search-current':''}><Highlight value={sheet.headers[i]||`Column ${i+1}`} query={search?.kind==='column'?search.query:''}/></th>)}<th scope="col">Review</th></tr></thead><tbody>{data?.rows.map(row=><tr key={row.ref} className={`${mode!=='Original'&&row.removed?'removed-row':''} ${focusRef===row.ref||data?.search?.active?.row===row.ref?'focused-row':''}`}>
      <td className="row-ref"><button {...gridProps(row,0)} data-inspected={cell?.row.ref===row.ref&&cell?.c===null} title={`Inspect source row ${row.ref}`} aria-label={`Inspect source row ${row.ref}`} onClick={()=>inspect(row,null)}>{search?.kind==='row'&&search.query&&row.ref===Number(search.query)?<mark>{row.ref}</mark>:row.ref}</button></td>
      {Array.from({length:sheet.width},(_,c)=>{
        const changed=Object.hasOwn(row.edits,c),issue=row.issues.whitespace.includes(c)||row.issues.missing.includes(c)||row.issues.mixed.includes(c),value=row.values[c]??'';
        const title=[row.issues.whitespace.includes(c)?'Extra whitespace':'',row.issues.missing.includes(c)?'Missing value':'',row.issues.mixed.includes(c)?'Mixed types in this column':''].filter(Boolean).join(' · ');
        const detail=mode!=='Original'&&row.removed?'. Row will be removed':mode==='Compare'&&changed?`. Proposed value: ${JSON.stringify(row.edits[c])}`:'';
        const selected=cell?.row.ref===row.ref&&cell?.c===c;
        return <td key={c} className={`${mode!=='Original'&&changed?'changed':issue?'issue':''} ${selected?'selected-cell':''} ${data?.search?.active?.row===row.ref&&data?.search?.active?.column===c?'search-current':''}`}><button {...gridProps(row,c+1)} data-inspected={selected} className="cell-button" title={`${title?title+' — ':''}${value}${detail}`} aria-label={`Row ${row.ref}, ${sheet.headers[c]||`column ${c+1}`}: ${value===''?'empty':value}${title?'. '+title:''}${detail}`} onClick={()=>inspect(row,c)}>
          {mode==='Compare'&&changed?<span className="cell-diff"><del><Highlight value={JSON.stringify(value)} query={search?.kind==='content'?search.query:''}/></del><Icon as={ArrowRight}/><ins><Highlight value={JSON.stringify(row.edits[c])} query={search?.kind==='content'?search.query:''}/></ins></span>:<span className="cell-value">{value===''?<span className="empty-value">—</span>:<Highlight value={value} query={search?.kind==='content'?search.query:''}/>}</span>}
          {(issue||changed)&&<span className="cell-marker" aria-hidden="true"><Icon as={mode!=='Original'&&changed?Check:AlertCircle}/></span>}
        </button></td>;
      })}
      <td className="review-cell">{mode!=='Original'&&row.removed?<span className="removal-label"><Icon as={Minus}/>Will be removed</span>:row.issues.duplicateOf!==null?<button {...gridProps(row,sheet.width+1)} className="text-button" onClick={()=>locate('all',row.issues.duplicateOf)}>Same as row {row.issues.duplicateOf}<Icon as={ArrowRight}/></button>:row.issues.empty?'Empty row':Object.keys(row.edits).length&&mode!=='Original'?'Whitespace trimmed':'—'}</td>
    </tr>)}{data?.rows.length===0&&<tr><td colSpan={sheet.width+2} className="table-empty">No records match this view.<button className="text-button" onClick={()=>update({filter:'all',page:0,focusRef:null,search:{kind:'content',query:''},searchDraft:{kind:'content',query:''},matchIndex:null})}>Show all records</button></td></tr>}{!data&&!error&&<tr><td colSpan={sheet.width+2} className="table-empty">Loading preview…</td></tr>}</tbody></table></div>
    <div className="table-status"><span aria-live="polite">{data?.total?`${data.page*10+1}–${Math.min(data.page*10+10,data.total)} of ${formatNumber(data.total)}`:'0'} records</span><div className="pagination"><button className="icon-button" aria-label="Previous page" disabled={!data||data.page===0} onClick={()=>update({page:data.page-1,focusRef:null,cell:null,matchIndex:null})}><Icon as={ChevronLeft}/></button><span>{(data?.page||0)+1} / {(data?.maxPage||0)+1}</span><button className="icon-button" aria-label="Next page" disabled={!data||data.page>=data.maxPage} onClick={()=>update({page:data.page+1,focusRef:null,cell:null,matchIndex:null})}><Icon as={ChevronRight}/></button></div></div>
    <div className="table-legend"><span><Icon as={AlertCircle}/>Issue</span>{ready&&<><span><Icon as={Check}/>Changed</span><span><Icon as={Minus}/>Removed row</span></>}<span className="source-note" title="Use arrow keys to select cells. Enter opens details; Escape closes details; Tab leaves the table.">Arrow keys to navigate</span></div>
  </section>;
}
