const assert=require('node:assert/strict'),{chromium}=require('playwright-core'),{harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),pizza=catalog.products.find(p=>p.name==='Pizza combinada');
 const [sizeGroup,flavorGroup]=pizza.modifiers,size=catalog.toppings.find(t=>t.kind===sizeGroup.source&&t.name.startsWith('Mini'));
 const flavors=catalog.toppings.filter(t=>t.kind===flavorGroup.source).slice(0,2),errors=[];let loseResponse=true,writes=0;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  async function account(role){
   const context=await browser.newContext({viewport:{width:role==='waiter'?390:1440,height:1000},serviceWorkers:'block'});
   await context.addInitScript(token=>{localStorage.setItem('don_pieros_admin_token',token);localStorage.setItem('waiter_alarm_enabled','0');},role);
   await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
   await context.route('https://script.google.com/**',route=>{
    const request=route.request();if(request.method()==='GET')return route.fulfill({json:{ok:true}});
    const body=request.postDataJSON(),result=h.call(body.action,body.payload||body,body.authToken||'',{clientSignals:body.clientSignals});
    if(body.action==='dp_create_staff_order'){writes++;if(loseResponse){loseResponse=false;return route.abort('failed');}}
    return route.fulfill({json:result});
   });
   await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{
    const rpc=new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({json:rpc==='get_current_user'?{id:role+'-id',full_name:role==='waiter'?'Mesero':'Jefe',role,is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP',tips_enabled:false},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_list_waiter_comandas'?{orders:[]}:rpc==='dp_setup_status'?false:[]});
   });
   return context;
  }
  const waiterContext=await account('waiter'),bossContext=await account('boss');
  const waiter=await waiterContext.newPage(),boss=await bossContext.newPage();
  for(const page of [waiter,boss]){page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);}
  await waiter.goto('http://127.0.0.1:4173/admin.html#service');await waiter.locator('[data-dw-individual]').waitFor();
  assert.deepEqual(await waiter.locator('[data-dw-individual]').evaluate(button=>({background:getComputedStyle(button).backgroundColor,color:getComputedStyle(button).color})),{background:'rgb(23, 103, 213)',color:'rgb(255, 255, 255)'});
  await waiter.locator('[data-dw-individual]').click();assert.equal(await waiter.locator('#dw-selection').isVisible(),false,'Un pedido vacío no muestra barra para enviar.');
  assert.deepEqual((await waiter.locator('[data-dw-product] strong').allTextContents()).slice(0,2),['Pizza combinada','Pizza La Pamplonita']);
  assert.match(await waiter.locator(`[data-dw-product="${pizza.id}"] img`).getAttribute('src'),/pizza-combinada.webp/);
  await waiter.locator(`[data-dw-product="${pizza.id}"]`).click();
  for(const id of [size.id,...flavors.map(f=>f.id)])await waiter.locator(`#dw-product-body input[value="${id}"]`).check();
  assert.equal(await waiter.locator('#dw-fulfillment').inputValue(),'');await waiter.locator('#dw-add-product').click();
  assert.equal(await waiter.evaluate(()=>document.activeElement.id),'dw-fulfillment');assert.match(await waiter.locator('.dw-fulfillment-field').getAttribute('class'),/dw-required-flash/);
  assert.equal(await waiter.locator('#dw-fulfillment-status').innerText(),'Obligatorio');assert.equal(await waiter.locator('#dw-fulfillment').getAttribute('aria-invalid'),'true');
  assert.match(await waiter.locator('#dw-fulfillment').evaluate(select=>getComputedStyle(select).animationName),/dw-required-border/);
  await waiter.screenshot({path:'artifacts/mesero-entrega-faltante.png',fullPage:false});
  assert.equal(await waiter.locator('#dw-product-dialog').evaluate(dialog=>dialog.open),true);
  await waiter.selectOption('#dw-fulfillment','pickup');await waiter.locator('[data-dw-quantity="1"]').click();await waiter.locator('#dw-line-notes').fill('Sin cebolla');await waiter.locator('#dw-add-product').click();
  assert.equal(await waiter.locator('#dw-selection').isVisible(),true);await waiter.screenshot({path:'artifacts/mesero-entrega-obligatoria.png',fullPage:false});
  await waiter.locator('[data-dw-review]').click();
  for(const name of ['', '  ', 'A']){
   await waiter.locator('#dw-individual-customer').fill(name);await waiter.locator('#dw-send-order').click();
   assert.equal(writes,0);assert.equal(await waiter.evaluate(()=>document.activeElement.id),'dw-individual-customer');
   assert.equal(await waiter.locator('#dw-individual-customer').getAttribute('aria-invalid'),'true');
   assert.match(await waiter.locator('#dw-individual-customer').evaluate(input=>getComputedStyle(input).animationName),/dw-required-border/);
  }
  const reviewText=await waiter.locator('.dw-review-lines').innerText();assert.match(reviewText,/Sabores \(mitad y mitad\): .+ \/ .+/);assert.doesNotMatch(reviewText,/Elige 2 sabores/);
  await waiter.locator('#dw-individual-customer').fill('Laura mostrador');assert.notEqual(await waiter.locator('#dw-individual-customer').getAttribute('aria-invalid'),'true');
  await waiter.locator('#dw-estimated-time').fill('20 minutos');await waiter.locator('#dw-order-notes').fill('Entregar juntas');
  await waiter.reload();await waiter.locator('[data-dw-individual]').click();assert.match(await waiter.locator('[data-dw-review]').innerText(),/2 productos/);
  await waiter.locator('[data-dw-review]').click();assert.equal(await waiter.locator('#dw-individual-customer').inputValue(),'Laura mostrador');assert.equal(await waiter.locator('#dw-order-notes').inputValue(),'Entregar juntas');
  await waiter.locator('#dw-send-order').click();await waiter.locator('#dw-send-error').filter({hasText:/./}).waitFor();assert.equal(h.call('dp_get_orders').orders.length,1);assert.equal(writes,1);
  await waiter.reload();await waiter.locator('[data-dw-individual]').click();await waiter.locator('[data-dw-review]').click();assert.match(await waiter.locator('#dw-send-order').innerText(),/Confirmar/);assert.equal(await waiter.locator('#dw-individual-customer').isDisabled(),true);
  await waiter.locator('#dw-send-order').click();await waiter.locator('#dp-waiter-app [role=status]').waitFor();assert.equal(writes,2);assert.equal(h.call('dp_get_orders').orders.length,1);
  const order=h.call('dp_get_orders').orders[0];assert.equal(order.total,96000);assert.equal(order.items[0].quantity,2);assert.equal(order.waiterName,'Mesero');assert.match(order.notes,/Entregar juntas/);
  assert.equal(h.sheets.get('Ventas').rows.length,1,'Enviar una comanda no registra un cobro.');
  await boss.goto('http://127.0.0.1:4173/admin.html#dashboard');await boss.locator('#salesShiftDialog[open]').waitFor();await boss.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  await boss.selectOption('#receptionSource','individual');
  const card=boss.locator(`#dp-dashboard-orders [data-dp-order="${order.id}"]`);await card.waitFor();assert.match(await card.innerText(),/Venta individual.*Mesero/);
  assert.equal(await card.locator('.dp-status').innerText(),'Nueva');
  assert.equal(await card.evaluate(node=>getComputedStyle(node).borderLeftColor),'rgb(33, 134, 83)');
  assert.equal(await card.evaluate(node=>getComputedStyle(node).animationName),'order-arrival-blink');
  assert.equal(await card.evaluate(node=>Number(node.dataset.orderArrivalUntil)),Date.parse(order.createdAt)+90000);
  await card.locator('[data-dp-view]').click();assert.match(await boss.locator('#dp-order-detail').innerText(),/Sin cebolla/);
  assert.match(await boss.locator('#dp-order-detail').innerText(),/Sabores \(mitad y mitad\): .+ \/ .+/);assert.doesNotMatch(await boss.locator('#dp-order-detail').innerText(),/Elige 2 sabores/);
  for(const [fulfillment,amount] of [['dinein',92000],['pickup',96000]]){
   await boss.locator('[data-dp-edit-product="0"]').click();assert.equal(await boss.locator('#dw-fulfillment').isEnabled(),true);
   await boss.selectOption('#dw-fulfillment',fulfillment);await boss.locator('#dw-add-product').click();await boss.locator('#dp-order-dialog[open]').waitFor();
   assert.equal(h.call('dp_get_order',{id:order.id}).order.total,amount);
  }
  const [printed]=await Promise.all([bossContext.waitForEvent('page'),boss.locator('#dp-print-order').click()]);await printed.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
  assert.match(await printed.locator('body').innerText(),/Venta individual.*Mesero/);assert.match(await printed.locator('body').innerText(),/Sin cebolla/);await printed.close();
  await boss.screenshot({path:'artifacts/venta-individual-mesero-caja.png',fullPage:false});
  await boss.locator('#dp-charge-order').click();await boss.locator('#paymentDialog[open]').waitFor();assert.match(await boss.locator('#paymentDialog').innerText(),/Sin cebolla/);assert.match(await boss.locator('#paymentTotal').innerText(),/96.000/);
  assert.deepEqual(errors,[]);console.log('OK: mesero sin mesa, borrador tras recarga, envío con respuesta perdida, reintento sin duplicar, recepción en otro equipo, filtro individual, notas, impresión y cobro por caja.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
