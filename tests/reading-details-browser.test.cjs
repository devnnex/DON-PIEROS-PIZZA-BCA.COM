const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');

test('los desgloses de ventas y cuentas permanecen abiertos al actualizar; el usuario controla el cierre',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(fs.readFileSync(path.join(root,'admin.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
  await page.addStyleTag({path:path.join(root,'style.css')});
  for(const file of ['date-format.js','sales-shift.js','order-details.js','packaging.js'])await page.addScriptTag({path:path.join(root,file)});
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('  return { init };','  return { init, state, bindReadingDetails, renderIncomeReport, renderAccountDetail, openAccountDetailDialog, showAdminSection, renderAlerts, renderTableConsumptionPreview, setTableConsumptionPreviewVisible, copyTextToClipboard };').replace('document.addEventListener("DOMContentLoaded", App.init);','window.readingTest=App;');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
   document.body.classList.add('admin-authenticated');
   const now=new Date().toISOString();
   const record={saleId:'sale-1',invoice:'Venta 1',table:'Mesa 1',date:now,total:16500,profit:10000,items:[{name:'Pizza',quantity:1,total:16500}],payments:[{method:'cash',amount:16500}]};
   const table={id:'table-1',table_number:1,table_name:'Mesa 1'};
   window.readingSession={id:'session-1',table_id:'table-1',status:'open',payer_name:'Cliente',opened_at:now,restaurant_tables:table,session_items:[{id:'line-1',item_name:'Pizza',quantity:1,unit_price:16500,status:'served',created_at:now}]};
   Object.assign(readingTest.state,{page:'admin',currentUser:{id:'boss',role:'boss',full_name:'Caja'},authToken:'test',activeAdminSection:'income',business:{business_name:'Prueba'},tables:[table],sessions:[readingSession],incomeReport:{records:[record],filters:{dateFrom:'2026-11-14',dateTo:'2026-11-14',saleType:'all',paymentMethod:'all'},totals:{income:16500,profit:10000,cash:16500},totalRecords:1,recordRows:[],nextIndex:0}});
   document.querySelector('#income').classList.add('section-active');
   readingTest.bindReadingDetails();readingTest.renderIncomeReport();
  });
  const disclosure=page.locator('#incomeRecords details');
  await disclosure.locator('summary').click();
  await page.evaluate(()=>{readingTest.state.incomeReport.records[0].total=17000;readingTest.renderIncomeReport();});
  assert.equal(await disclosure.evaluate(n=>n.open),true,'Actualizar importes mantiene el desglose abierto.');
  await disclosure.locator('summary').click();
  await page.evaluate(()=>{readingTest.state.incomeReport.records[0].total=18000;readingTest.renderIncomeReport();});
  assert.equal(await disclosure.evaluate(n=>n.open),false,'El cierre manual también se conserva.');
  await disclosure.locator('summary').click();
  await page.locator('#incomeKpis').click();
  assert.equal(await disclosure.evaluate(n=>n.open),false,'Clic afuera cierra el desglose.');
  await disclosure.locator('summary').click();
  await page.evaluate(()=>readingTest.showAdminSection('accounts'));
  assert.equal(await disclosure.evaluate(n=>n.open),false,'Cambiar de sección cierra el desglose.');
  await page.evaluate(()=>readingTest.openAccountDetailDialog('session-1'));
  const fallback=await page.evaluate(async()=>{
   let value='',inside=false;
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Permiso bloqueado');}}});
   const original=document.execCommand;
   document.execCommand=()=>{const field=document.activeElement;value=field.value;inside=!!field.closest('dialog[open]');return true;};
   try{await readingTest.copyTextToClipboard('@llave-de-prueba');}
   finally{document.execCommand=original;}
   return {value,inside,leftover:document.querySelectorAll('dialog[open] textarea').length};
  });
  assert.deepEqual(fallback,{value:'@llave-de-prueba',inside:true,leftover:0},'El copiado alternativo funciona dentro del modal y limpia el campo temporal.');
  await page.evaluate(()=>{readingTest.state.sessions=[];readingTest.renderAccountDetail();});
  assert.equal(await page.locator('#accountDetailDialog').evaluate(n=>n.open),true,'Una lectura momentáneamente vacía no cierra la cuenta consultada.');
  assert.equal(await page.locator('#accountDetailContent .account-detail-update-status').count(),1);
  await page.evaluate(()=>{readingSession.session_items[0].quantity=2;readingTest.state.sessions=[readingSession];readingTest.renderAccountDetail();});
  assert.equal(await page.locator('#accountDetailDialog').evaluate(n=>n.open),true);
  assert.equal(await page.locator('.account-detail-update-status').count(),0);
  assert.match(await page.locator('.account-detail-line').first().innerText(),/2 ×/);
  await page.evaluate(()=>readingTest.openAccountDetailDialog('session-1'));
  assert.equal(await page.locator('#accountDetailDialog').evaluate(n=>n.open),false,'El mismo control alterna la apertura.');
  await page.evaluate(()=>readingTest.openAccountDetailDialog('session-1'));
  await page.mouse.click(2,2);
  assert.equal(await page.locator('#accountDetailDialog').evaluate(n=>n.open),false,'Clic en el fondo cierra la vista.');
  await page.evaluate(()=>{
   readingTest.state.activeAdminSection='dashboard';
   readingTest.state.requests=[1,2].map(n=>({id:'song-'+n,table_id:'table-1',restaurant_tables:{table_name:'Mesa 1'},status:'pending',request_type:'other',message:'Mesa 1 solicita la canción: Canción '+n,created_at:new Date().toISOString()}));
   readingTest.renderAlerts();
  });
  const requests=page.locator('#alertsPanel .alert-request-details');
  await requests.evaluate(n=>{n.open=true;});
  await page.evaluate(()=>{readingTest.state.requests.push({...readingTest.state.requests[0],id:'song-3'});readingTest.renderAlerts();});
  assert.equal(await requests.evaluate(n=>n.open),true,'Una nueva solicitud no cierra el desglose de solicitudes.');
  await page.evaluate(()=>{
   const dialog=document.querySelector('#consumptionDialog');dialog.showModal();
   document.querySelector('#consumptionForm').quick_checkout.value='0';
   readingSession.session_items=Array.from({length:30},(_,n)=>({...readingSession.session_items[0],id:'line-'+n}));
   readingTest.setTableConsumptionPreviewVisible(true);readingTest.renderTableConsumptionPreview(readingSession);
   document.querySelector('#tableConsumptionPreview').scrollTop=80;
   readingTest.renderTableConsumptionPreview(readingSession);
  });
  assert.equal(await page.locator('#tableConsumptionPreview').isVisible(),true,'El consumo desplegado sigue visible al actualizar.');
  assert.equal(await page.locator('#tableConsumptionPreview').evaluate(n=>n.scrollTop),80,'El refresco conserva la posición de lectura del consumo.');
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
