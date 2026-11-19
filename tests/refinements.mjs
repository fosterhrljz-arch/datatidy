import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import JSZip from 'jszip';
import {parseInput} from '../src/core.mjs';

const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1536,height:1024},offline:true,acceptDownloads:true});
const page=await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const button=name=>page.getByRole('button',{name,exact:true});
const nav=name=>page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true});
const step=name=>page.getByRole('navigation',{name:'Cleaning workflow'}).getByRole('button',{name:new RegExp(name+'$')});
const idle=()=>page.waitForFunction(()=>!document.querySelector('.busy'));
const loaded=()=>page.locator('.cell-button').first().waitFor();
const file=async name=>{await page.locator('.file-button').filter({hasText:name}).click();await loaded();};
const setRule=async(name,value)=>{await page.getByRole('checkbox',{name:new RegExp(name)}).setChecked(value);await idle();};
const dismiss=async()=>{while(await button('Dismiss message').count())await button('Dismiss message').first().click();};
const shot=async name=>{await dismiss();await page.screenshot({path:`docs/${name}.png`,animations:'disabled'});};
async function download(action){const next=page.waitForEvent('download');await action();const d=await next;assert.equal(await d.failure(),null);return new Uint8Array(await readFile(await d.path()));}
async function search(kind,query){await page.getByLabel('Search by',{exact:true}).selectOption(kind);await page.getByLabel('Search data',{exact:true}).fill(query);await button('Search worksheet').click();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));}
const ruleState=async()=>Promise.all(['Trim whitespace','Remove empty rows','Remove exact duplicates'].map(name=>page.getByRole('checkbox',{name:new RegExp(name)}).isChecked()));
try{
  await page.goto(pathToFileURL(resolve('release/DataTidy.html')).href);assert.match(await page.title(),/DataTidy/);
  assert.ok(await button('Continue Batch').isDisabled());await button('Try Sample Files').click();await idle();await button('Continue to Configure').click();await loaded();
  // Three files with three intentionally different settings; worksheet selection uses file rules.
  await setRule('Trim whitespace',true);await file('orders.tsv');assert.deepEqual(await ruleState(),[false,false,false]);await setRule('Remove exact duplicates',true);
  await file('inventory.xlsx');assert.deepEqual(await ruleState(),[false,false,false]);await page.locator('.sheet').filter({hasText:'Suppliers'}).click();await loaded();assert.deepEqual(await ruleState(),[false,false,false]);
  await file('customers.csv');assert.deepEqual(await ruleState(),[true,false,false]);await shot('15-file-rules');
  await button('Apply to All').click();await idle();await file('orders.tsv');assert.deepEqual(await ruleState(),[true,false,false]);
  await nav('Home').click();await shot('16-continue-batch');await button('New Batch').click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator(':focus').innerText(),'Keep Current Batch');await shot('17-new-batch-confirmation');await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await button('Continue Batch').click();assert.match(await page.locator('[aria-current="step"]').innerText(),/Configure/);await button('Undo Apply to All').click();await idle();assert.deepEqual(await ruleState(),[false,false,true]);
  await file('customers.csv');assert.deepEqual(await ruleState(),[true,false,false]);
  // Search navigates matches on later pages, highlights headers and retains query across pages.
  await search('content','acme');assert.ok(await page.locator('mark').count());assert.equal(await page.locator(':focus').getAttribute('data-grid-row'),'2');
  assert.match(await page.locator('.search-results').innerText(),/2 matching cells/);await button('Next match').click();await page.waitForFunction(()=>document.activeElement?.dataset.gridCol==='3');
  await nav('Reports').click();await nav('Data Cleaner').click();assert.equal(await page.getByLabel('Search data',{exact:true}).inputValue(),'acme');
  await search('column','amount');assert.equal(await page.locator(':focus').getAttribute('data-column'),'4');assert.equal(await page.locator('thead mark').innerText(),'amount');
  await search('content','.example');await button('Next match').click();await page.waitForFunction(()=>document.activeElement?.dataset.gridRow==='3');
  for(let i=0;i<10;i++){await button('Next match').click();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));}
  assert.notEqual(await page.locator('.pagination span').innerText(),'1 / 3');await shot('18-search-results');
  await search('row','17');assert.equal(await page.locator(':focus').getAttribute('data-grid-row'),'17');assert.equal(await page.locator('.data-table tbody tr').count(),1);
  await search('content','nothing-matches-this');assert.match(await page.locator('.search-results').innerText(),/0 matching cells/);assert.ok(await button('Next match').isDisabled());await button('Show all records').click();await loaded();
  await button('Preview changes').click();await idle();await loaded();assert.equal(await page.locator('.removed-row').count(),0);assert.equal(await page.locator('.cell-diff').count(),3);
  await nav('Home').click();await button('Continue Batch').click();assert.match(await page.locator('[aria-current="step"]').innerText(),/Review/);assert.equal(await button('Compare').getAttribute('aria-pressed'),'true');
  await nav('Reports').click();let rows=page.locator('.report-table-scroll tbody tr');assert.match(await rows.filter({hasText:'Duplicate rows'}).innerText(),/Not selected/);assert.match(await rows.filter({hasText:'Extra whitespace'}).innerText(),/3 cells trimmed/);await shot('19-accurate-report');
  const json=JSON.parse(new TextDecoder().decode(await download(()=>button('Download report').click())));await idle();assert.deepEqual(json.files.map(f=>f.rules),[{trim:true,empty:false,duplicates:false},{trim:false,empty:false,duplicates:true},{trim:false,empty:false,duplicates:false}]);
  await page.getByLabel('Report file').selectOption({label:'orders.tsv'});assert.match(await rows.filter({hasText:'Duplicate rows'}).innerText(),/1 row removed/);assert.match(await rows.filter({hasText:'Extra whitespace'}).innerText(),/Not selected/);
  await nav('Data Cleaner').click();await button('Continue to Export').click();await page.getByRole('checkbox',{name:/I reviewed/}).check();
  const zip=await JSZip.loadAsync(await download(()=>button('Download ZIP').click()),{checkCRC32:true});await idle();
  const a=await parseInput('customers.csv',await zip.file('customers.cleaned.csv').async('uint8array'));assert.equal(a.sheets[0].rows.length,24);assert.equal(a.sheets[0].rows[0].values[1],'Acme Retail');
  const b=await parseInput('orders.tsv',await zip.file('orders.cleaned.tsv').async('uint8array'));assert.equal(b.sheets[0].rows.length,5);
  assert.deepEqual(await zip.file('inventory.cleaned.xlsx').async('uint8array'),new Uint8Array(await readFile('samples/inventory.xlsx')));
  assert.deepEqual(JSON.parse(await zip.file('data-quality-report.json').async('string')).files.map(f=>f.rules),json.files.map(f=>f.rules));
  // Changed rules revoke the whole batch preview; reset confirmation preserves or discards deliberately.
  await nav('Home').click();await button('New Batch').click();await button('Keep Current Batch').click();await button('Continue Batch').click();assert.match(await page.locator('[aria-current="step"]').innerText(),/Export/);
  await step('Configure').click();await setRule('Trim whitespace',true);assert.ok(await step('Export').isDisabled());assert.ok(await step('Review').isDisabled());
  await nav('Reports').click();assert.match(await rows.filter({hasText:'Extra whitespace'}).innerText(),/Selected · preview required/);
  // Failed imports keep a file-specific recovery entry; failed retries do not duplicate it.
  await nav('Data Cleaner').click();await step('Import').click();await page.getByLabel('Import data files').setInputFiles(['samples/encoding-windows1252.csv','samples/malformed-quotes.csv']);await idle();assert.equal(await page.locator('.failed-import').count(),2);assert.equal(await page.locator('.import-file').count(),3);await shot('20-import-recovery');
  const malformed=page.getByRole('article',{name:'Import error: malformed-quotes.csv'}),accent=page.getByRole('article',{name:'Import error: encoding-windows1252.csv'});
  await nav('Reports').click();const failedReport=JSON.parse(new TextDecoder().decode(await download(()=>button('Download report').click())));await idle();assert.deepEqual(failedReport.excludedImports.map(f=>f.file),['encoding-windows1252.csv','malformed-quotes.csv']);await nav('Data Cleaner').click();
  await malformed.getByRole('button',{name:'Retry import',exact:true}).click();await idle();assert.equal(await page.locator('.failed-import').count(),2);
  await page.getByLabel('Encoding for encoding-windows1252.csv',{exact:true}).selectOption('windows-1252');
  await nav('Home').click();await button('Continue Batch').click();assert.equal(await page.getByLabel('Encoding for encoding-windows1252.csv',{exact:true}).inputValue(),'windows-1252');
  await accent.getByRole('button',{name:'Retry import',exact:true}).click();await idle();assert.equal(await page.locator('.failed-import').count(),1);assert.equal(await page.locator('.import-file').count(),4);
  await button('Continue to Configure').click();await page.getByRole('button',{name:'Row 2, name: André',exact:true}).waitFor();assert.deepEqual(await ruleState(),[false,false,false]);assert.ok(await step('Export').isDisabled());
  await step('Import').click();const chooser=page.waitForEvent('filechooser');await malformed.getByRole('button',{name:'Choose replacement'}).click();await (await chooser).setFiles({name:'corrected.csv',mimeType:'text/csv',buffer:Buffer.from('id,name\n001,Fixed\n')});await idle();assert.equal(await page.locator('.failed-import').count(),0);assert.equal(await page.locator('.import-file').count(),5);
  await button('Settings').click();await page.getByLabel('Text encoding',{exact:false}).selectOption('windows-1252');
  await nav('Home').click();await button('New Batch').click();await button('Start New Batch').click();await idle();assert.equal(await page.locator('.import-file').count(),0);assert.ok(await button('Continue to Configure').isDisabled());
  await button('Settings').click();assert.equal(await page.getByLabel('Text encoding',{exact:false}).inputValue(),'windows-1252');await nav('Home').click();assert.ok(await button('Continue Batch').isDisabled());
  // Sample batches use the same discard confirmation, and start with all rules off.
  await button('Try Sample Files').click();await idle();await nav('Home').click();await button('Try Sample Files').click();await page.getByRole('dialog',{name:'Start a sample batch?'}).waitFor();await button('Start New Batch').click();await idle();assert.equal(await page.locator('.import-file').count(),3);
  await button('Continue to Configure').click();assert.deepEqual(await ruleState(),[false,false,false]);
  await page.setViewportSize({width:390,height:844});await search('content','acme');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot('21-search-mobile');
  const footer=await page.locator('.workflow-footer').boundingBox();assert.ok(footer.y+footer.height<=845);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log('PASS: New/Continue and cancel/confirm; independent CSV/TSV/XLSX rules; reversible Apply to All; retained worksheet rules and navigation; column/content/source-row search with highlighting and cross-page navigation; accurate UI/JSON/ZIP reports; byte-exact unselected Excel; stale preview blocking; persistent per-file retry options and corrected-file replacement; clean reset with retained import preferences; mobile search; zero HTTP and console errors.');
}finally{await context.close();await browser.close();}
