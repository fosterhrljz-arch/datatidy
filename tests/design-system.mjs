import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';

const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1536,height:1024},offline:true});
const page=await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const button=name=>page.getByRole('button',{name,exact:true});
const idle=()=>page.waitForFunction(()=>!document.querySelector('.busy'));
const loaded=()=>page.locator('.cell-button').first().waitFor();
const dismiss=async()=>{while(await button('Dismiss message').count())await button('Dismiss message').first().click();};
const footer=async()=>{const b=await page.locator('.workflow-footer').boundingBox();assert.ok(b.y+b.height<=page.viewportSize().height+1);};
try{
  await page.goto(pathToFileURL(resolve('release/DataTidy.html')).href);
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to content');
  await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'main-content');
  await button('Try Sample Files').click();await idle();await dismiss();
  await button('Continue to Configure').click();await loaded();assert.equal(await page.locator(':focus').evaluate(e=>e.tagName),'H1');
  const metrics=await page.evaluate(()=>{
    const lum=color=>{const v=color.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
    return ['.workflow-header p','.rule small','.table-status','.remove','.cell-button','.table-legend','.file-button small'].map(selector=>{
      const e=document.querySelector(selector),s=getComputedStyle(e),r=e.getBoundingClientRect();let b=e,bg='rgb(255,255,255)';while(b){const c=getComputedStyle(b).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break;}b=b.parentElement;}
      const l1=lum(s.color),l2=lum(bg);return {selector,font:s.fontSize,color:s.color,background:bg,contrast:Number(((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2)),width:r.width,height:r.height};
    });
  });
  for(const m of metrics){assert.ok(m.contrast>=4.5,`${m.selector}: contrast ${m.contrast}`);assert.ok(parseFloat(m.font)>=12,`${m.selector}: font ${m.font}`);}
  const target=metrics.find(m=>m.selector==='.remove');assert.ok(target.width>=32&&target.height>=32);
  const tabStops=await page.locator('.data-table button:not([tabindex="-1"])').count();assert.equal(tabStops,1);
  await page.locator('.cell-button').first().focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator(':focus').getAttribute('data-grid-col'),'2');await page.getByRole('heading',{name:'Source row 2',exact:true}).waitFor();
  await page.keyboard.press('ArrowDown');assert.equal(await page.locator(':focus').getAttribute('data-grid-row'),'3');
  await page.keyboard.press('Home');assert.equal(await page.locator(':focus').getAttribute('data-grid-col'),'0');
  await page.keyboard.press('End');assert.equal(await page.locator(':focus').getAttribute('data-grid-col'),'5');
  await page.keyboard.press('Control+End');assert.equal(await page.locator(':focus').getAttribute('data-grid-row'),'11');
  await page.keyboard.press('Control+Home');assert.equal(await page.locator(':focus').getAttribute('data-grid-row'),'2');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.cell-inspector').count(),0);
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('aria-label'),'Next page');
  await page.locator('.cell-button').nth(1).click();await button('Close cell details').focus();await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('data-grid-col'),'2');
  await button('Rules').focus();await page.keyboard.press('ArrowRight');assert.equal(await button('Issues').getAttribute('aria-pressed'),'true');
  await page.keyboard.press('ArrowLeft');assert.equal(await button('Rules').getAttribute('aria-pressed'),'true');
  await page.getByRole('checkbox',{name:/Trim whitespace/}).check();await idle();
  await button('Preview changes').click();await idle();await loaded();
  await page.getByRole('button',{name:/Row 2, name:.*Proposed value/}).waitFor();
  await button('Compare').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await button('Cleaned').getAttribute('aria-pressed'),'true');
  await button('Back').click();await button('Issues').click();await button('Locate missing values').click();await loaded();
  const stage=await page.locator('[aria-current="step"]').innerText();assert.match(stage,/Configure/);
  await page.locator('.cell-button').nth(2).click();await page.getByRole('heading',{name:'Source row 4',exact:true}).waitFor();
  await page.screenshot({path:'docs/11-cell-details.png',animations:'disabled'});await button('Close cell details').click();
  await page.screenshot({path:'docs/audit-after.png',animations:'disabled'});
  // Page navigation keeps data/rules and focuses the new destination's heading.
  await button('Settings').click();assert.equal(await page.locator(':focus').evaluate(e=>e.tagName),'H1');
  await page.getByText('How do I use the keyboard?',{exact:true}).click();await page.getByText(/Tab moves between controls/).waitFor();
  await button('Data Cleaner').click();await button('Rules').click();assert.ok(await page.getByRole('checkbox',{name:/Trim whitespace/}).isChecked());
  await page.locator('.sheet').filter({hasText:'Suppliers'}).click();await loaded();
  await page.locator('.file-button').filter({hasText:'inventory.xlsx'}).click();await loaded();
  assert.ok((await page.locator('.data-table thead').innerText()).includes('supplier_id'));
  await page.locator('.file-button').filter({hasText:'customers.csv'}).click();await loaded();
  // Double the root text size without changing the viewport. Controls remain usable.
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');await footer();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('checkbox',{name:/Trim whitespace/}).uncheck();await idle();assert.ok(await button('Preview changes').isEnabled());
  await page.locator('.cell-button').first().scrollIntoViewIfNeeded();
  const largeCell=await page.locator('.cell-button').first().boundingBox();assert.ok(largeCell.y>0&&largeCell.y+largeCell.height<page.viewportSize().height-50);
  await page.screenshot({path:'docs/12-large-text.png',animations:'disabled'});
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  // 768x512 is the CSS viewport equivalent of a 1536x1024 window at 200% browser zoom.
  await page.setViewportSize({width:768,height:512});await footer();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await button('Hide inspector').click();await button('Show inspector').click();
  await page.locator('.cell-button').first().scrollIntoViewIfNeeded();
  const zoomCell=await page.locator('.cell-button').first().boundingBox();assert.ok(zoomCell.y>0&&zoomCell.y+zoomCell.height<page.viewportSize().height-50);
  assert.ok((await page.locator('.data-table-scroll').boundingBox()).height>=150);
  await page.screenshot({path:'docs/13-zoom-layout.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await footer();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.button')).transitionDuration),'0s');
  await page.emulateMedia({forcedColors:'active'});await page.screenshot({path:'docs/14-high-contrast.png',animations:'disabled'});
  const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,offline:true});
  const touchPage=await touch.newPage();await touchPage.goto(pathToFileURL(resolve('release/DataTidy.html')).href);
  await touchPage.getByRole('button',{name:'Try Sample Files',exact:true}).click();await touchPage.waitForFunction(()=>!document.querySelector('.busy'));
  await touchPage.getByRole('button',{name:'Continue to Configure',exact:true}).click();
  const touchTarget=await touchPage.locator('.remove').first().boundingBox();assert.ok(touchTarget.width>=44&&touchTarget.height>=44);
  assert.equal(await touchPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await touch.close();
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  const result={metrics,tableTabStops:tabStops,arrowKeyMovesCell:true,stageAfterLocateFromConfigure:stage,checks:['Skip link and route focus','Spatial cell navigation, one table tab stop, Tab exit','Inspector selection and focus return','Segmented control arrow keys','Full comparison accessible descriptions','Scope, worksheet and workflow stability','200% root text and 768x512 zoom-equivalent viewport','390x844 layout and footer','44px coarse-pointer file-removal target','Reduced motion and forced-color rendering','Zero HTTP requests and runtime errors']};
  await writeFile('docs/audit-after.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await context.close();await browser.close();}
