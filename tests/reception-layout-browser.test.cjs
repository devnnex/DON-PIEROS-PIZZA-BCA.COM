const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');

test('comandas web y de mesero: resumen arriba, acciones juntas y tiempo desplegable en escritorio y móvil',async()=>{
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-page="admin" class="admin-authenticated"><main class="admin-app"><section id="dashboard"><div id="alertsPanel"></div><div id="staffIndividualSalesGrid"></div></section><section id="service"></section></main><b id="dp-nav-count"></b><form id="loginForm"></form></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [1440,1024,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>{
   const now=new Date(Date.now()-180000).toISOString();
   const base={sequence:95,status:'nueva',version:1,createdAt:now,customerName:'Hellen Pava',phone:'3003238153',fulfillment:'delivery',address:'Puerta principal de refinería',neighborhood:'Comercio',subtotal:96000,packagingFee:4000,total:100000,deliveryFeePending:true,paymentMethod:'Bre-B',paymentValue:'🔑 @yadir31202',queuePosition:1,notes:'Salsa aparte',items:[{productId:'pizza',name:'Pizza combinada',quantity:1,unitPrice:96000,packagingSize:'Super maxi',packagingUnitFee:4000,selections:['Tamaño: Super maxi · 54 × 54 cm','Sabores (mitad y mitad): Carnes / Hawaiana']}]};
   window.fixtureOrders=[{...base,id:'DP-test-web',source:'web'},{...base,id:'DP-test-staff',sequence:96,source:'staff_walk_in',waiterName:'Laura Gómez'}];
   window.fixtureCommands=[{id:'table-comanda',table_id:'table-1',session_id:'session-1',version:1,updated_at:now,waiter_name:'Laura Gómez',notes:'Salsa aparte',accepted_at:null,table:{table_name:'Mesa 1'},items:[{id:'line-1',item_name:'Pizza combinada',quantity:1,unit_price:96000,waiter_options:{labels:['Tamaño: Super maxi']}}]}];
   window.DON_PIEROS_CONFIG={appsScriptUrl:'https://script.google.com/macros/s/fixture/exec'};
   window.DonPierosLanguage={message:v=>v?.message||String(v)};
   window.DonPierosAdmin={getUser:()=>({id:'boss',role:'boss',full_name:'Caja'}),getToken:()=> 'test',notify(){},announceWebOrders(){},setStaffIndividualCount(){},refreshOperations:async()=>{},getOperations:()=>({tables:[],sessions:[],requests:[]}),db:{rpc:()=>({abortSignal:async()=>({data:{orders:fixtureCommands}})}),channel:()=>({on(){return this;},subscribe(){return this;},send:async()=>{}}),removeChannel:async()=>{}}};
   window.fetch=async(_url,options={})=>{
    const {action=''}=options.body?JSON.parse(options.body):{};
    return Response.json({ok:true,revision:'one',orders:fixtureOrders,total:2,activeCount:2,products:[],toppings:[],payments:[],neighborhoods:[]});
   };
  });
  for(const file of ['style.css','online-admin.css','waiter-orders.css'])await page.addStyleTag({path:path.join(root,file)});
  for(const file of ['date-format.js','order-labels.js','order-details.js','packaging.js','online-admin.js','waiter-orders.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.waitForSelector('#staffIndividualSalesGrid [data-dp-order="DP-test-staff"]');
  const card=page.locator('#staffIndividualSalesGrid [data-dp-order="DP-test-staff"]');
  assert.doesNotMatch(await card.innerText(),/DP-test/);
  assert.match(await card.innerText(),/Laura Gómez/);
  assert.equal(await card.locator('.dp-card-date').evaluate(n=>getComputedStyle(n).whiteSpace),'nowrap');
  assert.equal(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,'La tarjeta no desborda.');
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  await card.screenshot({path:path.join(root,`artifacts/tarjeta-premium-${width}.png`)});
  for(const id of ['DP-test-staff','DP-test-web']){
   await page.locator(`[data-dp-order="${id}"] [data-dp-view]`).first().click();
   const dialog=page.locator('#dp-order-dialog');
   assert.equal(await dialog.locator('.order-time-disclosure').evaluate(n=>n.open),false);
   assert.equal(await dialog.locator('#dp-order-time-form').isVisible(),false);
   const layout=await dialog.evaluate(n=>{
    const summary=n.querySelector('.dp-order-summary'),actions=summary.querySelector('.dp-order-actions'),customer=summary.querySelector('.dp-order-customer'),toolbar=summary.querySelector('.dp-status-actions');
    const buttons=[...actions.querySelectorAll('button,a')].map(b=>({x:b.getBoundingClientRect().x,y:b.getBoundingClientRect().y}));
    return {overflow:n.scrollWidth>n.clientWidth+1,top:summary.getBoundingClientRect().top-n.getBoundingClientRect().top,gap:customer.getBoundingClientRect().top-toolbar.getBoundingClientRect().bottom,buttons,inside:!!actions};
   });
   assert.equal(layout.overflow,false);assert.ok(layout.top<55,'El cliente empieza arriba.');assert.equal(layout.gap,3);
   assert.equal(layout.inside,true);assert.ok(Math.abs(layout.buttons[0].y-layout.buttons[1].y)<1);assert.ok(Math.abs(layout.buttons[2].y-layout.buttons[3].y)<1);
   assert.ok(layout.buttons[0].x<layout.buttons[1].x);
   assert.equal(await dialog.locator('.dp-detail-lines ul').evaluate(n=>getComputedStyle(n).fontSize),'13px');
   assert.ok(Number(await dialog.locator('.dp-detail-lines ul').evaluate(n=>getComputedStyle(n).fontWeight))>=600);
   await dialog.locator('.order-time-disclosure > summary').click();
   assert.equal(await dialog.locator('#dp-order-time-form').isVisible(),true);
   await dialog.locator('[name="estimated_time"]').fill('25 minutos');
   await dialog.locator('.order-time-disclosure > summary').click();
   assert.equal(await dialog.locator('#dp-order-time-form').isVisible(),false);
   await dialog.locator('.order-time-disclosure > summary').click();
   assert.equal(await dialog.locator('[name="estimated_time"]').inputValue(),'25 minutos');
   await dialog.locator('.order-time-disclosure > summary').click();
   await dialog.evaluate(n=>{n.scrollTop=0;n.querySelector('.dp-dialog-card').scrollTop=0;});
   if(id==='DP-test-staff')await dialog.screenshot({path:path.join(root,`artifacts/comanda-premium-${width}.png`)});
   await dialog.locator('[data-dp-close]').click();
  }
  await page.locator('[data-dw-open-comanda="table-comanda"]').click();
  assert.equal(await page.locator('#dw-kitchen-body .order-time-disclosure').evaluate(n=>n.open),false);
  await page.locator('#dw-kitchen-body .order-time-disclosure > summary').click();
  assert.equal(await page.locator('#dw-time-form').isVisible(),true);
  assert.deepEqual(errors,[]);
  await page.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
