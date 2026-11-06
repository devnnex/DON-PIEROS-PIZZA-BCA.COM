const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
test('mesa usa entrega local; sin mesa exige selección y envía la dirección escrita; todos los formatos imprimen dirección completa',async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body data-page="admin"><div id="alertsPanel"></div><section id="service"></section></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>{
   window.fixture={role:'waiter',sent:null};
   window.DonPierosAdmin={getUser:()=>({id:'waiter',role:fixture.role}),getToken:()=> 'test',getOperations:()=>({tables:[{id:'t',table_name:'Mesa 1'}],sessions:[]}),notify:()=>{},refreshOperations:async()=>{},createStaffOrder:async payload=>{fixture.sent=payload;return {orderId:'DP-test',total:12000};},db:{rpc:()=>({abortSignal:async()=>({data:{orders:[]}})})}};
   window.DonPierosLanguage={message:error=>error.message};window.DonPierosDates={dateTime:String};
   window.DonPierosImages={resolve:()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'};
   window.fixtureCatalog={products:[{id:'pizza',name:'Pizza',category:'Pizzas',price:20000,available:true,modifiers:[]}],toppings:[]};
   window.DonPierosPerformance={read:()=>fixtureCatalog};
   window.DON_PIEROS_CONFIG={appsScriptUrl:'/catalog'};
   window.fetch=async()=>new Response(JSON.stringify({ok:true,...fixtureCatalog}));
  });
  for(const file of ['order-details.js','packaging.js','order-labels.js','waiter-orders.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.locator('[data-dw-table="t"]').click();await page.locator('[data-dw-custom]').click();
  assert.equal(await page.locator('#dw-fulfillment').inputValue(),'dinein');
  await page.locator('#dw-product-dialog [data-dw-close]').click();await page.locator('[data-dw-home]').click();
  await page.locator('[data-dw-individual]').click();await page.locator('[data-dw-custom]').click();
  assert.equal(await page.locator('#dw-fulfillment').inputValue(),'');
  await page.locator('#dw-product-customer').fill('Laura');await page.locator('#dw-custom-name').fill('Postre');await page.locator('#dw-custom-price').fill('12000');
  await page.locator('#dw-add-product').click();assert.equal(await page.locator('#dw-product-dialog').evaluate(node=>node.open),true);
  await page.locator('#dw-fulfillment').selectOption('delivery');await page.locator('#dw-add-product').click();
  assert.equal(await page.locator('#dw-product-dialog').evaluate(node=>node.open),true,'El domicilio exige dirección.');
  const address='Carrera 10 # 20-30, barrio Centro\nTorre B, apartamento 402. Portería <principal> & timbre 4';
  await page.locator('#dw-product-address').fill(address);await page.locator('#dw-add-product').click();
  await page.locator('[data-dw-review]').click();await page.locator('#dw-send-order').click();
  await page.waitForFunction(()=>fixture.sent!==null);
  const sent=await page.evaluate(()=>fixture.sent);assert.equal(sent.address,address);assert.equal(sent.items[0].fulfillment,'delivery');
  await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  await page.evaluate(()=>{fixture.role='boss';});
  await page.evaluate(()=>DonPierosWaiter.startTableOrder('t'));await page.locator('[data-dw-custom]').last().click();
  assert.equal(await page.locator('#dw-fulfillment').inputValue(),'dinein','Agregar consumo desde caja también reconoce la mesa.');
  await page.locator('#dw-fulfillment').selectOption('delivery');await page.locator('#dw-product-address').fill(address);
  await page.locator('#dw-custom-name').fill('Postre');await page.locator('#dw-custom-price').fill('12000');await page.locator('#dw-add-product').click();
  await page.locator('[data-dw-edit-line]').click();
  assert.equal(await page.locator('#dw-fulfillment').inputValue(),'delivery','Editar conserva la entrega elegida.');
  assert.equal(await page.locator('#dw-product-address').inputValue(),address,'Editar conserva la dirección por producto.');
  await page.locator('#dw-product-dialog [data-dw-close]').click();await page.locator('#dw-review-dialog [data-dw-close]').click();
  if(await page.locator('#dw-catalog-dialog').evaluate(node=>node.open))await page.locator('#dw-catalog-dialog [data-dw-close]').click();
  await page.waitForFunction(()=>!document.querySelector('.dw-dialog[open]'));
  assert.equal(await page.evaluate(()=>DonPierosWaiter.chooseWebOrderProduct({fulfillment:'delivery',title:'Pedido web',onAdd:async()=>{},onClose:()=>{}})),true);
  await page.locator('#dw-catalog-dialog [data-dw-product="pizza"]').click();
  assert.equal(await page.locator('#dw-fulfillment').inputValue(),'','Agregar a un pedido web también exige elegir la entrega.');
  const layouts=await page.evaluate(address=>{
   const samples=[
    {selector:'article',delivery:{delivery_address:address},items:[{}]},
    {selector:'.kitchen-item',delivery:{address,neighborhood:'Centro'},items:[{}]},
    {selector:'article',delivery:{},items:[{waiter_options:{address,fulfillment:'delivery'}}]},
    {selector:'article',delivery:{},items:[{waiter_options:{address,fulfillment:'delivery'}},{waiter_options:{address:'Calle 2, casa 3',fulfillment:'delivery'}}]}
   ];
   return samples.map(sample=>{
    const doc=document.implementation.createHTMLDocument('Comanda');doc.body.innerHTML='<header>Comanda</header>'+sample.items.map(()=>'<article class="kitchen-item"><strong>Producto</strong></article>').join('');
    DonPierosOrderDetails.prepareComanda(doc,sample.selector,sample.items,'',sample.delivery);
    return {addresses:[...doc.querySelectorAll('.delivery-address')].map(node=>node.textContent),unsafe:doc.querySelector('principal')!==null};
   });
  },address);
  for(const layout of layouts){assert.ok(layout.addresses.some(text=>text.includes(address)));assert.equal(layout.unsafe,false);}
  assert.match(layouts[1].addresses[0],/Barrio: Centro/);assert.equal(layouts[3].addresses.length,2);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
