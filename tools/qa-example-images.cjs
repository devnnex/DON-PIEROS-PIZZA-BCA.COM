const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const{chromium}=require('playwright-core');const{harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness({seedMenu:true}),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];
 context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 await context.route('https://script.google.com/**',route=>{const request=route.request();if(request.method()==='GET')return route.fulfill({json:{ok:true}});const body=request.postDataJSON();return route.fulfill({json:h.call(body.action,body.payload||body,body.authToken||'')});});
 await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{const request=route.request(),url=new URL(request.url()),rpc=url.pathname.split('/').pop();let data=[];
 if(url.pathname.startsWith('/storage/v1/object/public/'))return route.fulfill({body:fs.readFileSync('images/don-pieros-logo.png'),contentType:'image/png'});
 if(url.pathname.startsWith('/storage/v1/object/')&&request.method()==='POST'){assert.equal(request.headers()['x-app-token'],'boss');data={Key:'product-images/'+rpc};}
 if(rpc==='get_current_user')data={id:'boss-id',full_name:'Jefe',role:'boss',is_active:true};if(rpc==='get_bootstrap_data')data={business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[],categories:[],items:[]};if(rpc==='get_admin_snapshot')data={requests:[],sessions:[]};if(rpc==='dp_setup_status')data=false;return route.fulfill({json:data});});
 const client=await context.newPage();await client.goto('http://127.0.0.1:4173/');await client.locator('#welcome-close').click();await client.locator('.product-card').first().waitFor();
 const checks=await client.evaluate(()=>{
  const all=window.DonPierosImages;return {own:all.resolve({image_url:'https://example.com/custom.jpg',name:'Pizza'}),example:all.resolve({name:'Limonadas'}),count:document.querySelectorAll('.example-photo-label').length};
 });assert.equal(checks.own,'https://example.com/custom.jpg');assert.match(checks.example,/limonada.webp$/);assert.equal(checks.count,51);
 for(const category of ['Pizzas especiales','Lasañas y panzerotti','Bebidas']){
  await client.locator(`[data-category="${category}"]`).click();await client.locator('#menu').scrollIntoViewIfNeeded();
  await client.evaluate(()=>Promise.all([...document.querySelectorAll('#products img')].map(image=>image.decode())));
  await client.screenshot({path:'artifacts/ejemplos-'+(category==='Bebidas'?'bebidas':category==='Pizzas especiales'?'pizzas':'especiales')+'.png',fullPage:false});
 }
 const admin=await context.newPage();await admin.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));await admin.goto('http://127.0.0.1:4173/admin.html#webmenu');await admin.locator('[data-dp-edit]').first().waitFor();await admin.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
 await admin.locator('[data-dp-edit]').first().click();assert.match(await admin.locator('#dp-image-preview').getAttribute('src'),/images\/ejemplos\//);
 await admin.locator('#dp-item-form [name=image]').setInputFiles('images/don-pieros-logo.png');await admin.locator('#dp-item-save').click();await admin.locator('#dp-item-dialog').waitFor({state:'hidden'});
 await client.reload();await client.locator('#welcome-close').click();const first=client.locator('.product-card').first();await first.locator('img').waitFor();assert.match(await first.locator('img').getAttribute('src'),/supabase.co\/storage/);assert.equal(await first.locator('.example-photo-label').count(),0);
 await first.click();assert.match(await client.locator('.detail-photo img').getAttribute('src'),/supabase.co\/storage/);assert.equal(await client.locator('.detail-photo .example-photo-label').count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('Fotos: 51 productos cubiertos, fotografías locales cargan, foto de Supabase reemplaza referencia en tarjeta y detalle: OK.');
})().catch(error=>{console.error(error);process.exit(1);});
