const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const instrument=source=>source.replace('  return { init };','  return { init, state, openPaymentDialog, printIndividualSale, loadWalkInDrafts, editConsumption, addManualConsumption, holdIndividualSale };').replace('document.addEventListener("DOMContentLoaded", App.init);','window.saleTest=App;');

test('venta individual: datos persistentes, domicilio con caja y retorno al catálogo; comanda con observaciones primero y subrayado',async()=>{
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1);
  if(name==='admin.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,name),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>','<link rel="stylesheet" href="/style.css"></head>'));}
  else if(name.endsWith('.css')){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(root,name)));}
  else{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
  for(const file of ['sales-shift.js','order-labels.js','order-details.js','packaging.js','thermal-print.js','vendor/jspdf.umd.min.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.addScriptTag({content:instrument(fs.readFileSync(path.join(root,'app.js'),'utf8'))});
  await page.evaluate(()=>{
   document.body.classList.add('admin-authenticated');
   const now=new Date().toISOString();
   Object.assign(saleTest.state,{page:'admin',currentUser:{id:'boss',role:'boss',full_name:'Caja'},authToken:'test',business:{business_name:'Prueba'},sessions:[{id:'walk-in-test',sale_channel:'walk_in',local_only:true,status:'open',payer_name:'Cliente individual',session_items:[],opened_at:now,created_at:now}],activeAdminSection:'dashboard'});
   window.testCatalog={products:[{id:'pizza',name:'Pizza Mini',category:'Pizzas',price:20000,available:true,modifiers:[]},{id:'drink',name:'Gaseosa',category:'Bebidas',price:4000,available:true,modifiers:[]}],toppings:[]};
   DonPierosAdmin.db={rpc:()=>({abortSignal:async()=>({data:{orders:[]}})})};
   DonPierosAdmin.refreshOperations=async()=>{};
   window.DonPierosPerformance={read:key=>key==='catalog'?testCatalog:null};
   window.DonPierosImages={resolve:()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'};
   window.DonPierosLanguage={message:error=>error?.message||String(error)};
   window.DonPierosDates={dateTime:value=>String(value)};
   window.fetch=async(_url,options={})=>{
    const action=options.body?JSON.parse(options.body).action:'';
    return new Response(JSON.stringify(action.includes('catalog')?{ok:true,...testCatalog}:{ok:true,items:[],orders:[],shifts:[],everInitialized:true}),{status:200});
   };
  });
  await page.addStyleTag({path:path.join(root,'waiter-orders.css')});
  await page.addScriptTag({path:path.join(root,'waiter-orders.js')});
  await page.evaluate(()=>DonPierosWaiter.chooseIndividualProduct('walk-in-test'));
  await page.locator('[data-dw-product="pizza"]').click();
  await page.locator('#dw-product-customer').fill('Laura');
  await page.locator('#dw-product-time').fill('25 minutos');
  await page.locator('#dw-product-observations').fill('Entregar en portería.\nSalsa aparte.');
  assert.equal(await page.locator('#dw-product-observations').evaluate(node=>getComputedStyle(node).textDecorationLine),'none','El subrayado se reserva para la impresión.');
  if(width>600){
   const alignment=await page.evaluate(()=>{const name=document.querySelector('#dw-product-customer').getBoundingClientRect(),time=document.querySelector('#dw-product-time').getBoundingClientRect();return {top:Math.abs(name.top-time.top),height:Math.abs(name.height-time.height)};});
   assert.ok(alignment.top<1,'Nombre y tiempo comienzan a la misma altura.');assert.ok(alignment.height<1,'Los inputs tienen la misma altura.');
  }
  await page.locator('#dw-line-notes').fill('Bien dorada');
  await page.locator('#dw-add-product').click();
  assert.equal(await page.locator('#dw-product-dialog').evaluate(node=>node.open),true,'La entrega es obligatoria.');
  await page.locator('#dw-fulfillment').selectOption('delivery');
  assert.match(await page.locator('#dw-packaging-summary').innerText(),/2\.000/);
  assert.match(await page.locator('#dw-product-price').innerText(),/22\.000/);
  await page.locator('#dw-add-product').click();
  await page.waitForFunction(()=>!document.querySelector('#dw-product-dialog').open);
  assert.equal(await page.locator('#dw-catalog-dialog').evaluate(node=>node.open),true);
  assert.equal(await page.locator('#paymentDialog').evaluate(node=>node.open),false);
  await page.locator('[data-dw-product="drink"]').click();
  assert.equal(await page.locator('#dw-product-customer').inputValue(),'Laura');
  assert.equal(await page.locator('#dw-product-time').inputValue(),'25 minutos');
  assert.equal(await page.locator('#dw-product-observations').inputValue(),'Entregar en portería.\nSalsa aparte.');
  await page.locator('#dw-fulfillment').selectOption('delivery');
  assert.match(await page.locator('#dw-product-price').innerText(),/4\.000/,'La bebida no cobra caja.');
  assert.equal(await page.locator('#dw-product-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  await page.locator('#dw-product-dialog').screenshot({path:path.join(root,`artifacts/venta-producto-${width}.png`)});
  await page.locator('#dw-add-product').click();
  await page.waitForFunction(()=>!document.querySelector('#dw-product-dialog').open);
  await page.locator('#dw-catalog-dialog [data-dw-close]').click();
  await page.waitForFunction(()=>document.querySelector('#paymentDialog').open);
  assert.equal(await page.locator('#individualComandaFields,[name="individual_customer"],[name="individual_estimated_time"],[name="individual_observations"]').count(),0,'El cobro no repite los datos del producto.');
  assert.equal(await page.evaluate(()=>DonPierosAdmin.getIndividualDetails('walk-in-test').customerName),'Laura');
  assert.equal(await page.locator('#paymentSaleLines>div').count(),2);
  const saved=await page.evaluate(()=>{
   saleTest.loadWalkInDrafts();
   const session=saleTest.state.sessions.find(row=>row.id==='walk-in-test');
   return {count:session.session_items.length,total:session.session_items.reduce((sum,line)=>sum+line.unit_price*line.quantity,0),info:DonPierosOrderDetails.readTime(session.order_notes),packing:DonPierosPackaging.read(session.session_items[0].notes)};
  });
  assert.equal(saved.count,2);assert.equal(saved.total,26000);assert.equal(saved.info.time,'25 minutos');assert.equal(saved.packing.fulfillment,'delivery');assert.equal(saved.packing.fee,2000);
  await page.evaluate(()=>{
   window.printTarget=window.open('','_blank');window.open=()=>printTarget;
   DonPierosThermal.print=async target=>{window.printReady=target.document.body.innerHTML;};
   saleTest.printIndividualSale();
  });
  const printPage=context.pages().find(other=>other!==page);
  await printPage.waitForSelector('.notes');
  const printCheck=await printPage.evaluate(()=>({
   before:!!(document.querySelector('.notes').compareDocumentPosition(document.querySelector('article'))&Node.DOCUMENT_POSITION_FOLLOWING),
   notes:document.querySelector('.notes').textContent,
   delivery:[...document.querySelectorAll('article .comanda-underline')].some(node=>node.textContent==='Domicilio'),
   styles:[...document.querySelectorAll('.notes .comanda-underline,article .comanda-underline')].map(node=>{const s=getComputedStyle(node);return {color:s.color,line:s.textDecorationLine,green:s.textDecorationColor,bold:Number(s.fontWeight)};})
  }));
  assert.equal(printCheck.before,true);assert.match(printCheck.notes,/Entregar en portería/);assert.equal(printCheck.delivery,true);
  assert.ok(printCheck.styles.length>=3);for(const style of printCheck.styles){assert.equal(style.color,'rgb(0, 0, 0)');assert.equal(style.line,'underline');assert.equal(style.green,'rgb(33, 134, 83)');assert.ok(style.bold>=800);}
  const paperWidth=width===390?58:80;
  const pdf=await page.evaluate(async paperWidth=>{
   const {pdf,width,height}=await DonPierosThermal.createPdf(printTarget,paperWidth);
   return {data:pdf.output('datauristring').split(',')[1],width,height};
  },paperWidth);
  const bytes=Buffer.from(pdf.data,'base64');assert.ok(bytes.length>1000);assert.equal(pdf.width,paperWidth);
  const mediaBox=bytes.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(mediaBox);assert.ok(Math.abs(Number(mediaBox[1])-paperWidth*72/25.4)<2);
  fs.writeFileSync(path.join(root,`artifacts/venta-comanda-${paperWidth}mm.pdf`),bytes);
  await printPage.locator('body').screenshot({path:path.join(root,`artifacts/venta-comanda-${width}.png`)});
  await page.evaluate(()=>saleTest.editConsumption('walk-in-test',saleTest.state.sessions[0].session_items[0].id));
  assert.equal(await page.locator('#consumptionForm [name="packing_mode"]').inputValue(),'delivery');
  assert.doesNotMatch(await page.locator('#consumptionForm [name="notes"]').inputValue(),/Domicilio|Caja/,'Las notas editables no repiten la entrega.');
  await page.locator('#consumptionForm [name="packing_mode"]').selectOption('local');
  const edited=await page.evaluate(async()=>{
   await saleTest.addManualConsumption(document.querySelector('#consumptionForm'),{silent:true,openPaymentAfter:false});
   const session=saleTest.state.sessions[0],line=session.session_items[0];
   return {packing:DonPierosPackaging.read(line.notes),fulfillment:line.waiter_options.fulfillment,total:session.session_items.reduce((sum,line)=>sum+line.quantity*line.unit_price,0)};
  });
  assert.equal(edited.packing.fulfillment,'dinein');assert.equal(edited.packing.fee,0);assert.equal(edited.fulfillment,'dinein');assert.equal(edited.total,24000,'Cambiar a local retira la caja sin alterar la bebida.');
  assert.equal(await page.evaluate(()=>saleTest.holdIndividualSale()),true,'Guardar pendiente usa los datos del producto sin depender de inputs eliminados.');
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
