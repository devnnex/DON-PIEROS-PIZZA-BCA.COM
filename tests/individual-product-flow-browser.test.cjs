const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const {harness}=require('./helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..');
const instrument=source=>source.replace('  return { init };','  return { init, state, createWalkInSale, openPaymentDialog, printIndividualSale, loadWalkInDrafts, editConsumption, addManualConsumption, holdIndividualSale };').replace('document.addEventListener("DOMContentLoaded", App.init);','window.saleTest=App;');

test('venta individual: datos persistentes, domicilio con caja y retorno al catálogo; comanda con observaciones primero y subrayado',async()=>{
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1);
  if(name==='admin.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,name),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>','<link rel="stylesheet" href="/style.css"></head>'));}
  else if(name.endsWith('.css')||name==='images/don-pieros-logo.png'){res.setHeader('Content-Type',name.endsWith('.png')?'image/png':'text/css');res.end(fs.readFileSync(path.join(root,name)));}
  else{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [1440,390]){
  const backend=harness(),context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  await page.exposeFunction('backendCall',(action,payload)=>backend.call(action,payload));
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
  for(const file of ['individual-sales-sync.js','sales-shift.js','order-labels.js','order-details.js','packaging.js','thermal-print.js','vendor/jspdf.umd.min.js'])await page.addScriptTag({path:path.join(root,file)});
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
   window.DON_PIEROS_CONFIG={appsScriptUrl:'https://script.google.com/macros/s/fixture/exec'};
   window.fetch=async(_url,options={})=>{
    const {action='',payload={}}=options.body?JSON.parse(options.body):{};
    if(action==='dp_save_individual_sale')return new Response(JSON.stringify(await backendCall(action,payload)),{status:200});
    return new Response(JSON.stringify(action.includes('catalog')?{ok:true,...testCatalog}:{ok:true,items:[],orders:[],shifts:[],everInitialized:true}),{status:200});
   };
  });
  await page.addStyleTag({path:path.join(root,'waiter-orders.css')});
  await page.addScriptTag({path:path.join(root,'waiter-orders.js')});
  await page.evaluate(()=>saleTest.createWalkInSale());
  assert.equal(await page.locator('#paymentDialog').evaluate(node=>node.open),false,'Nueva venta abre la carta directamente.');
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
  assert.equal(await page.locator('#dw-product-address').isVisible(),true,'Domicilio muestra la dirección debajo de Entrega.');
  await page.locator('#dw-product-address').fill('Calle 10 # 20-30');
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
  assert.equal(await page.locator('#dw-product-address').inputValue(),'Calle 10 # 20-30','La dirección se conserva al agregar productos a la misma venta.');
  assert.match(await page.locator('#dw-product-price').innerText(),/4\.000/,'La bebida no cobra caja.');
  assert.equal(await page.locator('#dw-product-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  await page.locator('#dw-product-dialog').screenshot({path:path.join(root,`artifacts/venta-producto-${width}.png`)});
  await page.locator('#dw-add-product').click();
  await page.waitForFunction(()=>!document.querySelector('#dw-product-dialog').open);
  await page.locator('#dw-catalog-dialog [data-dw-close]').click();
  assert.equal(await page.locator('#paymentDialog').evaluate(node=>node.open),false,'Cerrar la carta no abre el cobro.');
  await page.evaluate(()=>saleTest.openPaymentDialog('walk-in-test'));
  assert.equal(await page.locator('#individualComandaFields,[name="individual_customer"],[name="individual_estimated_time"],[name="individual_observations"]').count(),0,'El cobro no repite los datos del producto.');
  assert.equal(await page.evaluate(()=>DonPierosAdmin.getIndividualDetails('walk-in-test').customerName),'Laura');
  assert.equal(await page.locator('#paymentSaleLines>div').count(),2);
  const saved=await page.evaluate(()=>{
   saleTest.loadWalkInDrafts();
   const session=saleTest.state.sessions.find(row=>row.id==='walk-in-test');
   return {count:session.session_items.length,total:session.session_items.reduce((sum,line)=>sum+line.unit_price*line.quantity,0),info:DonPierosOrderDetails.readTime(session.order_notes),packing:DonPierosPackaging.read(session.session_items[0].notes),address:session.delivery_address};
  });
  assert.equal(saved.count,2);assert.equal(saved.total,26000);assert.equal(saved.info.time,'25 minutos');assert.equal(saved.packing.fulfillment,'delivery');assert.equal(saved.packing.fee,2000);assert.equal(saved.address,'Calle 10 # 20-30');
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
  await page.evaluate(()=>{
   const session=saleTest.state.sessions[0];session.payer_name='lily silva';session.session_items=[{...session.session_items[0],item_name:'Pizza combinada',unit_price:100000,
    notes:DonPierosPackaging.note('Tamaño: Super maxi · 54 × 54 cm\nSabores (mitad y mitad): Don Pieros / Hawaiana','supermaxi','delivery'),waiter_options:{labels:['Tamaño: Super maxi · 54 × 54 cm','Sabores (mitad y mitad): Don Pieros / Hawaiana'],fulfillment:'delivery'}}];
   localStorage.setItem('don_pieros_order_paper',String(innerWidth===390?58:80));
   saleTest.printIndividualSale();
  });
  await printPage.waitForSelector('.flavor-options');
  const compact=await printPage.evaluate(()=>({text:document.body.innerText,flavors:document.querySelector('article>strong').nextElementSibling.className,logo:document.querySelector('header img').getAttribute('src'),size:document.querySelector('.size-option').textContent}));
  assert.equal(compact.flavors,'flavor-options');assert.match(compact.text,/LILY SILVA/);assert.match(compact.size,/54 × 54 cm/);
  assert.match(compact.logo,/don-pieros-logo.png/);assert.doesNotMatch(compact.text,/c\/u|Total de la línea|Caja Super maxi:/);
  assert.equal((compact.text.match(/Productos:/g)||[]).length,1);assert.match(compact.text,/96\.000/);assert.match(compact.text,/4\.000/);
  const compactPdf=await page.evaluate(async paperWidth=>{const result=await DonPierosThermal.createPdf(printTarget,paperWidth);return {data:result.pdf.output('datauristring').split(',')[1],width:result.width};},paperWidth);
  assert.equal(compactPdf.width,paperWidth);fs.writeFileSync(path.join(root,`artifacts/venta-combinada-${paperWidth}mm.pdf`),Buffer.from(compactPdf.data,'base64'));
  assert.equal(await printPage.evaluate(()=>document.body.scrollWidth<=Math.ceil(document.body.getBoundingClientRect().width)+1),true);
  await printPage.locator('body').screenshot({path:path.join(root,`artifacts/venta-combinada-${paperWidth}mm.png`)});
  await page.evaluate(()=>DonPierosWaiter.chooseIndividualProduct('walk-in-test'));
  await page.locator('[data-dw-product="drink"]').click();
  await page.locator('#dw-fulfillment').selectOption('pickup');
  assert.equal(await page.locator('#dw-send-print').isVisible(),true);
  const actions=await page.locator('.dw-individual-actions').evaluate(node=>({overflow:node.scrollWidth>node.clientWidth+1,count:node.querySelectorAll('button').length}));
  assert.equal(actions.overflow,false);assert.equal(actions.count,2);
  await page.locator('#dw-send-print').click();
  await page.waitForFunction(()=>!document.querySelector('#dw-catalog-dialog').open);
  assert.equal(await page.locator('#paymentDialog').evaluate(node=>node.open),false,'Enviar e imprimir no abre el formulario de cobro.');
  const shared=backend.call('dp_get_orders',{includeIndividuals:true}).individualSales;
  assert.equal(shared.length,1);assert.equal(shared[0].session.session_items.length,2,'Enviar agrega el producto una sola vez y guarda la comanda compartida.');
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
