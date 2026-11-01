const assert=require('node:assert/strict'),{chromium}=require('playwright-core'),{harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness(),product=h.product(),receipt=h.call('createOrder',{order:h.order(product,{customerName:'Cliente web QA',items:[{productId:product.id,quantity:2,unitPrice:product.price,selectionIds:{}}]})}),errors=[];
 const size=h.save('toppings',{name:'Mini',kind:'Tamaño QA',price:0,available:true});
 const menuProduct=h.save('products',{name:'Pizza con tamaño',category:'Pizzas',price:25000,available:true,modifiers:[{id:'size-qa',name:'Elige el tamaño',source:'Tamaño QA',required:true,min:1,max:1,usePrice:true}]});
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
  await page.locator('#newWalkInSale').click();await page.locator('#paymentAddItem').click();
  await page.locator('#dw-catalog-dialog [data-dw-close]').click();await page.locator('#paymentDialog[open]').waitFor();
  await page.locator('#paymentForm [data-cancel-payment]').first().click();
  async function addIndividual(name,price){
   await page.locator('#newWalkInSale').click();await page.locator('#paymentAddItem').click();
   await page.locator(`#dw-manager-products [data-dw-product="${menuProduct.id}"]`).click();
   await page.locator(`#dw-product-body input[value="${size.id}"]`).check();
   await page.locator('#dw-unit-price').fill(String(price));await page.locator('[data-dw-quantity="1"]').click();
   await page.locator('#dw-line-notes').fill('Observación de '+name+': salsa aparte');
   await page.locator('#dw-add-product').click();await page.locator('#paymentDialog[open]').waitFor();
   assert.match(await page.locator('#paymentSaleLines').innerText(),new RegExp('Observación de '+name));
   assert.match(await page.locator('#paymentSaleLines').innerText(),/Mini/,'Conserva las opciones de la carta normal.');
   await page.locator('#paymentForm [name=individual_customer]').fill(name);await page.locator('#paymentForm [name=individual_estimated_time]').fill('25 minutos');await page.locator('#paymentForm [name=individual_observations]').fill('Observación general: entregar a '+name);await page.locator('#holdIndividualSale').click();await page.locator('#paymentDialog').waitFor({state:'hidden'});
  }
  await addIndividual('Ana',20000);await addIndividual('Luis',15000);
  assert.equal(await page.locator('[data-open-individual]').count(),2);assert.equal(h.sheets.get('Ventas').rows.length,1,'Guardar pendiente no registra ventas.');
  await load();assert.equal(await page.locator('[data-open-individual]').count(),2,'Los dos pendientes sobreviven recarga.');
  const originalDeadlines=await page.locator('[data-open-individual]').evaluateAll(nodes=>nodes.map(node=>node.dataset.orderDeadline));
  await page.evaluate(()=>{window.qaRealNow=Date.now;Date.now=()=>qaRealNow()+26*60000;DonPierosOrderDetails.updateCountdowns(document);});
  assert.equal(await page.locator('[data-open-individual].order-time-expired').count(),2,'Los dos pendientes parpadean al vencer sin esperar una consulta remota.');
  await page.evaluate(()=>{Date.now=qaRealNow;DonPierosOrderDetails.updateCountdowns(document);});
  assert.deepEqual(await page.locator('[data-open-individual]').evaluateAll(nodes=>nodes.map(node=>node.dataset.orderDeadline)),originalDeadlines,'El contador conserva su vencimiento.');
  const peer=await context.newPage();await peer.goto('http://127.0.0.1:4173/admin.html#dashboard');await peer.waitForFunction(()=>document.querySelectorAll('[data-open-individual]').length===2);
  await page.selectOption('#receptionSource','individual');await page.locator('#receptionSearch').fill('Ana');
  assert.equal(await page.locator('[data-open-individual]').count(),1);assert.equal(await page.locator('#dp-dashboard-orders').isVisible(),false);
  await page.locator('[data-open-individual]').click();
  assert.equal(await page.locator('#paymentForm [name=individual_observations]').inputValue(),'Observación general: entregar a Ana');
  const [manualPrint]=await Promise.all([context.waitForEvent('page'),page.locator('#printIndividualSale').click()]);
  await manualPrint.waitForSelector('article .size-option');
  assert.equal(await manualPrint.locator('article').first().evaluate(node=>!!(node.querySelector('.size-option').compareDocumentPosition(node.querySelector('strong'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
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
  await page.locator('#dp-order-time-form [name=estimated_time]').fill('30 min');await page.locator('#dp-order-time-form [name=order_observations]').fill('Sin piña; salsa aparte');await page.locator('#dp-order-time-form button').click();await page.locator('#dp-order-dialog').waitFor({state:'hidden'});
  await page.locator(`#dp-dashboard-order-list [data-dp-order="${receipt.orderId}"] [data-dp-view]`).click();
  assert.match(await page.locator('#dp-order-detail .dp-notes').innerText(),/Sin piña; salsa aparte/);
  assert.equal(await page.locator('#dp-print-width').count(),0);
  assert.equal(await page.locator('.dp-whatsapp-order svg').count(),1);
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});
   await page.mouse.move(0,0);
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#dp-charge-order')).backgroundColor==='rgb(23, 101, 206)');
   assert.equal(await page.locator('.dp-order-actions').evaluate(node=>node.scrollWidth>node.clientWidth),false,'Los botones del modal caben sin recortes.');
   const colors=await page.locator('.dp-order-actions').evaluate(node=>['#dp-charge-order','#dp-print-order','.dp-whatsapp-order','#dp-delete-order'].map(selector=>getComputedStyle(node.querySelector(selector)).backgroundColor));
   assert.deepEqual(colors,['rgb(23, 101, 206)','rgb(23, 101, 206)','rgb(22, 131, 68)','rgb(206, 41, 41)']);
  }
  await page.screenshot({path:'artifacts/comanda-acciones-colores.png'});
  await page.locator('#dp-edit-prices').click();await page.locator('#dp-order-price-form [name=price_0]').fill('35000');await page.selectOption('#dp-order-price-form [name=box_0]','Super maxi');
  await page.locator('#dp-order-price-form button[type=submit]').click();await page.locator('#dp-order-detail .dp-total').filter({hasText:'78.000'}).waitFor();
  assert.equal(h.call('dp_get_order',{id:receipt.orderId}).order.total,78000);
  const [webPrint]=await Promise.all([context.waitForEvent('page'),page.locator('#dp-print-order').click()]);
  await webPrint.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
  const printed=await webPrint.locator('.kitchen-item').innerText();assert.match(printed,/Precio unitario:.*35.000/);assert.match(printed,/Caja Super maxi:.*4.000/);assert.match(printed,/Total de la línea:.*78.000/);
  assert.equal(await webPrint.locator('.kitchen-item').evaluate(node=>!!(node.querySelector('.size-option').compareDocumentPosition(node.querySelector('h3'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'La comanda web imprime el tamaño sobre el nombre.');
  assert.match(await webPrint.locator('.estimated-print').innerText(),/30 min/);assert.match(await webPrint.locator('.notes').innerText(),/Sin piña; salsa aparte/);assert.doesNotMatch(await webPrint.locator('body').innerText(),/Tiempo asignado:/);await webPrint.close();
  await page.evaluate(()=>{window.qaRealNow=Date.now;Date.now=()=>qaRealNow()+31*60000;DonPierosOrderDetails.updateCountdowns(document);});
  assert.equal(await page.locator(`#dp-dashboard-order-list [data-dp-order="${receipt.orderId}"].order-time-expired`).count(),1,'El pedido de index también parpadea al vencer.');
  await page.evaluate(()=>{Date.now=qaRealNow;DonPierosOrderDetails.updateCountdowns(document);});
  await page.selectOption('#dp-change-order-stage','atendiendo');await page.locator('#dp-order-dialog').waitFor({state:'hidden'});await page.selectOption('#receptionStage','preparing');
  await page.locator(`#dp-dashboard-order-list [data-dp-order="${receipt.orderId}"]`).waitFor();
  await page.selectOption('#receptionStage','ready');await page.waitForFunction(()=>document.querySelectorAll('#dp-dashboard-order-list [data-dp-order]').length===0);
  await page.locator('#receptionReset').click();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.screenshot({path:'artifacts/recepcion-pendientes-filtros.png',animations:'disabled'});
  assert.deepEqual(errors,[]);console.log('OK: dos ventas individuales, recarga, filtro, impresión, cierre sin pérdida y cobro separado; precios/cajas web guardados, impresión con precios y estados filtrados.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
