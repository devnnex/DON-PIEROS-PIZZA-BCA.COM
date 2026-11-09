const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('cobros y avisos no bloquean la siguiente cuenta; botones destacados y comandas aceptadas protegidas',async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(read('admin.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.addStyleTag({path:path.join(root,'style.css')});await page.addStyleTag({path:path.join(root,'waiter-orders.css')});
  for(const file of ['sales-shift.js','date-format.js','packaging.js','order-labels.js','order-details.js'])await page.addScriptTag({path:path.join(root,file)});
  const app=read('app.js').replace('  return { init };','  return { init, state, openPaymentDialog, processPayment, showAdminSection };')
   .replace('document.addEventListener("DOMContentLoaded", App.init);','window.interactionApi=App;')
   .replace('  const finishCheckoutIntent = async (intent) => {','  const finishCheckoutIntent = async (intent) => { if(window.fixtureFinish)return window.fixtureFinish(intent);');
  await page.addScriptTag({content:app});
  await page.evaluate(()=>{
   document.body.classList.add('admin-authenticated');
   const state=interactionApi.state;
   Object.assign(state,{page:'admin',currentUser:{id:'boss',role:'boss',full_name:'Caja'},authToken:'fixture',business:{business_name:'Don Pieros Pizza'},inventoryMeta:{},invoiceHistory:[],items:[],requests:[],tables:[{id:'table',table_name:'Mesa 1',table_number:1,is_active:true}]});
   state.sessions=['one','two','three'].map((id,index)=>({id,status:'open',sale_channel:'walk_in',local_only:true,payer_name:id,session_items:[{id:'line-'+id,item_name:'Pizza',quantity:1,unit_price:20000+index*1000,status:'served'}]}));
   window.started=[];window.finished=[];window.releaseFirst=null;
   window.fixtureFinish=async intent=>{started.push(intent.session.id);if(intent.session.id==='one')await new Promise(resolve=>releaseFirst=resolve);finished.push(intent.invoice);return true;};
   interactionApi.showAdminSection('dashboard');interactionApi.openPaymentDialog('one');
  });
  await page.evaluate(()=>{window.first=interactionApi.processPayment(document.querySelector('#paymentForm'),{value:'save'});});
  await page.waitForFunction(()=>started.length===1);
  await page.evaluate(()=>interactionApi.openPaymentDialog('two'));
  assert.equal(await page.locator('#paymentDialog').evaluate(dialog=>dialog.open),true);
  await page.evaluate(()=>{window.second=interactionApi.processPayment(document.querySelector('#paymentForm'),{value:'save'});});
  await page.waitForFunction(()=>!document.querySelector('#paymentDialog').open);
  assert.deepEqual(await page.evaluate(()=>started),['one']);
  await page.evaluate(()=>interactionApi.openPaymentDialog('three'));
  await page.evaluate(()=>releaseFirst());await page.evaluate(()=>Promise.all([first,second]));
  assert.equal(await page.locator('#paymentDialog').evaluate(dialog=>dialog.open),true,'Los cobros anteriores no cierran el formulario nuevo');
  assert.equal(await page.locator('#paymentForm [name=session_id]').inputValue(),'three');
  assert.equal(await page.locator('#paymentForm button[type=submit]').first().isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>finished.map(invoice=>invoice.totals.total)),[20000,21000]);
  await page.evaluate(()=>document.querySelector('#paymentDialog').close());
  assert.ok(await page.locator('.system-modal.ok').count()>0,'El aviso de éxito todavía está visible');
  await page.locator('#individualSalesPanel [data-new-individual]').click();
  await page.mouse.move(0,0);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#individualSalesPanel [data-new-individual]')).backgroundColor==='rgb(20, 88, 204)');
  const blue=await page.locator('#individualSalesPanel [data-new-individual]').evaluate(button=>({color:getComputedStyle(button).color,background:getComputedStyle(button).backgroundColor,animation:getComputedStyle(button,'::after').animationName,pointer:getComputedStyle(button,'::after').pointerEvents}));
  assert.equal(blue.color,'rgb(255, 255, 255)');assert.equal(blue.background,'rgb(20, 88, 204)');assert.equal(blue.animation,'loginNeonCircuit');assert.equal(blue.pointer,'none');
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.locator('#individualSalesPanel [data-new-individual]').screenshot({path:path.join(root,'artifacts/new-sale-blue-v72.png')});
  await page.evaluate(()=>{
   window.fixtureOrders=[{id:'accepted',table_id:'table',session_id:'table-session',version:1,accepted_at:new Date().toISOString(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),table:{table_name:'Mesa 1'},waiter_name:'Mesero',items:[{id:'line',web_product_id:'pizza',item_name:'Pizza',quantity:1,unit_price:20000,waiter_options:{},waiter_line_notes:''}],notes:''}];
   DonPierosAdmin.db={rpc:()=>({abortSignal:async()=>({data:{orders:fixtureOrders}})})};
   DonPierosAdmin.refreshOperations=async()=>{};window.DonPierosImages={resolve:()=>''};window.DonPierosPerformance={read:()=>({products:[],toppings:[]})};
   window.DON_PIEROS_CONFIG={appsScriptUrl:'/catalog'};window.fetch=async()=>new Response(JSON.stringify({ok:true,products:[],toppings:[]}));
  });
  await page.addScriptTag({content:read('waiter-orders.js').replace('  function tick(){','  window.comandaUi={showKitchen,removeOrder};\n  function tick(){')});
  await page.locator('[data-dw-open-comanda="accepted"]').waitFor();await page.locator('[data-dw-open-comanda="accepted"]').click();
  assert.equal(await page.locator('[data-dw-remove-order="accepted"]').count(),0);
  await page.evaluate(()=>comandaUi.removeOrder('accepted'));assert.equal(await page.locator('[data-dw-remove-order="accepted"]').count(),0);
  await page.evaluate(()=>{document.querySelector('#dw-kitchen-dialog').close();interactionApi.showAdminSection('service');});
  await page.evaluate(()=>DonPierosWaiter.startTableOrder('table'));
  await page.locator('[data-dw-custom]').first().waitFor();
  const gold=await page.locator('[data-dw-custom]').first().evaluate(button=>({animation:getComputedStyle(button,'::after').animationName,border:getComputedStyle(button).borderTopStyle,pointer:getComputedStyle(button,'::after').pointerEvents}));
  assert.equal(gold.animation,'loginNeonCircuit');assert.equal(gold.border,'solid');assert.equal(gold.pointer,'none');
  await page.locator('[data-dw-custom]:visible').first().screenshot({path:path.join(root,'artifacts/custom-product-gold-v72.png')});
  await page.evaluate(()=>dispatchEvent(new CustomEvent('donpieros-account-closed',{detail:{sessionId:'table-session'}})));
  assert.equal(await page.locator('[data-dw-open-comanda="accepted"]').count(),0);
  await page.evaluate(()=>{document.querySelector('#dw-catalog-dialog').close();interactionApi.state.currentUser.role='waiter';document.body.dataset.userRole='waiter';DonPierosWaiter.sync();DonPierosWaiter.startTableOrder('table');});
  await page.locator('[data-dw-custom]:visible').first().waitFor();
  assert.equal(await page.locator('[data-dw-custom]:visible').first().evaluate(button=>getComputedStyle(button,'::after').animationName),'loginNeonCircuit');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('[data-dw-custom]').first().evaluate(button=>getComputedStyle(button,'::after').animationName),'none');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
