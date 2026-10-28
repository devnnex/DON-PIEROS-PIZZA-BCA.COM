const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {harness}=require('../tests/helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

(async()=>{
 const h=harness(),product=h.product(),errors=[],sockets=new Set(),notices=[],reads=[];
 let orderCommitted=0,oldReadGate=null,oldReadStarted=false;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const clientContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  function reply(socket,msg,payload){
   socket.send(JSON.stringify(Array.isArray(msg)?[msg[0],msg[1],msg[2],'phx_reply',payload]:{ref:msg.ref,topic:msg.topic,event:'phx_reply',payload}));
  }
  function broadcast(event,payload){
   for(const peer of sockets){
    const topic='realtime:don-pieros-orders-live';if(!peer.topics.has(topic))continue;
    const data={type:'broadcast',event,payload};
    peer.socket.send(JSON.stringify(peer.array?[null,null,topic,'broadcast',data]:{topic,event:'broadcast',payload:data}));
   }
  }
  for(const context of [adminContext,clientContext]){
   await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>{
    const peer={socket,topics:new Set(),array:false};sockets.add(peer);
    socket.onClose(()=>sockets.delete(peer));
    socket.onMessage(raw=>{
     if(typeof raw!=='string'){
      const bytes=Buffer.from(raw);if(bytes[0]!==3)return;
      let at=7;const fields=[];
      for(let i=1;i<=5;i++){fields.push(bytes.subarray(at,at+bytes[i]).toString());at+=bytes[i];}
      if(bytes[6]===1)broadcast(fields[3],JSON.parse(bytes.subarray(at).toString()));
      return;
     }
     const msg=JSON.parse(raw),event=Array.isArray(msg)?msg[3]:msg.event,topic=Array.isArray(msg)?msg[2]:msg.topic,payload=Array.isArray(msg)?msg[4]:msg.payload;
     peer.array=Array.isArray(msg);
     if(event==='phx_join'){peer.topics.add(topic);reply(socket,msg,{status:'ok',response:{postgres_changes:[]}});}
     else if(event==='heartbeat'||event==='phx_leave')reply(socket,msg,{status:'ok',response:{}});
     else if(event==='broadcast'){broadcast(payload.event,payload.payload);reply(socket,msg,{status:'ok',response:{}});}
    });
   });
   await context.route('https://script.google.com/**',async route=>{
    const request=route.request();if(request.method()==='GET')return route.fulfill({json:{ok:true,capabilities:{onlineOrders:true}}});
    const body=request.postDataJSON();
    const result=body.action==='bootstrap'?{ok:true,configured:true}:h.call(body.action,body.payload||body,body.authToken||'');
    if(body.action==='createOrder')orderCommitted=Date.now();
    if(body.action==='dp_get_orders'){
     reads.push({at:Date.now(),payload:body.payload});
     if(oldReadGate&&!oldReadStarted){oldReadStarted=true;await oldReadGate.promise;}
    }
    if(body.action==='dp_order_status')throw Error('La recepción no debe esperar una consulta previa de estado.');
    await route.fulfill({json:result}).catch(()=>{});
   });
   await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),rpc=url.pathname.split('/').pop();let data=[];
    if(url.pathname==='/realtime/v1/api/broadcast'){
     const messages=request.postDataJSON().messages;
     for(const message of messages){notices.push(message);broadcast(message.event,message.payload);}
     return route.fulfill({status:202,body:''});
    }
    if(rpc==='get_current_user')data={id:'boss-id',full_name:'Jefe prueba',username:'jefe',role:'boss',is_active:true,permissions:[]};
    if(rpc==='dp_setup_status')data=false;
    if(rpc==='get_bootstrap_data')data={business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[],categories:[],items:[]};
    if(rpc==='get_admin_snapshot')data={requests:[],sessions:[]};
    if(rpc==='get_pos_features')data={};
    await route.fulfill({json:data});
   });
  }
  await adminContext.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));
  await clientContext.addInitScript(()=>{
   window.navigation.addEventListener('navigate',event=>{
    if(!event.destination.url.startsWith('https://api.whatsapp.com/send?'))return;
    event.preventDefault();window.qaWhatsApp={url:event.destination.url,at:Date.now()};
   });
   const originalFetch=window.fetch;
   window.fetch=function(url,options){if(String(url).includes('/realtime/v1/api/broadcast'))window.qaKeepAlive=options.keepalive;return originalFetch.apply(this,arguments);};
  });
  const admin=await adminContext.newPage(),client=await clientContext.newPage();
  for(const page of [admin,client])page.on('pageerror',error=>errors.push(error.message));
  await admin.goto('http://127.0.0.1:4173/admin.html#onlineorders');
  await admin.locator('#dp-orders-status').filter({hasText:'Recepción automática activa'}).waitFor();
  await admin.evaluate(()=>{document.querySelector('#salesShiftDialog')?.close();window.qaAlarms=0;DonPierosAdmin.alarm=()=>window.qaAlarms++;});
  assert.ok([...sockets].some(peer=>peer.topics.has('realtime:don-pieros-orders-live')));
  await client.goto('http://127.0.0.1:4173/index.html');await client.locator('#welcome-close').click();
  await client.locator('[data-product]').first().click();await client.locator('#add-product').click();
  await client.locator('#header-cart').click();await client.locator('#go-checkout').click();
  await client.locator('[name=name]').fill('Cliente veloz');await client.locator('[name=phone]').fill('3102241444');
  await client.locator('[name=notes]').fill('Sin cebolla, por favor.');
  // Leave an old read pending. The arrival must supersede it, not wait for it.
  oldReadGate=deferred();await admin.locator('#dp-orders-refresh').click();
  await admin.waitForTimeout(100);assert.equal(oldReadStarted,true);
  await client.locator('#confirm-order').click();
  await client.waitForFunction(()=>window.qaWhatsApp);
  const navigation=await client.evaluate(()=>window.qaWhatsApp);
  assert.ok(navigation.at-orderCommitted<700,'WhatsApp abre al confirmar, sin una pausa de celebración.');
  assert.equal(await client.evaluate(()=>window.qaKeepAlive),true);
  await admin.locator('#dp-orders-list [data-dp-order]').first().waitFor({timeout:2000});
  const receivedAt=Date.now();assert.ok(receivedAt-orderCommitted<2000,'El aviso debe interrumpir la lectura anterior.');
  assert.equal(await admin.evaluate(()=>window.qaAlarms),1,'Un pedido genera una alarma aun recibiendo dos avisos.');
  const createdNotices=notices.filter(notice=>notice.event==='order-created');
  assert.equal(createdNotices.length,1);assert.deepEqual(Object.keys(createdNotices[0].payload),['orderId']);
  const url=new URL(navigation.url),text=url.searchParams.get('text');
  assert.equal(url.searchParams.get('phone'),'573102241444');
  assert.match(text,/Nuevo pedido.*DON PIEROS PIZZA/);assert.match(text,/Cliente.*Cliente veloz/);
  assert.match(text,/Detalle del pedido:/);assert.match(text,/1x Pizza prueba — \*\$\s*25[.,]000\*/);
  assert.match(text,/TOTAL: \$\s*25[.,]000/);assert.match(text,/Indicaciones.*Sin cebolla/);
  assert.equal(h.sheets.get('Ordenes_Web').getLastRow(),2);
  assert.equal(await client.evaluate(()=>localStorage.getItem('don_pieros_pending_order_v1')),null);
  oldReadGate.resolve();oldReadGate=null;
  // Clicking the actual label opens the modal in the same event, without reads.
  const readCount=reads.length;
  await admin.locator('#dp-orders-list [data-dp-order] footer span').first().click();
  assert.equal(await admin.locator('#dp-order-dialog').evaluate(dialog=>dialog.open),true);
  assert.match(await admin.locator('#dp-order-detail').innerText(),/Cliente veloz/);
  assert.equal(reads.length,readCount);
  await admin.keyboard.press('Escape');
  for(const width of [390,1440]){
   await admin.setViewportSize({width,height:900});
   const elapsed=await admin.evaluate(()=>{const t=performance.now();document.querySelector('#dp-orders-list [data-dp-order] footer span').click();if(!document.querySelector('#dp-order-dialog').open)throw Error('La comanda no abrió en el clic');return performance.now()-t;});
   assert.ok(elapsed<100,`Comanda ${width}px: ${elapsed}ms`);
   await admin.locator('#dp-order-dialog [data-dp-close]').click();
  }
  // Unchanged refreshes must preserve the node under the pointer.
  await admin.evaluate(()=>window.qaOrderCard=document.querySelector('#dp-orders-list [data-dp-order]'));
  await admin.locator('#dp-orders-refresh').click();await admin.locator('#dp-orders-status').filter({hasText:'Recepción automática activa'}).waitFor();
  assert.equal(await admin.evaluate(()=>window.qaOrderCard===document.querySelector('#dp-orders-list [data-dp-order]')),true);
  // A public message is only an invalidation; it cannot inject a fake comanda.
  broadcast('order-created',{orderId:'DP-FORGED',order:{customerName:'Intruso'}});
  await admin.waitForTimeout(150);assert.equal(await admin.getByText('Intruso').count(),0);
  // With live notices absent, one conditional request on the 3s fallback picks up a saved order.
  const fallback=h.call('createOrder',{order:h.order(product,{customerName:'Recepción de respaldo'})});
  const fallbackStarted=Date.now();
  await admin.locator(`#dp-orders-list [data-dp-order="${fallback.orderId}"]`).waitFor({timeout:4500});
  assert.ok(Date.now()-fallbackStarted<4000);
  assert.ok(reads.some(read=>read.payload.revision),'El respaldo usa revisiones en la misma consulta.');
  await admin.locator('#dp-order-filter').selectOption('all');
  await admin.locator('#dp-page').filter({hasText:'de 2'}).waitFor();
  assert.equal(await admin.locator('#dp-orders-list [data-dp-order]').count(),2);
  await admin.locator('#dp-order-filter').selectOption('lista');await admin.locator('#dp-orders-list .dp-empty').waitFor();
  await admin.locator('#dp-order-filter').selectOption('active');await admin.locator('#dp-orders-list [data-dp-order]').first().waitFor();
  await admin.evaluate(()=>location.hash='dashboard');await admin.locator('#dp-dashboard-orders [data-dp-order] footer span').first().click();
  assert.equal(await admin.locator('#dp-order-dialog').evaluate(dialog=>dialog.open),true);
  assert.deepEqual(errors,[]);
  console.log(`Recepción entre dos navegadores: ${receivedAt-orderCommitted} ms; apertura WhatsApp: ${navigation.at-orderCommitted} ms (red simulada).`);
  console.log('OK: aviso persistente al navegar, lectura anterior cancelada, una alarma, comanda al clic móvil/escritorio, datos privados, respaldo y filtros.');
 }finally{oldReadGate?.resolve();await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
