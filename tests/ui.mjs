import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {parseInput} from '../src/core.mjs';

const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1536,height:1024},acceptDownloads:true,offline:true});
const page=await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const url=pathToFileURL(resolve('release/DataTidy.html')).href;
await mkdir('docs',{recursive:true});
const nav=name=>page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true});
const step=name=>page.getByRole('navigation',{name:'Cleaning workflow'}).getByRole('button',{name:new RegExp(name+'$')});
const button=name=>page.getByRole('button',{name,exact:true});
async function waitIdle(){await page.waitForFunction(()=>!document.querySelector('.busy'),{},{timeout:30000});}
async function dismiss(){while(await button('Dismiss message').count())await button('Dismiss message').first().click();}
async function download(action){const pending=page.waitForEvent('download');await action();const d=await pending;assert.equal(await d.failure(),null);return new Uint8Array(await readFile(await d.path()));}
async function screenshot(name){await dismiss();await page.screenshot({path:`docs/${name}.png`,fullPage:false,animations:'disabled'});}
async function setRules(value){for(const name of ['Trim whitespace','Remove empty rows','Remove exact duplicates']){await page.getByRole('checkbox',{name:new RegExp(name)}).setChecked(value);await waitIdle();}}
async function assertFooter(){const box=await page.locator('.workflow-footer').boundingBox();const viewport=page.viewportSize();assert.ok(box.y>=0&&box.y+box.height<=viewport.height+1,`Footer is offscreen: ${JSON.stringify(box)}`);}
try{
  // Integrity guard: the redesign must not modify the processing engine.
  assert.equal(createHash('sha256').update(await readFile('src/core.mjs')).digest('hex'),'910e9d63feed7592ba5ee3a4938d09452f0c61c72cf3ca23241d3107f7a30314');
  await page.goto(url);assert.match(await page.title(),/DataTidy/);
  await page.getByRole('heading',{name:'A little tidying. A lot more clarity.'}).waitFor();
  await screenshot('01-home');
  await button('New Batch').click();assert.ok(await button('Continue to Configure').isDisabled());assert.ok(await step('Review').isDisabled());assert.ok(await step('Export').isDisabled());await assertFooter();
  await button('Try Sample Files').click();await waitIdle();assert.equal(await page.locator('.import-file').count(),3);await screenshot('02-import');
  await button('Continue to Configure').click();await page.locator('.data-table tbody .cell-button').first().waitFor();
  assert.equal(await page.getByRole('checkbox').count(),3);for(const c of await page.getByRole('checkbox').all())assert.equal(await c.isChecked(),false);
  await setRules(true);await button('Apply to All').click();await waitIdle();await dismiss();await screenshot('03-configure');await assertFooter();
  // State survives all top-level navigation, and settings affect future imports only.
  await button('Settings').click();await page.getByLabel('Text encoding',{exact:false}).selectOption('windows-1252');await screenshot('06-settings');
  await nav('Home').click();await nav('Data Cleaner').click();assert.equal(await page.locator('.file-item').count(),3);assert.equal(await page.getByRole('checkbox',{name:/Trim whitespace/}).isChecked(),true);
  await button('Preview changes').click();await waitIdle();await page.locator('.cell-diff').first().waitFor();assert.equal(await page.locator('.removed-row').count(),2);await screenshot('04-review');await assertFooter();
  await button('Collapse file navigation').click();assert.ok(await button('Expand file navigation').isVisible());await button('Expand file navigation').click();
  await button('Hide inspector').click();assert.equal(await page.locator('.inspector').count(),0);await button('Show inspector').click();
  await button('Locate missing values').click();await page.waitForFunction(()=>document.querySelectorAll('.data-table tbody tr').length===2);assert.equal(await page.getByLabel('Filter rows').inputValue(),'missing');assert.equal(await button('Original').getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Row 4, email: empty. Missing value'}).click();await page.getByRole('heading',{name:'Source row 4',exact:true}).waitFor();await button('Locate in original').click();await page.locator('.focused-row').waitFor();assert.equal((await page.locator('.focused-row .row-ref').innerText()).trim(),'4');
  await page.getByLabel('Go to row').fill('17');await button('Locate original row').click();await page.waitForFunction(()=>document.querySelector('.focused-row .row-ref')?.textContent==='17');
  await button('Previous page').click();await page.waitForFunction(()=>document.querySelector('.data-table tbody .row-ref')?.textContent==='2');
  await button('Compare').click();await page.locator('.cell-diff').first().waitFor();
  await nav('Reports').click();await page.getByRole('heading',{name:'Every detail, accounted for.'}).waitFor();await screenshot('05-reports');
  const json=JSON.parse(new TextDecoder().decode(await download(()=>button('Download report').click())));await waitIdle();assert.equal(json.files.length,3);assert.equal(json.files[0].sheets[0].remaining.records,22);
  await button('Change log').click();await page.locator('.change-table tbody tr').first().waitFor();assert.equal(await page.locator('.change-table tbody tr').count(),5);await screenshot('07-change-log');
  await button('Locate change at row 2').click();await page.waitForFunction(()=>document.querySelector('.focused-row .row-ref')?.textContent==='2');
  await button('Compare').click();await button('Continue to Export').click();assert.ok(await button('Download ZIP').isDisabled());
  await page.getByRole('checkbox',{name:/I reviewed/}).check();await screenshot('08-export');await assertFooter();
  const bytes=await download(()=>button('Download ZIP').click());await waitIdle();const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  const cleaned=await parseInput('customers.csv',await zip.file('customers.cleaned.csv').async('uint8array'));assert.equal(cleaned.sheets[0].rows.length,22);assert.equal(cleaned.sheets[0].rows[0].values[0],'00101');assert.equal(cleaned.sheets[0].rows[0].values[1],'Acme Retail');
  const report=JSON.parse(await zip.file('data-quality-report.json').async('string'));assert.equal(report.files.length,3);assert.equal(report.files.reduce((n,f)=>n+f.sheets.reduce((m,s)=>m+s.changes.length,0),0),14);
  const workbook=await zip.file('inventory.cleaned.xlsx').async('uint8array');await writeFile('docs/test-cleaned-inventory.xlsx',workbook);assert.equal((await parseInput('inventory.xlsx',workbook)).sheets[0].rows.length,4);
  await page.getByRole('heading',{name:'A fresh copy, ready for you.'}).waitFor();
  // Changing the download scope must not show a previous scope's success message.
  await page.getByRole('radio',{name:/A single file/}).check();assert.equal(await page.locator('.download-result').count(),0);assert.ok(await button('Download file').isDisabled());
  await page.getByRole('radio',{name:/Entire batch/}).check();assert.equal(await page.getByRole('checkbox',{name:/I reviewed/}).isChecked(),false);
  // Back and rule changes revoke an old preview, without losing the batch.
  await button('Back').click();await button('Back').click();await page.getByRole('checkbox',{name:/Trim whitespace/}).uncheck();await waitIdle();assert.ok(await step('Review').isDisabled());assert.ok(await step('Export').isDisabled());assert.ok(await button('Compare').isDisabled());
  // Remove/undo restores the parsed file and both worksheets, still requiring preview.
  await button('Remove inventory.xlsx').click();await waitIdle();assert.equal(await page.locator('.file-item').count(),2);await nav('Home').click();await nav('Data Cleaner').click();await button('Undo removal').click();await waitIdle();assert.equal(await page.locator('.file-item').count(),3);await page.locator('.sheet').filter({hasText:'Suppliers'}).click();await page.waitForFunction(()=>document.querySelector('.data-table thead')?.textContent.includes('supplier_id'));assert.ok(await step('Export').isDisabled());
  // Import failures preserve the rest of the batch; encoding recovery is explicit.
  await step('Import').click();const chooserPromise=page.waitForEvent('filechooser');await button('Browse files').click();await (await chooserPromise).setFiles('samples/malformed-quotes.csv');await waitIdle();await page.getByRole('alert').filter({hasText:'Malformed'}).waitFor();assert.equal(await page.locator('.import-file').count(),3);
  await dismiss();await button('Settings').click();await page.getByLabel('Text encoding',{exact:false}).selectOption('auto');await nav('Data Cleaner').click();await page.getByLabel('Import data files').setInputFiles('samples/encoding-windows1252.csv');await waitIdle();await page.getByRole('alert').filter({hasText:'encoding'}).waitFor();
  await dismiss();await button('Settings').click();await page.getByLabel('Text encoding',{exact:false}).selectOption('windows-1252');await nav('Data Cleaner').click();await page.getByLabel('Import data files').setInputFiles('samples/encoding-windows1252.csv');await waitIdle();await button('Continue to Configure').click();await page.getByRole('button',{name:'Row 2, name: André',exact:true}).waitFor();
  await step('Import').click();await page.getByLabel('Import data files').setInputFiles('samples/protected-formulas.xlsx');await waitIdle();await button('Continue to Configure').click();await page.getByText('Workbook protected · cleaning disabled',{exact:true}).waitFor();await button('Preview changes').click();await waitIdle();await button('Continue to Export').click();await page.getByRole('radio',{name:/A single file/}).check();const original=await download(()=>button('Download file').click());await waitIdle();assert.deepEqual(original,new Uint8Array(await readFile('samples/protected-formulas.xlsx')));
  await step('Import').click();await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File(['id,name\n001, Test \n'],'dropped.csv',{type:'text/csv'}));document.querySelector('.dropzone').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));});await waitIdle();assert.equal(await page.locator('.import-file').count(),6);
  await button('Continue to Configure').click();await setRules(true);await button('Preview changes').click();await waitIdle();
  await page.setViewportSize({width:1280,height:720});await screenshot('09-compact-desktop');await assertFooter();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:390,height:844});await screenshot('10-mobile');await assertFooter();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await step('Configure').click();assert.equal(await page.getByRole('checkbox',{name:/Trim whitespace/}).isChecked(),true);await assertFooter();
  await button('Settings').click();await page.getByText('Can I undo a change?',{exact:true}).click();await page.getByText(/The preview never edits source files/).waitFor();
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
  console.log('PASS: unchanged engine; offline Home → Import → Configure → Review → Export; all navigation and state retention; issue filters, original-row jumps and cell inspector; report details and links; undo removal; stale preview prevention; real ZIP/JSON/single downloads; Excel protection and encoding recovery; drag/drop; 1536×1024, 1280×720 and 390×844 layouts; visible footer; zero HTTP requests and console errors.');
}finally{await context.close();await browser.close();}
