const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
test('los datos escritos en administración se guardan en mayúsculas sin alterar el cursor, la composición ni campos ajenos',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage();
  await page.setContent(`<!doctype html><body data-page="admin">
   <form id="dw-product-form"><input id="dw-product-customer"><input id="dw-product-phone" type="tel"><textarea id="dw-product-address"></textarea><textarea id="dw-product-observations"></textarea></form>
   <form id="consumptionForm"><input name="payer_name"><textarea name="notes"></textarea><input name="individual_edit_phone" type="tel"><textarea name="individual_edit_observations"></textarea></form>
   <form id="incomeEditForm"><input name="payer"></form>
   <input id="username" value="MiUsuario"><input id="password" type="password" value="MiClave"><input id="email" type="email"><input id="individualSalesSearch"><input id="menu-name">
   <textarea id="dw-time-observations"></textarea>
  </body>`);
  await page.evaluate(()=>{window.saved=[];document.addEventListener('input',event=>saved.push({id:event.target.id||event.target.name,value:event.target.value}));});
  await page.addScriptTag({path:path.join(__dirname,'../admin-customer-inputs.js')});
  for(const [selector,input,want] of [
   ['#dw-product-customer','maría josé muñoz','MARÍA JOSÉ MUÑOZ'],
   ['#dw-product-phone','300 123 4567','300 123 4567'],
   ['#dw-product-address','carrera 10, apto ñ-2','CARRERA 10, APTO Ñ-2'],
   ['#dw-product-observations','sin cebolla\nentregar en portería','SIN CEBOLLA\nENTREGAR EN PORTERÍA'],
   ['#consumptionForm [name=payer_name]','andrés peña','ANDRÉS PEÑA'],
   ['#consumptionForm [name=notes]','salsa aparte','SALSA APARTE'],
   ['#consumptionForm [name=individual_edit_observations]','recoger mañana','RECOGER MAÑANA'],
   ['#incomeEditForm [name=payer]','lucía','LUCÍA'],
   ['#dw-time-observations','sin hielo','SIN HIELO']
  ]){
   await page.locator(selector).fill(input);assert.equal(await page.locator(selector).inputValue(),want);
   assert.equal(await page.evaluate(()=>saved.at(-1).value),want,'El manejador que guarda recibe mayúsculas.');
  }
  const cursor=await page.evaluate(()=>{
   const field=document.querySelector('#dw-product-customer');field.value='áßñ';field.setSelectionRange(2,2);
   field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));
   return {value:field.value,start:field.selectionStart,end:field.selectionEnd};
  });assert.deepEqual(cursor,{value:'ÁSSÑ',start:3,end:3});
  await page.evaluate(()=>{const field=document.querySelector('#dw-product-customer');field.value='niño';field.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
  assert.equal(await page.locator('#dw-product-customer').inputValue(),'niño');
  await page.evaluate(()=>document.querySelector('#dw-product-customer').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  assert.equal(await page.locator('#dw-product-customer').inputValue(),'NIÑO');assert.equal(await page.evaluate(()=>saved.at(-1).value),'NIÑO');
  await page.evaluate(()=>{const form=document.querySelector('#consumptionForm');form.notes.value='pegado sin evento';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(await page.locator('#consumptionForm [name=notes]').inputValue(),'PEGADO SIN EVENTO');
  for(const selector of ['#username','#password','#email','#individualSalesSearch','#menu-name']){
   await page.locator(selector).fill('MiTexto');assert.equal(await page.locator(selector).inputValue(),'MiTexto');
  }
  const client=await browser.newPage();await client.setContent('<body data-page="client"><input id="dw-product-customer"></body>');
  await client.addScriptTag({path:path.join(__dirname,'../admin-customer-inputs.js')});
  await client.locator('#dw-product-customer').fill('María');assert.equal(await client.locator('#dw-product-customer').inputValue(),'María');
 }finally{await browser.close();}
});
