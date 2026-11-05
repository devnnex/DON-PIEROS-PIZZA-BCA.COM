const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core'),{harness}=require('./helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..');
test('tarifas reales en index, edición de pedidos, caja manual y selector usado por administración y meseros',async()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),errors=[];
 const cases=[['Porción hawaiana',500,'Porción'],['Lasaña marinera',1500,'Lasaña'],['Panzerotti hawaiano',1500,'Panzerotti'],['Pizzeta hawaiana',2000,'Pizzeta']].map(([name,fee,size])=>({product:catalog.products.find(p=>p.name===name),fee,size}));
 const receipt=h.call('createOrder',{order:h.order(cases[0].product,{items:cases.map(({product})=>({productId:product.id,quantity:2,unitPrice:product.price,selectionIds:{}}))})});assert.equal(receipt.ok,true,receipt.error);
 const staffOrder=h.order(cases[0].product,{customerName:'Cliente del mesero',notes:'Comanda enviada desde el salón',items:[{productId:cases[0].product.id,quantity:1,unitPrice:cases[0].product.price,selectionIds:{},notes:''}]});
 const staffReceipt=h.call('dp_create_staff_order',{order:staffOrder},'waiter');assert.equal(staffReceipt.ok,true,staffReceipt.error);
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:1000},serviceWorkers:'block'});
  await context.route('https://**/*',route=>route.abort());
  await context.routeWebSocket('wss://**/*',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{ok:true}});
   const body=route.request().postDataJSON();return route.fulfill({json:body.action==='bootstrap'?{ok:true}:h.call(body.action,body.payload||body,body.authToken||'boss')});
  });
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{
   const rpc=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({json:rpc==='get_current_user'?{id:'boss-id',full_name:'Jefe',role:'boss',is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_setup_status'?false:[]});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);await page.locator('#welcome-close').click();
  const amount=async locator=>Number((await locator.innerText()).replace(/\D/g,''));
  for(const {product,fee} of cases){
   await page.locator(`[data-product="${product.id}"]`).click();
   assert.equal(await amount(page.locator('#detail-total')),product.price+fee);
   await page.locator('[data-quantity="detail"] [data-qty="plus"]').click();assert.equal(await amount(page.locator('#detail-total')),2*(product.price+fee));
   await page.locator('#add-product').click();
  }
  await page.locator('#header-cart').click();await page.locator('#go-checkout').click();
  const subtotal=cases.reduce((sum,{product})=>sum+2*product.price,0),fees=cases.reduce((sum,{fee})=>sum+2*fee,0);
  for(const fulfillment of ['delivery','dinein','pickup']){
   await page.locator('label').filter({has:page.locator(`input[name="fulfillment"][value="${fulfillment}"]`)}).click();
   assert.equal(await amount(page.locator('#checkout-total')),subtotal+(fulfillment==='dinein'?0:fees));
   assert.equal(await page.locator('.summary-packaging').count(),fulfillment==='dinein'?0:1);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const admin=await context.newPage();admin.on('pageerror',error=>errors.push(error.message));
  await admin.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));await admin.setViewportSize({width:1440,height:1000});
  await admin.goto(origin+'/admin.html#dashboard');await admin.locator(`[data-dp-order="${receipt.orderId}"]`).first().waitFor();await admin.locator(`#staffIndividualSalesGrid [data-dp-order="${staffReceipt.orderId}"]`).waitFor();await admin.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  assert.equal(await admin.locator(`#dp-dashboard-order-list [data-dp-order="${staffReceipt.orderId}"]`).count(),0,'La comanda del mesero no se mezcla con pedidos de la página.');
  assert.equal(await admin.locator('#staffIndividualSalesGrid').isVisible(),true);
  assert.match(await admin.locator(`#staffIndividualSalesGrid [data-dp-order="${staffReceipt.orderId}"]`).innerText(),/Venta individual · Mesero/);
  assert.equal(await admin.locator('#individualSalesCount').innerText(),'1','El contador suma la comanda del mesero.');
  await admin.locator(`[data-dp-order="${receipt.orderId}"] [data-dp-view]`).first().click();await admin.locator('#dp-edit-prices').click();
  for(const [index,{size}] of cases.entries())assert.equal(await admin.locator(`[name="box_${index}"]`).inputValue(),size,'Editar conserva el empaque ya cobrado.');
  await admin.keyboard.press('Escape');await admin.locator('#newWalkInSale').click();
  for(const {product,fee} of cases){
   await admin.locator(`[data-dw-product="${product.id}"]`).click();
   for(const fulfillment of ['pickup','delivery','dinein']){
    await admin.locator('#dw-fulfillment').selectOption(fulfillment);assert.equal(await amount(admin.locator('#dw-product-price')),product.price+(fulfillment==='dinein'?0:fee));
   }
   await admin.locator('#dw-product-dialog [data-dw-close]').click();
   const manual=await admin.evaluate(({product})=>{
    const form=document.querySelector('#consumptionForm');form.item_name.value=product.name;form.quantity.value=2;form.elements.namedItem('packing_mode').value='delivery';DonPierosPackaging.update(form);
    return DonPierosPackaging.draft(form,product.name,product.price,'Salsa aparte');
   },{product});assert.equal(manual.unitPrice,product.price+fee);
  }
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
