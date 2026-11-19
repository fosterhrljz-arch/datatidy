import React from 'react';
import {Search,ChevronLeft,ChevronRight,X} from 'lucide-react';
import {Icon} from './ui.jsx';
import {formatNumber} from './session.js';

export function Highlight({value,query}){
  const text=String(value),needle=String(query||'').trim().toLowerCase();
  if(!needle)return text;
  const lower=text.toLowerCase(),parts=[];let start=0,index;
  while((index=lower.indexOf(needle,start))!==-1){parts.push(text.slice(start,index),<mark key={index}>{text.slice(index,index+needle.length)}</mark>);start=index+needle.length;}
  parts.push(text.slice(start));return <>{parts}</>;
}
export function DataSearch({state,update,result,onClear}){
  const draft=state.searchDraft||{kind:'content',query:''};
  function submit(e){e.preventDefault();update({search:{...draft,query:draft.query.trim()},page:0,focusRef:null,cell:null,matchIndex:0,focusToken:(state.focusToken||0)+1});}
  const active=!!state.search?.query;
  return <div className="data-search"><form className="search-form" onSubmit={submit}>
    <label className="visually-hidden" htmlFor="search-kind">Search by</label><select id="search-kind" value={draft.kind} onChange={e=>update({searchDraft:{...draft,kind:e.target.value}})}><option value="content">Cell content</option><option value="column">Column name</option><option value="row">Original row number</option></select>
    <input aria-label="Search data" value={draft.query} maxLength={256} placeholder={draft.kind==='column'?'Find a column…':draft.kind==='row'?'Original row, e.g. 17':'Find in this worksheet…'} inputMode={draft.kind==='row'?'numeric':'text'} onChange={e=>update({searchDraft:{...draft,query:e.target.value}})}/><button className="icon-button" aria-label="Search worksheet" title="Search worksheet" type="submit"><Icon as={Search}/></button>
    {(active||draft.query)&&<button className="icon-button" aria-label="Clear search" title="Clear search" type="button" onClick={onClear}><Icon as={X}/></button>}
  </form>{active&&<div className="search-results"><span role="status">{result?`${formatNumber(result.total)} ${state.search.kind==='column'?'matching columns':state.search.kind==='row'?'matching records':'matching cells'} · ${state.search.kind==='row'?'Original view':'current view'}`:'Searching…'}</span><div className="search-navigation"><button className="icon-button" aria-label="Previous match" disabled={!result?.total||(result.activeIndex??0)<=0} onClick={()=>update({matchIndex:(result.activeIndex??0)-1,focusRef:null,cell:null,focusToken:(state.focusToken||0)+1})}><Icon as={ChevronLeft}/></button><span>{result?.total?(result.activeIndex??0)+1:0} / {formatNumber(result?.total)}</span><button className="icon-button" aria-label="Next match" disabled={!result?.total||(result.activeIndex??0)>=result.total-1} onClick={()=>update({matchIndex:(result.activeIndex??0)+1,focusRef:null,cell:null,focusToken:(state.focusToken||0)+1})}><Icon as={ChevronRight}/></button></div></div>}</div>;
}
