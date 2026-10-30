const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright-core'),{harness}=require('../tests/helpers/don-pieros-gas.cjs');
(async()=>{
 const h=harness({seedMenu:true}),errors=[],browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>{const req=route.request();if(req.method()==='GET')return route.fulfill({json:{ok:true}});const body=req.postDataJSON();return route.fulfill({json:body.action==='bootstrap'?{ok:true}:h.call(body.action,body.payload||body,body.authToken||'')});});
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{const rpc=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({json:rpc==='get_current_user'?{id:'boss-id',full_name:'Jefe',role:'boss',is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_setup_status'?false:[]});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/');await page.locator('#welcome-close').click();
  await page.locator('[data-product]').filter({hasText:'Pizza Don Pieros'}).click();
  await page.locator('.option').filter({hasText:/^Maxi/}).click();
  assert.match(await page.locator('#detail-total').innerText(),/82.000/);assert.match(await page.locator('#detail-packaging').innerText(),/4.000/);
  await page.locator('#add-product').click();await page.locator('#header-cart').click();await page.locator('#go-checkout').click();
  assert.match(await page.locator('#checkout-total').innerText(),/82.000/);
  await page.locator('label').filter({has:page.locator('[name=fulfillment][value=dinein]')}).click();assert.match(await page.locator('#checkout-total').innerText(),/78.000/);
  assert.equal(await page.locator('.summary').getByText('Cajas para llevar').count(),0);
  await page.locator('label').filter({has:page.locator('[name=fulfillment][value=delivery]')}).click();assert.match(await page.locator('#checkout-total').innerText(),/82.000/);
  await page.locator('label').filter({has:page.locator('[name=fulfillment][value=pickup]')}).click();assert.match(await page.locator('#checkout-total').innerText(),/82.000/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'artifacts/checkout-cajas-movil.png'});
  // Exercise the actual admin form and draft functions while keeping every write local.
  const source=fs.readFileSync('app.js','utf8');assert.ok(source.includes('return { init };'));
  await context.route('**/app.js?*',route=>route.fulfill({contentType:'text/javascript',body:source.replace('return { init };','window.packagingQA={state,currentConsumptionDraft,thermalReceiptHtml};return { init };')}));
  const admin=await context.newPage();admin.on('pageerror',error=>errors.push(error.message));
  await admin.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));
  await admin.goto('http://127.0.0.1:4173/admin.html');await admin.waitForFunction(()=>window.packagingQA).catch(error=>{throw Error(error.message+'; '+errors.join('; '));});
  const draft=await admin.evaluate(()=>{
   const form=document.querySelector('#consumptionForm');form.item_name.value='Pizza Don Pieros';form.quantity.value='2';form.unit_price.value='$78.000';form.notes.value='Sin cebolla';
   form.elements.namedItem('packing_mode').value='takeaway';form.elements.namedItem('packing_size').value='maxi';window.DonPierosPackaging.update(form);
   return packagingQA.currentConsumptionDraft(form);
  });
  assert.equal(draft.unitPrice,82000);assert.match(draft.notes,/Caja Maxi: \$4.000/);
  const receipt=await admin.evaluate(draft=>{
   const invoice={number:'TEST-1',createdAt:new Date().toISOString(),totals:{subtotal:164000,total:164000},items:[{item_name:draft.itemName,quantity:2,unit_price:draft.unitPrice,notes:draft.notes}],payments:[]};
   return packagingQA.thermalReceiptHtml({id:'test',table_id:null,payer_name:'Prueba',session_items:[]},invoice);
  },draft);
  assert.match(receipt,/Caja Maxi/);assert.match(receipt,/Recoger en local/);assert.match(receipt,/Devnex Soluciones Tecnologicas/);
  const print=await context.newPage();await print.setContent(receipt);await print.addScriptTag({path:'thermal-print.js'});
  const short=await print.evaluate(()=>DonPierosThermal.prepare(window,80));
  await print.emulateMedia({media:'print'});
  const pdf=await print.pdf({preferCSSPageSize:true,displayHeaderFooter:false,path:'artifacts/factura-cajas-80mm.pdf'});
  const pages=pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[];assert.equal(pages.length,1);
  const paper=pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(paper);
  assert.ok(Math.abs(Number(paper[2])-short.height*72/25.4)<2);
  assert.ok(short.height<230,'Una factura corta no usa la altura de la ventana');
  await print.evaluate(()=>{const parent=document.querySelector('.items');for(let i=0;i<30;i++)parent.append(parent.firstElementChild.cloneNode(true));});
  const long=await print.evaluate(()=>DonPierosThermal.prepare(window,80));assert.ok(long.height>short.height+100,'La altura crece con los productos');
  const longPdf=await print.pdf({preferCSSPageSize:true,displayHeaderFooter:false,path:'artifacts/factura-larga-80mm.pdf'});
  assert.equal((longPdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'El pedido largo conserva todos los productos en una tira continua');
  console.log(`OK: cliente 3 modalidades, caja Maxi y edición admin, factura con caja separada, PDF corto ${short.height} mm / largo ${long.height} mm.`);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
