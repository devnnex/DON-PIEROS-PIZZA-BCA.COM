const assert=require('node:assert/strict'),{chromium}=require('playwright-core'),{harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness(),product=h.product(),receipt=h.call('createOrder',{order:h.order(product,{customerName:'Cliente web QA',items:[{productId:product.id,quantity:2,unitPrice:product.price,selectionIds:{}}]})}),errors=[];
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('don_pieros_admin_token','boss');localStorage.setItem('waiter_alarm_enabled','0');});
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>{const req=route.request();if(req.method()==='GET')return route.fulfill({json:{ok:true}});const body=req.postDataJSON();return route.fulfill({json:h.call(body.action,body.payload||body,body.authToken||'')});});
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{
   const rpc=new URL(route.request().url()).pathname.split('/').pop();
   return route.fulfill({json:rpc==='get_current_user'?{id:'boss-id',full_name:'Jefe',role:'boss',is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP',tips_enabled:false},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_list_waiter_comandas'?{orders:[]}:rpc==='dp_setup_status'?false:[]});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  async function load(){await page.goto('http://127.0.0.1:4173/admin.html#dashboard');await page.locator('#newWalkInSale').waitFor();await page.locator('#salesShiftDialog[open]').waitFor({timeout:1500}).then(()=>page.locator('#salesShiftDialog [data-close-dialog]').first().click()).catch(()=>{});}
  await load();
  async function addIndividual(name,price){
   await page.locator('#newWalkInSale').click();await page.locator('#paymentAddItem').click();
   await page.locator('#consumptionProductSearch').fill('Pedido individual de '+name);
   await page.locator('#consumptionForm [name=quantity]').fill('2');
   await page.locator('#consumptionOptionalFields summary').press('Enter');
   await page.locator('#consumptionForm [name=unit_price]').fill(String(price));
   await page.locator('#consumptionSubmitButton').click();await page.locator('#paymentDialog[open]').waitFor();
   await page.locator('#paymentForm [name=individual_customer]').fill(name);await page.locator('#holdIndividualSale').click();await page.locator('#paymentDialog').waitFor({state:'hidden'});
  }
  await addIndividual('Ana',20000);await addIndividual('Luis',15000);
  assert.equal(await page.locator('[data-open-individual]').count(),2);assert.equal(h.sheets.get('Ventas').rows.length,1,'Guardar pendiente no registra ventas.');
  await load();assert.equal(await page.locator('[data-open-individual]').count(),2,'Los dos pendientes sobreviven recarga.');
  const peer=await context.newPage();await peer.goto('http://127.0.0.1:4173/admin.html#dashboard');await peer.waitForFunction(()=>document.querySelectorAll('[data-open-individual]').length===2);
  await page.selectOption('#receptionSource','individual');await page.locator('#receptionSearch').fill('Ana');
  assert.equal(await page.locator('[data-open-individual]').count(),1);assert.equal(await page.locator('#dp-dashboard-orders').isVisible(),false);
  await page.locator('[data-open-individual]').click();
  const [manualPrint]=await Promise.all([context.waitForEvent('page'),page.locator('#printIndividualSale').click()]);
  await manualPrint.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');assert.match(await manualPrint.locator('body').innerText(),/Ana[\s\S]*40.000[\s\S]*PENDIENTE DE COBRO/);await manualPrint.close();
  await page.locator('#paymentForm [data-cancel-payment]').first().click();assert.equal(await page.locator('[data-open-individual]').count(),1,'Cerrar conserva el pendiente filtrado.');
  await page.locator('#receptionReset').click();assert.equal(await page.locator('[data-open-individual]').count(),2);
  await page.locator('[data-open-individual]').filter({hasText:'Ana'}).click();await page.locator('#paymentForm button[value=save]').click();
  await page.waitForFunction(()=>DonPierosAdmin.getOperations().sessions.filter(row=>row.local_only&&!row.web_order_id&&row.session_items?.length).length===1);
  await page.locator('#receiptResultDialog [data-close-receipt-result]').first().click().catch(()=>{});
  await page.waitForFunction(()=>!document.querySelector('#paymentDialog').open);
  assert.equal(await page.locator('[data-open-individual]').count(),1,'Cobrar quita solo la venta elegida.');
  await peer.waitForFunction(()=>document.querySelectorAll('[data-open-individual]').length===1);await peer.close();
  await page.selectOption('#receptionSource','online');
  await page.locator(`#dp-dashboard-order-list [data-dp-order="${receipt.orderId}"] [data-dp-view]`).click();
  await page.locator('#dp-edit-prices').click();await page.locator('#dp-order-price-form [name=price_0]').fill('35000');await page.selectOption('#dp-order-price-form [name=box_0]','Super maxi');
  await page.locator('#dp-order-price-form button[type=submit]').click();await page.locator('#dp-order-detail .dp-total').filter({hasText:'78.000'}).waitFor();
  assert.equal(h.call('dp_get_order',{id:receipt.orderId}).order.total,78000);
  const [webPrint]=await Promise.all([context.waitForEvent('page'),page.locator('#dp-print-order').click()]);
  await webPrint.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
  const printed=await webPrint.locator('.kitchen-item').innerText();assert.match(printed,/Precio unitario:.*35.000/);assert.match(printed,/Caja Super maxi:.*4.000/);assert.match(printed,/Total de la línea:.*78.000/);await webPrint.close();
  await page.selectOption('#dp-change-order-stage','atendiendo');await page.locator('#dp-order-dialog').waitFor({state:'hidden'});await page.selectOption('#receptionStage','preparing');
  await page.locator(`#dp-dashboard-order-list [data-dp-order="${receipt.orderId}"]`).waitFor();
  await page.selectOption('#receptionStage','ready');await page.waitForFunction(()=>document.querySelectorAll('#dp-dashboard-order-list [data-dp-order]').length===0);
  await page.locator('#receptionReset').click();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.screenshot({path:'artifacts/recepcion-pendientes-filtros.png',animations:'disabled'});
  assert.deepEqual(errors,[]);console.log('OK: dos ventas individuales, recarga, filtro, impresión, cierre sin pérdida y cobro separado; precios/cajas web guardados, impresión con precios y estados filtrados.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
