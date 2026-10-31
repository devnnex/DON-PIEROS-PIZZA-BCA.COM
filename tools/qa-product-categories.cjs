const assert=require('node:assert/strict'),{chromium}=require('playwright-core');
const {harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness({seedMenu:true}),errors=[];
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>{
   const req=route.request();if(req.method()==='GET')return route.fulfill({json:{ok:true}});
   const body=req.postDataJSON();return route.fulfill({json:h.call(body.action,body.payload||body,body.authToken||'')});
  });
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{
   const rpc=new URL(route.request().url()).pathname.split('/').pop();
   return route.fulfill({json:rpc==='get_current_user'?{id:'boss-id',full_name:'Jefe',role:'boss',is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_setup_status'?false:[]});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/admin.html#webmenu');await page.locator('[data-dp-edit]').first().waitFor();
  await page.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  await page.locator('#dp-add-item').click();const select=page.locator('#dp-item-form select[name=category]');
  assert.equal(await page.locator('#dp-new-category').isVisible(),false);
  assert.ok((await select.locator('option').allTextContents()).includes('Pizzas sencillas'));
  await select.selectOption('__other__');await page.locator('#dp-item-form [name=new_category]').fill('Postres de la casa');
  await page.locator('#dp-item-form [name=name]').fill('Postre de prueba');await page.locator('#dp-item-form [name=price]').fill('7500');
  const saved=page.waitForResponse(response=>response.request().method()==='POST'&&response.request().postDataJSON()?.action==='dp_save_catalog');
  await page.locator('#dp-item-save').click();assert.equal((await (await saved).json()).ok,true);
  assert.equal(h.call('dp_get_catalog').products.find(p=>p.name==='Postre de prueba').category,'Postres de la casa');
  await page.locator('#dp-add-item').click();await select.selectOption('Postres de la casa');assert.equal(await page.locator('#dp-new-category').isVisible(),false);
  await page.screenshot({path:'artifacts/categorias-select.png'});
  await select.selectOption('__other__');await page.locator('#dp-item-form [name=new_category]').fill('  postres DE la casa  ');
  await page.locator('#dp-item-form [name=name]').fill('Segundo postre');
  const second=page.waitForResponse(response=>response.request().method()==='POST'&&response.request().postDataJSON()?.action==='dp_save_catalog');
  await page.locator('#dp-item-save').click();assert.equal((await (await second).json()).ok,true);
  assert.equal(h.call('dp_get_catalog').products.find(p=>p.name==='Segundo postre').category,'Postres de la casa');
  assert.deepEqual(errors,[]);console.log('OK: categorías existentes, Otra categoría, guardado, reutilización y nombres sin duplicar por mayúsculas.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
