const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {harness}=require('../tests/helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),product=catalog.products[0],group=product.modifiers[0];
 const sizes=catalog.toppings.filter(option=>option.kind===group.source);
 const neighborhood=h.save('neighborhoods',{name:'Centro',delivery_fee:4000,available:true});
 const result=h.call('createOrder',{order:h.order(product,{customerName:'Elkin',fulfillment:'delivery',address:'Calle 10 # 20-30',neighborhoodId:neighborhood.id,deliveryFee:4000,notes:'Una sin cebolla.\nSeparar la salsa.\nAlergia a maní.',items:[
  {productId:product.id,quantity:2,unitPrice:product.price+sizes[0].price,selectionIds:{[group.id]:[sizes[0].id]}},
  {productId:product.id,quantity:1,unitPrice:product.price+sizes[3].price,selectionIds:{[group.id]:[sizes[3].id]}}
 ]})});assert.equal(result.ok,true);
 // A spreadsheet can return a telephone as a number, especially on older orders.
 h.sheets.get('Ordenes_Web').rows[1][7]=3102241444;
 const errors=[],reads=[];
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',async route=>{const req=route.request();if(req.method()==='GET')return route.fulfill({json:{ok:true}});const body=req.postDataJSON();reads.push(body.action);return route.fulfill({json:body.action==='bootstrap'?{ok:true}:h.call(body.action,body.payload||body,body.authToken||'')});});
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{const rpc=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({json:rpc==='get_current_user'?{id:'boss-id',full_name:'Jefe',role:'boss',is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_setup_status'?false:[]});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/admin.html#dashboard');
  const dashboardCard=page.locator('#dp-dashboard-orders [data-dp-order]').first();await dashboardCard.waitFor();
  await page.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  await dashboardCard.locator('h3').click();
  assert.equal(await page.locator('#dp-order-dialog').evaluate(dialog=>dialog.open),true,`La tarjeta debe abrir incluso con teléfono numérico. Errores: ${errors.join('; ')}`);
  assert.ok(await page.locator('#dp-order-dialog').evaluate(dialog=>dialog.getBoundingClientRect().width)>=1000,'El modal aprovecha el ancho de escritorio.');
  assert.equal(await page.locator('#dp-order-dialog>.dp-dialog-card').evaluate(card=>card.scrollHeight<=card.clientHeight+1),true,'Un pedido normal cabe completo en escritorio.');
  assert.match(await page.locator('.dp-order-customer').evaluate(card=>getComputedStyle(card).backgroundImage),/rgb\(255, 247, 217\)/);
  assert.match(await page.locator('.dp-order-heading time').innerText(),/^[A-ZÁÉÍÓÚ][a-záéíóú]{2} \d{1,2} [a-z]{3,4} \d{4} - \d{1,2}:\d{2} (AM|PM)$/);
  await page.locator('#dp-order-dialog').screenshot({path:path.join(root,'artifacts/comanda-modal-amplio.png')});
  assert.match(await page.locator('#dp-order-detail').innerText(),/3102241444/);
  await page.keyboard.press('Escape');
  const dateField=page.locator('#incomeDateFrom');
  await dateField.evaluate(input=>{input.value='2026-10-28';});
  assert.equal(await dateField.inputValue(),'2026-10-28','El formato visible no altera el valor del filtro.');
  assert.equal(await dateField.locator('..').locator('.dp-date-label').innerText(),'Mié 28 oct 2026');
  await dateField.evaluate(input=>{input.value='2026-10-29';input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await dateField.locator('..').locator('.dp-date-label').innerText(),'Jue 29 oct 2026');
  await dashboardCard.locator('[data-dp-view]').click();assert.equal(await page.locator('#dp-order-dialog').evaluate(dialog=>dialog.open),true);await page.keyboard.press('Escape');
  for(const width of [58,80]){
   await page.locator('#dp-dashboard-orders [data-dp-paper]').selectOption(String(width));
   await dashboardCard.locator('[data-dp-print]').click();
   assert.equal(await page.locator('#dp-order-dialog').evaluate(dialog=>dialog.open),false,'Imprimir desde la tarjeta no abre otra comanda.');
   const frame=page.frames().find(frame=>frame!==page.mainFrame()&&frame.url()==='about:blank');assert.ok(frame);
   await frame.locator('.kitchen-item').first().waitFor();
   const text=await frame.locator('body').innerText();
   assert.match(text,/COMANDA DE COCINA/);assert.match(text,/2 × Pizza/);assert.match(text,/1 × Pizza/);
   assert.match(text,/Mini/);assert.match(text,/Super maxi/);assert.match(text,/INDICACIONES PARA COCINA/);
   assert.match(text,/Alergia a maní/);assert.match(text,/Centro/);assert.match(text,/Domicilio/);
   assert.match(text,/Tamaño: Super maxi · 54 × 54 cm/);
   assert.match(text,/TOTAL:\s*\$\s*200\.000 COP/);
   assert.doesNotMatch(text,/Valor de esta línea|POR VERIFICAR|Elige el tamaño|\(\+\$|Subtotal:/);
   await page.waitForFunction(()=>document.querySelector('[data-dp-receipt]')?.contentDocument?.querySelector('[data-thermal-paper]'));
   const html=await frame.locator('html').evaluate(node=>node.outerHTML);
   const preview=await context.newPage();await preview.setContent('<!doctype html>'+html);await preview.emulateMedia({media:'print'});
   assert.equal(await preview.evaluate(()=>document.body.scrollWidth<=Math.ceil(document.body.getBoundingClientRect().width)+1),true,'Nada se sale del ancho del papel.');
   const pdf=await preview.pdf({preferCSSPageSize:true,printBackground:false,path:path.join(root,`artifacts/comanda-cocina-${width}mm.pdf`)});
   const mediaBox=pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(mediaBox);
   assert.ok(Math.abs(Number(mediaBox[1])-width*72/25.4)<2,'PDF con ancho térmico correcto.');
   assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'La comanda completa cabe en un recibo continuo.');
   await preview.locator('body').screenshot({path:path.join(root,`artifacts/comanda-cocina-${width}mm.png`)});await preview.close();
   await page.evaluate(()=>document.querySelectorAll('[data-dp-receipt]').forEach(frame=>frame.remove()));
  }
  await page.evaluate(()=>location.hash='onlineorders');const list=page.locator('#dp-orders-list [data-dp-order]').first();await list.waitFor();
  for(const viewport of [390,1440]){
   await page.setViewportSize({width:viewport,height:1000});await list.locator('[data-dp-view]').click();
   if(viewport===390)await page.locator('#dp-order-dialog').screenshot({path:path.join(root,'artifacts/comanda-modal-movil.png')});
   assert.equal(await page.locator('#dp-order-dialog').evaluate(dialog=>dialog.open),true);await page.keyboard.press('Escape');
   await list.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#dp-order-dialog').evaluate(dialog=>dialog.open),true);await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]);console.log('OK: teléfono numérico, tarjeta y botón desde Inicio/Pedidos web, teclado, móvil/escritorio, impresión directa y PDF térmico 58/80 mm con opciones e indicaciones.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
