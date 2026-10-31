const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core'),{harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness({seedMenu:true}),errors=[];let submissions=0;
 h.save('neighborhoods',{name:'Barrio conocido',delivery_fee:6000,available:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>route.fulfill({json:[]}));
  await context.route('https://script.google.com/**',route=>{const req=route.request();if(req.method()==='GET')return route.fulfill({json:{ok:true}});const body=req.postDataJSON();if(body.action==='createOrder')submissions++;return route.fulfill({json:h.call(body.action,body.payload||body,body.authToken||'')});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/');await page.locator('#welcome-close').click();
  for(const number of ['3138367511','3185536604']){
   const link=page.locator('.store-whatsapp a').filter({hasText:number}),url=new URL(await link.getAttribute('href'));
   assert.equal(url.searchParams.get('phone'),'57'+number);assert.match(url.searchParams.get('text'),/quiero hacer un pedido/);
  }
  await page.locator('[data-product]').filter({hasText:'Pizza Don Pieros'}).click();await page.locator('.option').filter({hasText:/^Mediana/}).click();await page.locator('#add-product').click();
  await page.locator('#header-cart').click();await page.locator('#go-checkout').click();
  assert.equal(await page.locator('[name=payment]:checked').count(),0,'El cliente debe elegir el pago');
  await page.locator('[name=fulfillment][value=delivery]').check({force:true});
  // Native radio inputs are visually hidden; changing via their label is also supported.
  await page.locator('#checkout-form [name=address]').waitFor();
  const field=name=>page.locator(`[data-checkout-field=${name}]`);
  for(const name of ['address','neighborhood','name','phone'])assert.equal(await field(name).locator('.checkout-field-status').innerText(),'Obligatorio');
  for(const [name,value] of [['address','Calle 10 # 20-30'],['neighborhood','Barrio nuevo'],['name','Cliente prueba']]){
   await field(name).locator('input').fill(value);assert.equal(await field(name).locator('.checkout-field-status').innerText(),'✓ Correcto');
  }
  const phone=field('phone').locator('input');
  for(const value of ['313718366','31371836666','abc3137183666']){
   await phone.fill(value);assert.equal(await field('phone').locator('.checkout-field-status').innerText(),'Obligatorio');await page.locator('#confirm-order').click();assert.equal(submissions,0);
  }
  await phone.fill('313 718 3666');assert.equal(await field('phone').locator('.checkout-field-status').innerText(),'✓ Correcto');
  await page.locator('#confirm-order').click();assert.equal(submissions,0,'Un formulario completo exige elegir el pago');
  assert.equal(await phone.evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(32, 131, 75)');
  for(const text of ['Efectivo','Transferencia Nequi','Bre-B'])assert.equal(await page.locator('.payment-grid label').filter({hasText:text}).count(),1);
  await page.locator('.payment-grid label').filter({hasText:'Transferencia Nequi'}).click();
  assert.equal(await field('phone').locator('.checkout-field-status').innerText(),'✓ Correcto','Conserva validación al elegir pago');
  assert.equal(await field('notes').locator('.checkout-field-status').innerText(),'Opcional');
  const geometry=await page.evaluate(()=>{const input=document.querySelector('[name=neighborhood]').getBoundingClientRect(),help=document.querySelector('#neighborhood-help').getBoundingClientRect();return {inputBottom:input.bottom,helpTop:help.top,overflows:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(geometry.helpTop>=geometry.inputBottom,JSON.stringify(geometry));assert.equal(geometry.overflows,false);
  const colors=await page.evaluate(()=>['.summary-packaging','.summary-delivery-pending','.summary .total'].map(s=>getComputedStyle(document.querySelector(s)).color));assert.equal(new Set(colors).size,3);
  for(const selector of ['.summary-packaging','.summary-delivery-pending'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await field('neighborhood').locator('input').fill('Barrio conocido');assert.equal(await page.locator('.summary-delivery-pending').count(),0);assert.match(await page.locator('#checkout-delivery-fee').innerText(),/6.000/);
  await field('neighborhood').locator('input').fill('Barrio nuevo');assert.equal(await page.locator('.summary-delivery-pending').count(),1);
  await field('neighborhood').scrollIntoViewIfNeeded();fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/checkout-campos-movil.png'});
  await page.setViewportSize({width:320,height:740});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.querySelector('#neighborhood-help').getBoundingClientRect().top>=document.querySelector('[name=neighborhood]').getBoundingClientRect().bottom),true);
  await page.locator('#confirm-order').click();await page.locator('.success-celebration').waitFor();assert.equal(submissions,1);
  const saved=h.call('dp_get_orders').orders[0];assert.equal(saved.phone,'3137183666');assert.equal(saved.paymentMethod,'Transferencia Nequi');assert.equal(saved.deliveryFeePending,true);assert.equal(saved.packagingFee,2000);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('don-pieros-cart-v2'))),[],'El pedido confirmado limpia el carrito guardado');
  assert.equal(await page.locator('#header-cart .cart-count').innerText(),'0');
  const whatsapp=new URL(await page.locator('.success-celebration .dp-whatsapp').getAttribute('href'));
  assert.ok(['573138367511','573185536604'].includes(whatsapp.searchParams.get('phone')));assert.ok(whatsapp.searchParams.get('text').includes(saved.id));
  await page.locator('#finish-order').click();await page.locator('#header-cart').click();await page.locator('.cart-empty').waitFor();
  await page.locator('#cart-back').click();await page.locator('[data-product]').filter({hasText:'Pizza Don Pieros'}).click();await page.locator('.option').filter({hasText:/^Mediana/}).click();await page.locator('#add-product').click();
  await page.locator('#header-cart').click();await page.locator('#go-checkout').click();assert.equal(await page.locator('[name=payment]:checked').count(),0,'El siguiente pedido tampoco reutiliza el método anterior');
  assert.deepEqual(errors,[]);console.log('OK: móvil 390/320 px, barrio bajo input, obligatorios/correctos, teléfono válido, Nequi/Bre-B, colores y pedido real local.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
