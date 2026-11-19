import Papa from 'papaparse';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export const LIMITS = { fileBytes: 25 * 1024 * 1024, expandedBytes: 100 * 1024 * 1024, rows: 100000, cells: 1000000, columns: 512, batchBytes: 100 * 1024 * 1024, files: 25 };
export const RULES = { trim: false, empty: false, duplicates: false };
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const utf8 = new TextEncoder();
const tags = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const first = (node, name) => tags(node, name)[0];
const xml = text => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML entities and document types are not supported.');
  return new DOMParser({ onError: (level, message) => { if (level !== 'warning') throw new Error(`Invalid workbook XML: ${message}`); } }).parseFromString(text, 'application/xml');
};
const serialize = node => new XMLSerializer().serializeToString(node);
export function columnName(index) { let s = ''; for (index++; index; index = Math.floor((index - 1) / 26)) s = String.fromCharCode(65 + (index - 1) % 26) + s; return s; }
const columnIndex = ref => [...ref.replace(/\d/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const blank = row => row.values.every((v, i) => !row.locked?.[i] && String(v).trim() === '');
const keyOf = row => JSON.stringify([row.values, row.types || []]);
function category(value, type) {
  if (value === '') return null;
  if (type === 'f') return 'formula';
  if (type === 'n') return 'number';
  if (type === 'b') return 'boolean';
  const v = String(value).trim();
  if (/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v)) return 'number';
  if (/^(true|false)$/i.test(v)) return 'boolean';
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)) return 'date-like';
  return 'text';
}
export function analyze(sheet) {
  const counts = { duplicates: 0, empty: 0, missing: 0, whitespace: 0, mixed: 0 };
  const seen = new Map();
  const kinds = Array.from({length: sheet.width}, () => new Set());
  for (const row of sheet.rows) {
    row.issues = { missing: [], whitespace: [], mixed: [], duplicateOf: null, empty: blank(row) };
    if (row.issues.empty) counts.empty++;
    const key = keyOf(row);
    if (!row.issues.empty && seen.has(key)) { row.issues.duplicateOf = seen.get(key); counts.duplicates++; }
    else if (!row.issues.empty) seen.set(key, row.ref);
    for (let c = 0; c < sheet.width; c++) {
      const v = row.values[c] ?? '';
      if (v === '' && !row.locked?.[c]) { counts.missing++; row.issues.missing.push(c); }
      if (typeof v === 'string' && v !== v.trim()) { counts.whitespace++; row.issues.whitespace.push(c); }
      const kind = category(v, row.types?.[c]);
      if (kind && kind !== 'formula') kinds[c].add(kind);
    }
  }
  const mixedColumns = kinds.flatMap((s, c) => s.size > 1 ? [c] : []);
  counts.mixed = mixedColumns.length;
  for (const row of sheet.rows) row.issues.mixed = mixedColumns.filter(c => (row.values[c] ?? '') !== '');
  return { counts, mixedColumns, records: sheet.rows.length, columns: sheet.width };
}
function validateSize(sheets) {
  let cells = 0;
  for (const sheet of sheets) {
    if (sheet.rows.length > LIMITS.rows || sheet.width > LIMITS.columns) throw new Error('Dataset exceeds the limit of 100,000 records or 512 columns per sheet. Split it into smaller files.');
    cells += (sheet.rows.length + 1) * sheet.width;
  }
  if (cells > LIMITS.cells) throw new Error('This file exceeds 1,000,000 cells. Split it into smaller files.');
}
function decode(bytes, requested = 'auto') {
  let encoding = requested, bom = false;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { encoding = 'utf-8'; bom = true; }
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; bom = true; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; bom = true; }
  else if (encoding === 'auto') encoding = 'utf-8';
  try {
    const text = new TextDecoder(encoding, {fatal: true}).decode(bytes);
    if (text.includes('\0')) throw new Error('Null bytes');
    return {text, encoding, bom};
  } catch { throw new Error('Cannot decode this text file safely. Choose its encoding in Import settings and import it again.'); }
}
function encode(text, encoding, bom) {
  if (encoding === 'utf-8') return utf8.encode((bom ? '\uFEFF' : '') + text);
  if (encoding.startsWith('utf-16')) {
    const str = (bom ? '\uFEFF' : '') + text, data = new Uint8Array(str.length * 2), view = new DataView(data.buffer);
    for (let i = 0; i < str.length; i++) view.setUint16(i * 2, str.charCodeAt(i), encoding === 'utf-16le');
    return data;
  }
  const decoder = new TextDecoder('windows-1252'), map = new Map();
  for (let i = 0; i < 256; i++) map.set(decoder.decode(new Uint8Array([i])), i);
  return Uint8Array.from([...text].map(c => { if (!map.has(c)) throw new Error('A character cannot be represented in Windows-1252.'); return map.get(c); }));
}
function parseText(name, bytes, options) {
  const decoded = decode(bytes, options.encoding);
  if (!decoded.text.length) throw new Error('This file is empty. Add a file with a header row and data.');
  let delimiter = name.toLowerCase().endsWith('.tsv') ? '\t' : options.delimiter === 'auto' || !options.delimiter ? '' : options.delimiter;
  // Empty trailing records must not skew separator inference in short files.
  if (!delimiter) {
    const probe = Papa.parse(decoded.text, {skipEmptyLines:'greedy', delimitersToGuess:[',',';','\t','|'], preview:20});
    if (!probe.errors.some(e => e.code === 'UndetectableDelimiter')) delimiter = probe.meta.delimiter;
  }
  const parsed = Papa.parse(decoded.text, { delimiter, skipEmptyLines: false, dynamicTyping: false, delimitersToGuess: [',', ';', '\t', '|'] });
  const fatal = parsed.errors.filter(e => e.code !== 'UndetectableDelimiter');
  if (fatal.length) throw new Error(`Malformed delimited file: ${fatal[0].message} (record ${(fatal[0].row ?? 0) + 1}). Fix the source and re-import.`);
  const data = parsed.data;
  const trailingNewline = /(?:\r\n|\n|\r)$/.test(decoded.text);
  if (trailingNewline && data.at(-1)?.length === 1 && data.at(-1)[0] === '') data.pop();
  const headers = data.shift() || [];
  const width = data.reduce((n, row) => Math.max(n, row.length), headers.length);
  const warnings = [];
  if (parsed.errors.length) warnings.push('Delimiter was ambiguous; comma was used. Set an explicit separator and re-import if the preview looks wrong.');
  if (data.some(r => r.length !== headers.length && !(r.length === 1 && r[0] === ''))) warnings.push('Uneven row widths detected. Every field and original row width will be preserved.');
  if (data.some(r => r.some(v => /^[=+@-]/.test(v)))) warnings.push('Some cells start with formula-like characters. They are preserved as text here; spreadsheet apps may interpret them on opening.');
  const sheet = {name: 'Data', headers, width, rows: data.map((values, i) => ({ref: i + 2, values})), editable: true};
  validateSize([sheet]);
  return {name, format: name.toLowerCase().endsWith('.tsv') ? 'tsv' : 'csv', bytes, sheets: [sheet], warnings, encoding: decoded.encoding, bom: decoded.bom, delimiter: parsed.meta.delimiter || delimiter || ',', newline: parsed.meta.linebreak || '\r\n', trailingNewline};
}
// Inspect ZIP central-directory sizes before decompression to bound workbook expansion.
function checkZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('Invalid XLSX archive. Password-protected workbooks are not supported.');
  let p = v.getUint32(end + 16, true), total = 0;
  const count = v.getUint16(end + 10, true);
  if (count > 3000) throw new Error('Workbook has too many archive entries.');
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('Invalid workbook archive directory.');
    total += v.getUint32(p + 24, true);
    if (total > LIMITS.expandedBytes || (v.getUint16(p + 8, true) & 1)) throw new Error('Workbook is encrypted or expands beyond the 100 MB safety limit.');
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
}
async function parseXlsx(name, bytes) {
  checkZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const read = async path => { const f = zip.file(path); if (!f) throw new Error(`Workbook is missing ${path}.`); return f.async('string'); };
  const workbook = xml(await read('xl/workbook.xml'));
  const rels = tags(xml(await read('xl/_rels/workbook.xml.rels')), 'Relationship');
  const strings = zip.file('xl/sharedStrings.xml') ? tags(xml(await read('xl/sharedStrings.xml')), 'si').map(si => ({text: tags(si, 't').map(t => t.textContent).join(''), rich: tags(si, 'r').length > 0})) : [];
  const sheets = [], warnings = [];
  let protectedBook = tags(workbook, 'definedName').length > 0 || Object.keys(zip.files).some(p => /(?:tables|pivot|externalLinks|drawings|vbaProject|slicer|comments|_xmlsignatures)/i.test(p));
  for (const sh of tags(workbook, 'sheet')) {
    const id = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = rels.find(r => r.getAttribute('Id') === id);
    if (!rel || !/\/worksheet$/.test(rel.getAttribute('Type'))) { protectedBook = true; continue; }
    const target = rel.getAttribute('Target');
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    if (path.includes('..')) throw new Error('Workbook contains an unsupported worksheet path.');
    const sheetXml = await read(path), doc = xml(sheetXml);
    if (['f','mergeCell','tablePart','drawing','conditionalFormatting','dataValidation','autoFilter','hyperlink','sheetProtection','extLst'].some(t => tags(doc, t).length)) protectedBook = true;
    let width = 0, lastRow = 1;
    const sparse = new Map();
    for (const r of tags(doc, 'row')) {
      const index = Number(r.getAttribute('r'));
      if (!Number.isInteger(index) || index < 1 || index > LIMITS.rows + 1) throw new Error('Worksheet row references are invalid or exceed 100,000 records.');
      if (sparse.has(index)) throw new Error('Worksheet contains duplicate row references.');
      const record = {ref: index, values: [], types: [], locked: []};
      const occupied = new Set();
      for (const cell of tags(r, 'c')) {
        const address = cell.getAttribute('r');
        if (!/^[A-Z]+[1-9]\d*$/.test(address) || Number(address.match(/\d+$/)[0]) !== index) throw new Error('Worksheet contains invalid cell references.');
        const c = columnIndex(address);
        if (c >= LIMITS.columns || occupied.has(c)) throw new Error('Worksheet has duplicate cells or exceeds 512 columns.');
        occupied.add(c);
        const t = cell.getAttribute('t') || 'n', value = first(cell, 'v')?.textContent ?? '';
        let text = value, locked = false, type = t;
        if (first(cell, 'f')) { text = '=' + first(cell, 'f').textContent; locked = true; type = 'f'; }
        else if (t === 's') { if (!strings[Number(value)]) throw new Error('Invalid shared string reference.'); text = strings[Number(value)].text; locked = strings[Number(value)].rich; type = 's'; }
        else if (t === 'inlineStr') { text = tags(cell, 't').map(n => n.textContent).join(''); locked = tags(cell, 'r').length > 0; type = 's'; }
        else if (t === 'b') text = value === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'e') locked = true;
        record.values[c] = text; record.types[c] = type; record.locked[c] = locked;
        width = Math.max(width, c + 1);
      }
      sparse.set(index, record); lastRow = Math.max(lastRow, index);
    }
    if ((lastRow * width) > LIMITS.cells) throw new Error('Worksheet exceeds 1,000,000 cells.');
    const rows = [];
    for (let r = 1; r <= lastRow; r++) {
      const record = sparse.get(r) || {ref: r, values: [], types: [], locked: []};
      record.values = Array.from({length: width}, (_, i) => record.values[i] ?? '');
      record.types = Array.from({length: width}, (_, i) => record.types[i] ?? '');
      if (r > 1) rows.push(record);
    }
    sheets.push({name: sh.getAttribute('name'), headers: Array.from({length:width}, (_, c) => sparse.get(1)?.values[c] ?? ''), width, rows, path, sheetXml, editable: true, hidden: sh.getAttribute('state') === 'hidden' || sh.getAttribute('state') === 'veryHidden'});
  }
  if (!sheets.length) throw new Error('No supported worksheets found in this workbook.');
  validateSize(sheets);
  if (protectedBook) { warnings.push('Protected layout: this workbook contains formulas, references, or advanced Excel structures. Cleaning is disabled to preserve them; inspection and unchanged export remain available.'); sheets.forEach(s => s.editable = false); }
  if (sheets.some(s => s.rows.some(r => r.locked.some(Boolean)))) warnings.push('Rich-text and special cells are preserved without edits.');
  return {name, format:'xlsx', bytes, sheets, warnings, encoding: 'Excel XML'};
}
export async function parseInput(name, buffer, options = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length > LIMITS.fileBytes) throw new Error('File exceeds 25 MB. Split it into smaller files before importing.');
  if (!/\.(csv|tsv|xlsx)$/i.test(name)) throw new Error('Unsupported format. Choose a CSV, TSV, or XLSX file.');
  const doc = /\.xlsx$/i.test(name) ? await parseXlsx(name, bytes) : parseText(name, bytes, options);
  doc.sheets.forEach(s => s.analysis = analyze(s));
  return doc;
}
export function planDocument(doc, rules = RULES) {
  const sheets = doc.sheets.map(sheet => {
    const changes = [], rows = [], removed = [], active = sheet.editable ? rules : RULES;
    for (const row of sheet.rows) {
      let reason = active.empty && row.issues.empty ? 'Empty row' : active.duplicates && row.issues.duplicateOf !== null ? `Exact duplicate of row ${row.issues.duplicateOf}` : null;
      if (reason) { removed.push(row.ref); changes.push({row:row.ref, action:'remove row', reason, before:row.values, after:null}); continue; }
      const values = row.values.map((v, c) => {
        const textCell = !row.types || ['s','str','inlineStr'].includes(row.types[c]);
        if (active.trim && textCell && !row.locked?.[c] && typeof v === 'string' && v !== v.trim()) {
          changes.push({row:row.ref, column:c + 1, header:sheet.headers[c] ?? '', action:'trim whitespace', before:v, after:v.trim()});
          return v.trim();
        }
        return v;
      });
      rows.push({...row, values});
    }
    const after = {...sheet, rows};
    return {name:sheet.name, rows, removed, changes, analysis:analyze(after)};
  });
  return {rules:{...rules}, sheets};
}
export function documentSummary(doc, plan) {
  return {id:doc.id, name:doc.name, format:doc.format, size:doc.bytes.length, encoding:doc.encoding, warnings:doc.warnings, sheets:doc.sheets.map((s, i) => ({name:s.name, headers:s.headers, width:s.width, hidden:s.hidden, editable:s.editable, analysis:s.analysis, after:plan?.sheets[i].analysis, changes:plan?.sheets[i].changes.length || 0, removed:plan?.sheets[i].removed.length || 0}))};
}
export function reportDocument(doc, plan) {
  return {file:doc.name, format:doc.format, encoding:doc.encoding, warnings:doc.warnings, rules:plan.rules, sheets:doc.sheets.map((s, i) => ({name:s.name, editable:s.editable, detected:s.analysis, remaining:plan.sheets[i].analysis, removedRecords:plan.sheets[i].removed.length, changes:plan.sheets[i].changes, rowMap:plan.sheets[i].rows.map((r,j) => ({outputRecord:j + 2, originalRecord:r.ref}))}))};
}
export async function exportDocument(doc, plan) {
  if (!plan.sheets.some(s => s.changes.length)) return doc.bytes.slice();
  if (doc.format !== 'xlsx') {
    const data = [doc.sheets[0].headers, ...plan.sheets[0].rows.map(r => r.values)];
    let text = Papa.unparse(data, {delimiter:doc.delimiter, newline:doc.newline, skipEmptyLines:false, quotes: false});
    if (doc.trailingNewline) text += doc.newline;
    return encode(text, doc.encoding, doc.bom);
  }
  const zip = await JSZip.loadAsync(doc.bytes);
  for (let i = 0; i < doc.sheets.length; i++) {
    const sheet = doc.sheets[i], result = plan.sheets[i];
    if (!result.changes.length) continue;
    const docXml = xml(sheet.sheetXml), rows = tags(docXml, 'row'), removed = new Set(result.removed);
    const trims = new Map(result.changes.filter(c => c.action === 'trim whitespace').map(c => [`${columnName(c.column-1)}${c.row}`, c.after]));
    let deleted = 0, removalIndex = 0;
    for (const row of rows) {
      const old = Number(row.getAttribute('r'));
      while (removalIndex < result.removed.length && result.removed[removalIndex] < old) { deleted++; removalIndex++; }
      if (removed.has(old)) { row.parentNode.removeChild(row); continue; }
      const newRow = old - deleted;
      row.setAttribute('r', String(newRow));
      for (const cell of tags(row, 'c')) {
        const ref = cell.getAttribute('r');
        if (trims.has(ref)) {
          for (const child of Array.from(cell.childNodes)) cell.removeChild(child);
          cell.setAttribute('t', 'inlineStr');
          const is = docXml.createElementNS(NS, 'is'), t = docXml.createElementNS(NS, 't');
          t.setAttribute('xml:space', 'preserve'); t.appendChild(docXml.createTextNode(trims.get(ref))); is.appendChild(t); cell.appendChild(is);
        }
        cell.setAttribute('r', ref.replace(/\d+$/, String(newRow)));
      }
    }
    const dimension = first(docXml, 'dimension');
    if (dimension) dimension.setAttribute('ref', `A1:${columnName(Math.max(0,sheet.width - 1))}${result.rows.length + 1}`);
    zip.file(sheet.path, serialize(docXml));
  }
  return zip.generateAsync({type:'uint8array', compression:'DEFLATE'});
}
export function outputName(name) { return name.replace(/\.(csv|tsv|xlsx)$/i, '.cleaned.$1').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); }
export async function exportBatch(entries) {
  const zip = new JSZip(), used = new Set(), reports = [];
  for (const {doc, plan} of entries) {
    let name = outputName(doc.name), n = 2;
    const original = name;
    while (used.has(name.toLowerCase())) name = original.replace(/(\.[^.]+)$/, ` (${n++})$1`);
    used.add(name.toLowerCase());
    zip.file(name, await exportDocument(doc, plan));
    reports.push({...reportDocument(doc, plan), exportedAs:name});
  }
  zip.file('data-quality-report.json', JSON.stringify({version:1, generatedAt:new Date().toISOString(), files:reports}, null, 2));
  zip.file('READ-ME.txt', 'DataTidy offline batch export\r\nOriginal files were not modified.\r\nThe JSON report includes detected issues, applied rules, changes, remaining records, and original row references.\r\nText-file row references are logical records (including the header), not physical lines when fields contain newlines.\r\nMissing values and mixed data types were not filled or converted.\r\n');
  return zip.generateAsync({type:'uint8array', compression:'DEFLATE'});
}
