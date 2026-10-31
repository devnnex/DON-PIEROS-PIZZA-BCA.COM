const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
const {harness}=require('../tests/helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),product=catalog.products[0],group=product.modifiers[0];
 const size=catalog.toppings.find(option=>option.kind===group.source&&option.name.startsWith('Super maxi'));
 const create=(name)=>h.call('createOrder',{order:h.order(product,{customerName:name,phone:'3102241444',notes:'Separar salsa de ajo',items:[{productId:product.id,quantity:2,unitPrice:product.price+size.price,selectionIds:{[group.id]:[size.id]}}]})});
 const oldest=create('Ángela López');assert.equal(oldest.ok,true);
 for(let i=0;i<104;i++)assert.equal(create('Cliente '+i).ok,true);
 const table={id:'10000000-0000-4000-8000-000000000001',table_number:7,table_name:'Mesa 7',is_active:true};
 let requests=[],reads=[];const errors=[];
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   localStorage.setItem('don_pieros_admin_token','boss');localStorage.setItem('waiter_alarm_enabled','0');
   window.qaNoticeExpiry=[];const original=window.setTimeout;
   window.setTimeout=function(fn,delay,...args){if(delay===60000&&String(fn).includes('dismiss(key)'))window.qaNoticeExpiry.push(fn);return original(fn,delay,...args);};
  });
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{ok:true}});
   const body=route.request().postDataJSON();reads.push(body);
   return route.fulfill({json:body.action==='bootstrap'?{ok:true}:h.call(body.action,body.payload||body,body.authToken||'')});
  });
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{
   const rpc=new URL(route.request().url()).pathname.split('/').pop();let data=[];
   if(rpc==='get_current_user')data={id:'boss-id',full_name:'Jefe',role:'boss',is_active:true};
   if(rpc==='get_bootstrap_data')data={business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[table],categories:[],items:[]};
   if(rpc==='get_admin_snapshot')data={requests,sessions:[]};
   if(rpc==='dp_setup_status')data=false;
   if(rpc==='acknowledge_service_requests'){
    const ids=route.request().postDataJSON().ids;
    requests=requests.map(request=>ids.includes(request.id)?{...request,status:'acknowledged',acknowledged_at:new Date().toISOString()}:request);
    data=requests.filter(request=>ids.includes(request.id));
   }
   return route.fulfill({json:data});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/admin.html#dashboard');
  await page.locator('#dp-dashboard-order-list [data-dp-order]').first().waitFor();
  await page.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  const search=page.locator('[data-dp-search="dashboard"]');
  await search.fill('angela super maxi');
  await page.locator(`#dp-dashboard-order-list [data-dp-order="${oldest.orderId}"]`).waitFor();
  assert.equal(await page.locator('#dp-dashboard-order-list [data-dp-order]').count(),1);
  assert.ok(reads.some(read=>read.payload?.offset===100),'La búsqueda encuentra pedidos fuera de la primera página.');
  assert.equal(await search.evaluate(input=>input===document.activeElement),true,'Buscar no reemplaza el campo enfocado.');
  await page.locator('#dp-dashboard-order-list [data-dp-view]').click();await page.locator('#dp-order-dialog[open]').waitFor();
  assert.equal(await page.locator('#dp-new-status').count(),0);await page.locator('#dp-charge-order').waitFor();
  const transition=async status=>{const row=h.call('dp_get_order',{id:oldest.orderId}).order;assert.equal(h.call('dp_update_order',{id:row.id,status,version:row.version}).ok,true);await page.keyboard.press('Escape');await page.evaluate(id=>window.dispatchEvent(new StorageEvent('storage',{key:'don_pieros_order_signal_v1',newValue:JSON.stringify({orderId:id,at:Date.now()})})),oldest.orderId);};
  await transition('atendiendo');
  await page.locator('#dp-order-dialog').waitFor({state:'hidden'});
  await page.locator('#dp-dashboard-order-list .dp-state-atendiendo').waitFor();
  assert.equal(await page.locator('#dp-dashboard-order-list .dp-state-atendiendo').evaluate(card=>getComputedStyle(card).borderLeftColor),'rgb(233, 188, 50)');
  await transition('lista');
  await page.locator('#dp-dashboard-order-list .dp-state-lista').waitFor();
  await transition('despachada');
  await page.waitForFunction(()=>!document.querySelector('#dp-dashboard-order-list [data-dp-order]'));
  const cancelledId=h.call('dp_get_orders').orders[0].id;
  const cancelled=h.call('dp_get_orders').orders[0];assert.equal(h.call('dp_update_order',{id:cancelledId,status:'cancelada',version:cancelled.version}).ok,true);
  await search.fill('');await page.locator('[data-dp-filter="dashboard"]').selectOption('cancelada');
  await page.locator('#dp-dashboard-order-list .dp-state-cancelada').waitFor();
  assert.equal(await page.locator('#dp-dashboard-order-list .dp-state-cancelada').evaluate(card=>getComputedStyle(card).borderLeftColor),'rgb(215, 25, 32)');
  await page.locator('[data-dp-filter="dashboard"]').selectOption('active');
  // Arrival from another section: reveal the sidebar link and scroll to orders.
  await page.evaluate(()=>{location.hash='inventory';document.querySelector('.admin-sidebar nav').scrollTop=9999;});
  await page.locator('#inventory.section-active').waitFor();
  const arrived=create('Pedido recién llegado');
  await page.evaluate(id=>window.dispatchEvent(new StorageEvent('storage',{key:'don_pieros_order_signal_v1',newValue:JSON.stringify({orderId:id,at:Date.now()})})),arrived.orderId);
  const notice=page.locator(`[data-notice-key="order:${arrived.orderId}"]`);await notice.waitFor();
  assert.equal(await notice.locator('button').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(33, 134, 83)','Las órdenes recibidas usan verde money');
  await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('section-active'));
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.admin-sidebar a[href="#onlineorders"]').evaluate(link=>{
   const a=link.getBoundingClientRect(),b=link.closest('nav').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom&&link.classList.contains('dp-arrival-flash');
  }),true);
  assert.ok(await page.locator('#dp-dashboard-orders').evaluate(node=>Math.abs(node.getBoundingClientRect().top)<80),'Baja a la recepción de comandas.');
  assert.equal(await page.locator('#dp-nav-count').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(215, 25, 32)');
  assert.equal(await page.locator('#dp-nav-count').evaluate(node=>getComputedStyle(node).color),'rgb(255, 255, 255)');
  await page.screenshot({path:path.join(root,'artifacts/recepcion-aviso-escritorio.png')});
  await notice.locator('button').click();await page.locator('#dp-order-dialog[open]').waitFor();assert.equal(await notice.count(),0);
  await page.keyboard.press('Escape');
  // Table requests move up to the requests area and acceptance is the real action.
  requests=[{id:'20000000-0000-4000-8000-000000000001',table_id:table.id,session_id:null,request_type:'waiter',message:'Necesitamos servilletas',status:'pending',created_at:new Date().toISOString(),restaurant_tables:table}];
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const requestNotice=page.locator(`[data-notice-key="request:${requests[0].id}"]`);await requestNotice.waitFor({timeout:12000});
  await page.waitForTimeout(700);assert.ok(await page.locator('#alertsPanel').evaluate(node=>Math.abs(node.getBoundingClientRect().top)<90));
  assert.match(await requestNotice.innerText(),/Mesa 7/);
  await requestNotice.locator('button').click();await requestNotice.waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('#navRequestBadge').hidden);
  // Notice stays for precisely one minute, does not mark an order handled on expiry.
  const expire=create('Aviso temporal');
  await page.evaluate(id=>window.dispatchEvent(new StorageEvent('storage',{key:'don_pieros_order_signal_v1',newValue:JSON.stringify({orderId:id,at:Date.now()})})),expire.orderId);
  await page.locator(`[data-notice-key="order:${expire.orderId}"]`).waitFor();
  assert.ok(await page.evaluate(()=>window.qaNoticeExpiry.length>=3));
  await page.evaluate(()=>window.qaNoticeExpiry.forEach(expire=>expire()));
  assert.equal(await page.locator(`[data-notice-key="order:${expire.orderId}"]`).count(),0);
  assert.equal(h.call('dp_get_orders').orders.find(order=>order.id===expire.orderId).status,'nueva');
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:900});await search.fill('super maxi salsa');await page.locator('#dp-dashboard-order-list [data-dp-order]').first().waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width===390){await search.fill('aviso temporal');await page.locator('#dp-dashboard-order-list [data-dp-order]').waitFor();await page.locator('#dp-dashboard-orders').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'artifacts/recepcion-filtros-movil.png'),fullPage:false});}
  }
  assert.deepEqual(errors,[]);
  console.log('OK: búsqueda de 106+ pedidos por cliente/opciones/notas, estados y despacho, filtro de canceladas, avisos de 60 s, aceptar comanda/solicitud, contadores, desplazamiento y móvil.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
