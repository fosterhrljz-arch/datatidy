import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';
import {parseInput,planDocument,exportDocument,exportBatch,reportDocument,LIMITS} from '../src/core.mjs';
import {makeWorkbook} from '../scripts/samples.mjs';
const bytes=s=>new TextEncoder().encode(s), all={trim:true,empty:true,duplicates:true};
const parse=(s,name='test.csv',options={})=>parseInput(name,bytes(s),options);
test('detects five issue classes; keeps headers, leading zeros and originals immutable',async()=>{
  const doc=await parse('id,name,amount\r\n001, Alice ,10\r\n002,Bob,unknown\r\n002,Bob,unknown\r\n,,\r\n003,,20\r\n');
  assert.deepEqual(doc.sheets[0].analysis.counts,{duplicates:1,empty:1,missing:4,whitespace:1,mixed:1});
  const original=JSON.stringify(doc.sheets[0].rows),plan=planDocument(doc,all);
  assert.equal(plan.sheets[0].rows.length,3);assert.equal(plan.sheets[0].rows[0].values[0],'001');assert.equal(plan.sheets[0].rows[0].values[1],'Alice');
  assert.equal(JSON.stringify(doc.sheets[0].rows),original);assert.deepEqual(plan.sheets[0].removed,[4,5]);
  const out=await parseInput('out.csv',await exportDocument(doc,plan));assert.deepEqual(out.sheets[0].headers,['id','name','amount']);assert.equal(out.sheets[0].rows[2].values[1],'');
  assert.equal(reportDocument(doc,plan).sheets[0].rowMap[2].originalRecord,6);
});
test('all rules off gives a byte-identical copy',async()=>{const doc=await parse('\uFEFF"id","name"\n"001"," Alice "\n\n');assert.deepEqual(await exportDocument(doc,planDocument(doc)),doc.bytes);});
test('each rule acts independently and duplicates match before trim',async()=>{
  const doc=await parse('id,name\n1,A\n1, A \n1,A\n,\n');
  assert.equal(planDocument(doc,{trim:true}).sheets[0].rows.length,4);
  const p=planDocument(doc,{duplicates:true});assert.deepEqual(p.sheets[0].removed,[4]);assert.equal(p.sheets[0].rows[1].values[1],' A ');
  assert.deepEqual(planDocument(doc,{empty:true}).sheets[0].removed,[5]);
  assert.deepEqual(planDocument(doc,all).sheets[0].removed,[4,5]);
});
test('quoted newlines, delimiters, empty rows, formula strings, and ragged records survive',async()=>{
  const doc=await parse(' id ,text,note\n0001," hello, world ","line one\nline two"\n\n0002,=SUM(A1:A2),x,EXTRA\n');
  const out=await parseInput('out.csv',await exportDocument(doc,planDocument(doc,{trim:true})));
  assert.equal(out.sheets[0].headers[0],' id ');assert.equal(out.sheets[0].rows[0].values[1],'hello, world');assert.equal(out.sheets[0].rows[0].values[2],'line one\nline two');assert.equal(out.sheets[0].rows[1].values.length,1);assert.equal(out.sheets[0].rows[2].values.length,4);assert.equal(out.sheets[0].rows[2].values[1],'=SUM(A1:A2)');
});
test('trailing newline is not an extra empty row; intentional blank records remain',async()=>{assert.equal((await parse('id\n1\n')).sheets[0].rows.length,1);assert.equal((await parse('id\n1\n\n')).sheets[0].rows.length,2);});
test('rejects malformed CSV, invalid encodings and unsupported extensions',async()=>{await assert.rejects(()=>parse('id,name\n1,"bad'),/Malformed/);await assert.rejects(()=>parseInput('a.csv',new Uint8Array([0xe9])),/encoding/i);await assert.rejects(()=>parse('anything','a.xls'),/Unsupported/);await assert.rejects(()=>parse(''),/empty/);});
test('Windows-1252 preserves encoding and accented characters',async()=>{const src=Buffer.from('id,name\r\n001, Andr\xe9 \r\n','latin1');const doc=await parseInput('a.csv',src,{encoding:'windows-1252'});const out=await exportDocument(doc,planDocument(doc,{trim:true}));assert.deepEqual(Buffer.from(out),Buffer.from('id,name\r\n001,Andr\xe9\r\n','latin1'));});
test('UTF-16 LE/BE and UTF-8 BOM are preserved',async()=>{for(const enc of ['utf-16le','utf-16be','utf-8']){let source;if(enc==='utf-8')source=bytes('\uFEFFid,name\n001, Zoë \n');else{source=Buffer.from('\uFEFFid,name\n001, Zoë \n','utf16le');if(enc==='utf-16be')source.swap16();}const doc=await parseInput('a.csv',source);const out=await parseInput('a.csv',await exportDocument(doc,planDocument(doc,{trim:true})));assert.equal(out.encoding,enc);assert.equal(out.bom,true);assert.equal(out.sheets[0].rows[0].values[1],'Zoë');}});
test('TSV and semicolon CSV retain separator and field boundaries',async()=>{for(const [name,delimiter] of [['x.tsv','\t'],['x.csv',';']]){const doc=await parse(`id${delimiter}name\n001${delimiter} A \n`,name);const out=await parseInput(name,await exportDocument(doc,planDocument(doc,all)));assert.equal(out.delimiter,delimiter);assert.deepEqual(out.sheets[0].rows[0].values,['001','A']);}});
test('all records removable still retains header',async()=>{const doc=await parse('a,b\n,\n');const out=await parseInput('a.csv',await exportDocument(doc,planDocument(doc,all)));assert.deepEqual(out.sheets[0].headers,['a','b']);assert.equal(out.sheets[0].rows.length,0);});
test('XLSX multiple sheets: trims, deletes, shifts references and retains other archive entries',async()=>{
  const original=await makeWorkbook([{name:'Products',rows:[['id','name','stock'],['001',' Lamp ',10],['001',' Lamp ',10],['','',''],['002','Book',20]]},{name:'Hidden',hidden:true,rows:[['code'],[' C ']]}],{'docProps/custom.xml':'<metadata>untouched</metadata>'});
  const doc=await parseInput('book.xlsx',original),plan=planDocument(doc,all),out=await exportDocument(doc,plan),again=await parseInput('clean.xlsx',out);
  assert.equal(again.sheets.length,2);assert.equal(again.sheets[0].rows.length,2);assert.deepEqual(again.sheets[0].rows.map(r=>r.values),[['001','Lamp','10'],['002','Book','20']]);assert.equal(again.sheets[0].rows[1].ref,3);assert.equal(again.sheets[0].rows[0].types[2],'n');assert.equal(again.sheets[1].hidden,true);assert.equal(again.sheets[1].rows[0].values[0],'C');
  const zip=await JSZip.loadAsync(out);assert.equal(await zip.file('docProps/custom.xml').async('string'),'<metadata>untouched</metadata>');
});
test('formulas or dependent structures protect the entire workbook with byte-exact output',async()=>{const raw=await makeWorkbook([{name:'Main',rows:[['id','name'],['001',' A ']]},{name:'Formula',rows:[['total'],[{formula:'Main!A2'}]]}]);const doc=await parseInput('f.xlsx',raw);assert.ok(doc.sheets.every(s=>!s.editable));assert.deepEqual(await exportDocument(doc,planDocument(doc,all)),raw);});
test('shared strings and rich text are handled without altering rich cells',async()=>{
  const raw=await makeWorkbook([{name:'Data',rows:[['name'],['placeholder'],['placeholder']]}]);const zip=await JSZip.loadAsync(raw);let x=await zip.file('xl/worksheets/sheet1.xml').async('string');x=x.replace('<c r="A2" t="inlineStr"><is><t xml:space="preserve">placeholder</t></is></c>','<c r="A2" t="s"><v>0</v></c>').replace('<c r="A3" t="inlineStr"><is><t xml:space="preserve">placeholder</t></is></c>','<c r="A3" t="s"><v>1</v></c>');zip.file('xl/worksheets/sheet1.xml',x);zip.file('xl/sharedStrings.xml','<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t> A </t></si><si><r><t> B </t></r></si></sst>');const doc=await parseInput('s.xlsx',await zip.generateAsync({type:'uint8array'})),plan=planDocument(doc,{trim:true});assert.equal(plan.sheets[0].changes.length,1);assert.equal(plan.sheets[0].rows[1].values[0],' B ');const again=await parseInput('s.xlsx',await exportDocument(doc,plan));assert.equal(again.sheets[0].rows[0].values[0],'A');assert.equal(again.sheets[0].rows[1].values[0],' B ');
});
test('batch ZIP exports all files, resolves name collisions, and reports full changes',async()=>{
  const a=await parse('id,name\n001, A \n'),b=await parse('id,name\n002,B\n');const zip=await JSZip.loadAsync(await exportBatch([a,b].map(doc=>({doc,plan:planDocument(doc,all)}))));assert.ok(zip.file('test.cleaned.csv'));assert.ok(zip.file('test.cleaned (2).csv'));const report=JSON.parse(await zip.file('data-quality-report.json').async('string'));assert.equal(report.files.length,2);assert.equal(report.files[0].sheets[0].changes[0].before,' A ');assert.equal(report.files[0].sheets[0].remaining.records,1);
});
test('100,000 records process accurately; over-limit data and corrupt XLSX fail clearly',async()=>{
  const lines=['id,name'];for(let i=0;i<100000;i++)lines.push(`${String(i).padStart(6,'0')}, Name ${i} `);
  const doc=await parse(lines.join('\n'));const plan=planDocument(doc,{trim:true});assert.equal(plan.sheets[0].changes.length,100000);assert.equal(plan.sheets[0].rows.at(-1).values[0],'099999');
  await assert.rejects(()=>parse(lines.join('\n')+'\n100000,Overflow'),/limit/);await assert.rejects(()=>parseInput('bad.xlsx',bytes('not a zip')),/Invalid XLSX/);await assert.rejects(()=>parseInput('big.csv',new Uint8Array(LIMITS.fileBytes+1)),/25 MB/);
});
test('bundled sample expectations match documented cleaning outcomes',async()=>{const doc=await parseInput('customers.csv',await readFile('samples/customers.csv'));assert.equal(doc.sheets[0].rows.length,24);const plan=planDocument(doc,all);assert.equal(plan.sheets[0].rows.length,22);assert.equal(plan.sheets[0].changes.length,5);});
