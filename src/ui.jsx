import React,{useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export const Icon=({as:Component,...props})=><Component size={18} strokeWidth={1.7} aria-hidden="true" focusable="false" {...props}/>;
export function Button({children,primary=false,icon:Glyph,...props}){return <button className={`button ${primary?'primary':''}`} {...props}>{Glyph&&<Icon as={Glyph}/>} {children}</button>;}
// One tab stop per group; arrows change selection without leaving the control.
export function SegmentedControl({label,items,value,onChange,disabled=[]}){
  function move(e){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();
    const enabled=items.filter(item=>!disabled.includes(item));
    const at=enabled.indexOf(value);
    const next=e.key==='Home'?enabled[0]:e.key==='End'?enabled.at(-1):enabled[(at+(e.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length];
    if(next){onChange(next);Array.from(e.currentTarget.children).find(b=>b.textContent===next)?.focus();}
  }
  return <div className="segments" role="group" aria-label={label} onKeyDown={move}>{items.map(item=><button key={item} type="button" aria-pressed={item===value} className={item===value?'selected':''} tabIndex={item===value?0:-1} disabled={disabled.includes(item)} onClick={()=>onChange(item)}>{item}</button>)}</div>;
}
export function Dialog({title,children,onClose,footer}){
  const ref=useRef(null);
  useEffect(()=>{const dialog=ref.current,previous=document.activeElement;dialog.showModal();dialog.querySelector('[data-initial-focus]')?.focus();return()=>{dialog.close();if(previous?.isConnected)previous.focus();};},[]);
  return <dialog ref={ref} onCancel={e=>{e.preventDefault();onClose();}} aria-label={title}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon as={X}/></button></div><div className="dialog-body">{children}</div>{footer&&<div className="dialog-footer">{footer}</div>}</dialog>;
}
