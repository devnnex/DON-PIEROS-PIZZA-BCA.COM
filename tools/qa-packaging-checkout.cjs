const assert=require('node:assert/strict'),{chromium}=require('playwright-core'),{harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog');
 const pizza=catalog.products.find(p=>p.name==='Pizza combinada'),[sizes,flavors]=pizza.modifiers;
 const size=name=>catalog.toppings.find(t=>t.kind===sizes.source&&t.name.startsWith(name));
 const halves=catalog.toppings.filter(t=>t.kind===flavors.source).slice(0,2),errors=[];
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>{const request=route.request();if(request.method()==='GET')return route.fulfill({json:{ok:true}});const body=request.postDataJSON();return route.fulfill({json:h.call(body.action,body.payload||body,body.authToken||'',{clientSignals:body.clientSignals})});});
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{const rpc=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({json:rpc==='get_current_user'?{id:'boss-id',full_name:'Jefe',role:'boss',is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP',tips_enabled:false},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_list_waiter_comandas'?{orders:[]}:rpc==='dp_setup_status'?false:[]});});
  await context.addInitScript(()=>{localStorage.setItem('waiter_alarm_enabled','0');window.navigation.addEventListener('navigate',event=>{if(event.destination.url.includes('whatsapp.com'))event.preventDefault();});});
  const admin=await context.newPage();await admin.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));admin.on('pageerror',e=>errors.push(e.message));admin.setDefaultNavigationTimeout(60000);
  await admin.goto('http://127.0.0.1:4173/admin.html#dashboard');await admin.locator('#salesShiftDialog[open]').waitFor();await admin.evaluate(()=>document.querySelector('#salesShiftDialog').close());
  for(const fulfillment of ['pickup','delivery','dinein']){
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultNavigationTimeout(60000);
   await page.goto('http://127.0.0.1:4173/');await page.locator('#welcome-close').click();await page.locator('[data-category="Pizzas especiales"]').click();
   assert.deepEqual((await page.locator('[data-product] h3').allTextContents()).slice(0,2),['Pizza combinada','Pizza La Pamplonita']);
   const photo=page.locator(`[data-product="${pizza.id}"] img`);assert.match(await photo.getAttribute('src'),/pizza-combinada.webp/);await photo.evaluate(img=>img.decode());
   for(const [name,quantity] of [['Mini',2],['Super maxi',1]]){
    await page.locator(`[data-product="${pizza.id}"]`).click();for(const id of [size(name).id,...halves.map(f=>f.id)])await page.locator(`#product-detail input[value="${id}"]`).check();
    if(quantity===2)await page.locator('#product-detail [data-qty="plus"]').click();
    await page.locator('#add-product').click();
   }
   await page.locator('#header-cart').click();await page.locator('#go-checkout').click();await page.locator(`[name=fulfillment][value=${fulfillment}]`).locator('..').click();
   if(fulfillment==='delivery'){await page.locator('[name=address]').fill('Calle 10 numero 20');await page.locator('[name=neighborhood]').fill('Centro QA');}
   await page.locator('[name=name]').fill('Cliente cajas '+fulfillment);await page.locator('[name=phone]').fill('3102241444');await page.locator('[name=payment][value=efectivo]').locator('..').click();
   const expected=fulfillment==='dinein'?188000:196000,boxes=fulfillment==='dinein'?0:8000;
   if(fulfillment==='delivery')assert.match(await page.locator('#checkout-delivery-fee').innerText(),/Por confirmar/);
   assert.match((await page.locator('#checkout-total').innerText()).replace(/\s/g,''),new RegExp(String(expected).replace(/000$/,'\\.000')));
   await page.locator('#confirm-order').click();await page.locator('.queue-confirmation').waitFor();
   const url=new URL(await page.locator('.success a.dp-whatsapp').getAttribute('href')),message=url.searchParams.get('text').replace(/\s/g,'');
   assert.ok(message.includes(String(expected).replace(/000$/,'.000')),message);assert.equal(message.includes('Caja(s):'),!!boxes);
   if(boxes){assert.match(message,/CajaMini:2×\$2\.000=\$4\.000/);assert.match(message,/CajaSupermaxi:1×\$4\.000=\$4\.000/);}else assert.doesNotMatch(message,/CajaMini|CajaSuper/);
   if(fulfillment==='delivery')assert.match(message,/Domicilio:\*Porconfirmar/);
   const order=h.call('dp_get_orders').orders.find(o=>o.customerName==='Cliente cajas '+fulfillment);assert.ok(order);assert.equal(order.total,expected);assert.equal(order.packagingFee,boxes);assert.equal(order.subtotal,188000);
   await page.close();await admin.locator(`#dp-dashboard-orders [data-dp-order="${order.id}"] [data-dp-view]`).click({timeout:15000});
   const totals=(await admin.locator('.dp-totals').innerText()).replace(/\s/g,'');assert.match(totals,/Productos\$188\.000/);assert.equal(totals.includes('Cajasparallevar'),!!boxes);
   const [printed]=await Promise.all([context.waitForEvent('page'),admin.locator('#dp-print-order').click()]);await printed.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
   const print=(await printed.locator('body').innerText()).replace(/\s/g,'');assert.equal(print.includes('Cajasparallevar:'),!!boxes);assert.ok(print.includes(String(expected).replace(/000$/,'.000')));
   if(fulfillment==='delivery'){
    assert.match(print,/Domicilio:Porconfirmar/);assert.match(totals,/DomicilioPorconfirmar/);
    await printed.close();await admin.locator('#dp-charge-order').click();await admin.locator('#paymentDialog[open]').waitFor();
    assert.match((await admin.locator('#paymentTotal').innerText()).replace(/\s/g,''),/196\.000/);await admin.evaluate(()=>document.querySelector('#paymentDialog').close());
   }else{await printed.close();await admin.locator('#dp-order-dialog [data-dp-close]').click();}
  }
  await admin.locator('#newWalkInSale').click();
  for(const [name,quantity,fulfillment] of [['Mini',2,'pickup'],['Super maxi',1,'dinein']]){
   await admin.locator('#paymentAddItem').click();await admin.locator(`#dw-manager-products [data-dw-product="${pizza.id}"]`).click();
   for(const id of [size(name).id,...halves.map(f=>f.id)])await admin.locator(`#dw-product-body input[value="${id}"]`).check();
   await admin.selectOption('#dw-fulfillment',fulfillment);if(quantity===2)await admin.locator('[data-dw-quantity="1"]').click();
   await admin.locator('#dw-add-product').click();await admin.locator('#paymentDialog[open]').waitFor();
  }
  assert.match((await admin.locator('#paymentTotal').innerText()).replace(/\s/g,''),/192\.000/);
  for(const width of ['80','58']){
   await admin.evaluate(value=>localStorage.setItem('don_pieros_order_paper',value),width);
   const [printed]=await Promise.all([context.waitForEvent('page'),admin.locator('#printIndividualSale').click()]);await printed.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
   assert.equal(await printed.locator('.packing-line').count(),1);
   assert.match((await printed.locator('.packing-line').innerText()).replace(/\s/g,''),/CajaMini:2×\$2\.000=\$4\.000/);
   const text=(await printed.locator('body').innerText()).replace(/\s/g,'');assert.match(text,/Productos:\$188\.000/);assert.match(text,/Cajasparallevar:\$4\.000/);assert.match(text,/Total:\$192\.000/);await printed.close();
  }
  assert.deepEqual(errors,[]);console.log('OK: index → WhatsApp → recepción → comanda con cajas y domicilio Por confirmar. Venta individual mixta: productos $188.000 + cajas $4.000 = $192.000, impresión 58/80 mm. Foto y orden inicial correctos.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
