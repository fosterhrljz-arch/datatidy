import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {handleAction as call} from '../src/worker.mjs';
import {parseInput,RULES} from '../src/core.mjs';
import {actionLabel} from '../src/reporting.mjs';
const bytes=new TextEncoder().encode('id,name,qty\n001, Alpha ,1\n002,Beta,2\n002,Beta,2\n,,\n');
const trim={...RULES,trim:true},duplicates={...RULES,duplicates:true};
async function setup(){await call('reset');let files;for(const name of ['a.csv','b.csv','c.csv'])files=await call('import',{name,bytes,options:{encoding:'auto',delimiter:'auto'}});return files;}

test('independent file rules determine actual ZIP contents and report actions',async()=>{
  const [a,b,c]=await setup();await call('rules',{id:a.id,rules:trim});await call('rules',{id:b.id,rules:duplicates});
  const files=await call('preview');assert.deepEqual(files.map(f=>f.rules),[trim,duplicates,RULES]);
  assert.deepEqual(files.map(f=>f.sheets[0].actions),[{trim:1,duplicates:0,empty:0},{trim:0,duplicates:1,empty:0},{trim:0,duplicates:0,empty:0}]);
  const zip=await JSZip.loadAsync((await call('export')).bytes,{checkCRC32:true});
  const ac=await parseInput('a.csv',await zip.file('a.cleaned.csv').async('uint8array'));
  const bc=await parseInput('b.csv',await zip.file('b.cleaned.csv').async('uint8array'));
  assert.equal(ac.sheets[0].rows.length,4);assert.equal(ac.sheets[0].rows[0].values[1],'Alpha');
  assert.equal(bc.sheets[0].rows.length,3);assert.equal(bc.sheets[0].rows[0].values[1],' Alpha ');
  assert.deepEqual(await zip.file('c.cleaned.csv').async('uint8array'),bytes);
  const report=JSON.parse(await zip.file('data-quality-report.json').async('string'));
  assert.deepEqual(report.files.map(f=>f.rules),[trim,duplicates,RULES]);assert.equal(report.state,'export');
  assert.deepEqual(report.files[1].sheets[0].rowMap.map(r=>r.originalRecord),[2,3,5]);
  assert.equal(report.files[1].sheets[0].actions.duplicates,1);assert.equal(report.files[1].sheets[0].actions.trim,0);
  assert.equal(actionLabel('whitespace',files[1].sheets[0],duplicates,true),'Not selected');
  assert.equal(actionLabel('whitespace',files[0].sheets[0],trim,true),'1 cell trimmed');
});
test('Apply to All copies independent rules; Undo restores file-specific selections',async()=>{
  const [a,b,c]=await setup();await call('rules',{id:a.id,rules:trim});await call('rules',{id:b.id,rules:duplicates});
  let files=await call('rules',{id:a.id,rules:trim,all:true});assert.ok(files.every(f=>f.rules.trim));
  files=await call('undoRules');assert.deepEqual(files.map(f=>f.rules),[trim,duplicates,RULES]);
  await call('rules',{id:a.id,rules:trim,all:true});files=await call('rules',{id:b.id,rules:duplicates});
  assert.deepEqual(files.map(f=>f.rules),[trim,duplicates,trim]);await assert.rejects(call('undoRules'),/no batch rule changes/);
  files=await call('import',{name:'new.csv',bytes});assert.deepEqual(files.at(-1).rules,RULES);
});
test('remove/undo retains rules; rule changes and reset reject stale exports',async()=>{
  const [a]=await setup();await call('rules',{id:a.id,rules:trim});await call('preview');
  await call('remove',{id:a.id});let restored=await call('restore');assert.deepEqual(restored.files.find(f=>f.id===a.id).rules,trim);
  await assert.rejects(call('export'),/Preview/);await call('preview');await call('rules',{id:a.id,rules:RULES});
  await assert.rejects(call('export'),/Preview/);await assert.rejects(call('page',{id:a.id,mode:'Compare'}),/Preview/);
  await call('reset');assert.equal((await call('report')).files.length,0);await assert.rejects(call('restore'),/no file removal/);await assert.rejects(call('export'),/Preview/);
});
test('analysis reports distinguish pending rules, zero changes and protected workbooks',async()=>{
  const [a]=await setup();await call('rules',{id:a.id,rules:trim});let report=await call('report');
  assert.equal(report.state,'analysis');assert.deepEqual(report.files[0].requestedRules,trim);assert.deepEqual(report.files[0].rules,RULES);assert.equal(report.files[0].sheets[0].changes.length,0);
  const protectedBytes=new Uint8Array(await readFile('samples/protected-formulas.xlsx'));
  let files=await call('import',{name:'protected.xlsx',bytes:protectedBytes});const p=files.at(-1);
  await call('rules',{id:p.id,rules:trim});files=await call('preview');const sheet=files.at(-1).sheets[0];
  assert.equal(actionLabel('whitespace',sheet,trim,true),'Protected · unchanged');
  assert.deepEqual((await call('report')).files.at(-1).sheets[0].appliedRules,RULES);
  assert.deepEqual((await call('export',{id:p.id})).bytes,protectedBytes);
  assert.equal(actionLabel('whitespace',{editable:true,actions:{trim:0}},trim,true),'Selected · no matching changes');
});
test('failed import preserves files, plans and rules; retry uses explicit encoding',async()=>{
  const [a]=await setup();await call('rules',{id:a.id,rules:trim});await call('preview');
  const encoded=new Uint8Array(await readFile('samples/encoding-windows1252.csv'));
  await assert.rejects(call('import',{name:'accent.csv',bytes:encoded,options:{encoding:'auto'}}),/encoding|UTF-8/i);
  assert.equal((await call('report')).state,'preview');await call('export');
  const files=await call('import',{name:'accent.csv',bytes:encoded,options:{encoding:'windows-1252'}});
  assert.equal(files.length,4);assert.deepEqual(files[0].rules,trim);assert.equal(files.at(-1).encoding,'windows-1252');await assert.rejects(call('export'),/Preview/);
});
test('search matches cell content across pages, literal punctuation, Unicode, numbers and column names',async()=>{
  await call('reset');const csv='id,name,secondary_name\n'+Array.from({length:25},(_,i)=>`${i},${i===24?'André [final]':'Needle '+i},${i===0?'false':'Other'}`).join('\n');
  const [file]=await call('import',{name:'search.csv',bytes:new TextEncoder().encode(csv)});
  const page=search=>call('page',{id:file.id,sheet:0,mode:'Original',filter:'all',...search});
  let result=await page({search:{kind:'content',query:'NEEDLE'},matchIndex:23});assert.equal(result.search.total,24);assert.equal(result.page,2);assert.deepEqual(result.search.active,{row:25,column:1});
  result=await page({search:{kind:'content',query:'NEEDLE'},matchIndex:null,page:1});assert.equal(result.search.activeIndex,10);assert.equal(result.search.active.row,12);
  result=await page({search:{kind:'column',query:'name'},matchIndex:1});assert.deepEqual(result.search.columns,[1,2]);assert.deepEqual(result.search.active,{row:null,column:2});
  result=await page({search:{kind:'content',query:'[final]'},matchIndex:0});assert.equal(result.rows[0].ref,26);
  result=await page({search:{kind:'content',query:'ANDRÉ'}});assert.equal(result.search.total,1);
  result=await page({search:{kind:'content',query:'false'}});assert.equal(result.search.total,1);
  result=await page({search:{kind:'row',query:'26'},matchIndex:0});assert.equal(result.rows[0].ref,26);
  result=await page({search:{kind:'row',query:'2x'}});assert.equal(result.rows.length,0);
  result=await page({search:{kind:'content',query:'not present'}});assert.equal(result.rows.length,0);
});
test('search respects Original/Compare/Cleaned and filters without changing source records',async()=>{
  const [a]=await setup();await call('rules',{id:a.id,rules:{...trim,duplicates:true}});await call('preview');
  const page=payload=>call('page',{id:a.id,sheet:0,filter:'all',search:{kind:'content',query:'Beta'},...payload});
  assert.equal((await page({mode:'Original'})).search.total,2);assert.equal((await page({mode:'Cleaned'})).search.total,1);
  assert.equal((await page({mode:'Compare',filter:'duplicates'})).rows[0].ref,4);
  assert.equal((await page({mode:'Original',search:{kind:'row',query:'4'}})).rows[0].ref,4);
  assert.equal((await page({mode:'Cleaned',search:{kind:'row',query:'4'}})).rows.length,0);
  assert.equal((await call('page',{id:a.id,mode:'Original'})).rows[0].values[1],' Alpha ');
});
test('worker searches a 100,000-record worksheet and preserves ZIP collision names',async()=>{
  await call('reset');const csv='id,name\n'+Array.from({length:100000},(_,i)=>`${i},${i===99999?'Final needle':'Record'}`).join('\n');
  const [large]=await call('import',{name:'large.csv',bytes:new TextEncoder().encode(csv)});
  const result=await call('page',{id:large.id,mode:'Original',search:{kind:'content',query:'needle'},matchIndex:0});
  assert.equal(result.search.total,1);assert.equal(result.rows[0].ref,100001);
  await call('reset');let files=await call('import',{name:'same.csv',bytes});files=await call('import',{name:'same.csv',bytes});
  await call('rules',{id:files[0].id,rules:trim});await call('preview');
  const zip=await JSZip.loadAsync((await call('export',{failedImports:[{file:'failed.csv',error:'Malformed'}]})).bytes,{checkCRC32:true});
  const report=JSON.parse(await zip.file('data-quality-report.json').async('string'));
  assert.notEqual(report.files[0].exportedAs,report.files[1].exportedAs);
  assert.deepEqual(await zip.file(report.files[1].exportedAs).async('uint8array'),bytes);
  assert.equal(report.excludedImports[0].file,'failed.csv');
});
