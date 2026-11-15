const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
test('varios equipos y usuarios: asignar sincroniza avisos y mesas; abrir ventas y pedidos sincroniza sus avisos',async()=>{
 const now=new Date().toISOString(),tables=[1,2].map(n=>({id:'table-'+n,table_number:n,table_name:'Mesa '+n,is_active:true}));
 const sessions=tables.map((t,i)=>({id:'session-'+(i+1),table_id:t.id,status:'open',sale_channel:'table',opened_at:now,session_items:[]}));
 const requests=tables.map((t,i)=>({id:'command-'+(i+1),table_id:t.id,session_id:sessions[i].id,request_type:'other',request_source:'waiter',status:'pending',created_at:now,requested_by_name:'Laura',restaurant_tables:t}));
 const commands=tables.map((t,i)=>({id:requests[i].id,table_id:t.id,session_id:sessions[i].id,version:1,created_at:now,updated_at:now,waiter_name:'Laura',accepted_at:null,table:t,items:[{id:'line-'+i,item_name:'Pizza',quantity:1,unit_price:25000,waiter_options:{labels:[]}}]}));
 const orders=[1,2].map(n=>({id:'DP-shared-'+n,sequence:n,status:'nueva',version:1,createdAt:now,customerName:'Cliente '+n,phone:'3101234567',source:n===1?'staff_walk_in':'web',total:25000,paymentMethod:'Efectivo',fulfillment:'pickup',items:[{name:'Pizza',quantity:1,unitPrice:25000,selections:[]}]}));
 const peers=new Map(),errors=[];let failAccept=false,accepts=0,dropRefresh=false;
 const snapshot=()=>({requests:copy(requests),sessions:copy(sessions)});
 const backend=async(name,payload)=>{
  if(name==='getAdminSnapshot'||name==='get_admin_snapshot')return {data:snapshot()};
  if(name==='requests')return {data:copy(requests.filter(r=>!payload.ids?.length||payload.ids.includes(r.id)))};
  if(name==='dp_setup_status')return {data:false};
  if(name==='dp_list_waiter_comandas')return {data:{orders:copy(commands.map(c=>({...c,request_status:requests.find(r=>r.id===c.id).status})))}};
  if(name==='dp_accept_waiter_comanda'){
   if(failAccept){failAccept=false;return {error:{message:'Interrupción controlada de la red'}};}
   const command=commands.find(c=>c.id===payload.p_comanda_id),session=sessions.find(s=>s.id===command.session_id),request=requests.find(r=>r.id===command.id);
   if(!command.accepted_at){command.accepted_at=new Date().toISOString();request.status='acknowledged';request.acknowledged_at=command.accepted_at;accepts++;
    session.session_items=command.items.map(i=>({...i,status:'served',waiter_comanda_id:command.id}));}
   return {data:{comanda:{...copy(command),items:command.items.map(i=>({id:i.id,name:i.item_name,quantity:i.quantity,unit_price:i.unit_price,options:i.waiter_options}))},request:copy(request),session:copy(session)}};
  }
  throw Error('RPC inesperado: '+name);
 };
 async function deliver(sender,topic,event,payload){
  if(dropRefresh&&topic==='admin')return;
  // Different PC clocks must not prevent a valid opened-order signal.
  if(event==='order-opened')payload={...payload,at:payload.at-3600000};
  await Promise.all([...peers.entries()].filter(([id])=>id!==sender).map(async([,page])=>{
   if(page.isClosed())return;
   await page.evaluate(async({topic,event,payload})=>{
    if(topic==='admin'&&event==='refresh')await refreshFromCloud();
    else await window.peerHandlers?.[topic]?.[event]?.({payload});
   },{topic,event,payload});
  }));
 }
 const html=fs.readFileSync(path.join(root,'admin.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  async function device(id){
   const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();peers.set(id,page);page.on('pageerror',e=>errors.push(e.message));
   await page.exposeFunction('serverRpc',backend);await page.exposeFunction('sendPeer',({topic,event,payload})=>deliver(id,topic,event,payload));
   await page.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',async route=>{
    const body=route.request().postDataJSON();for(const message of body.messages||[])await deliver(id,message.topic,message.event,message.payload);
    await route.fulfill({json:{}});
   });
   await page.route('https://script.google.com/**',async route=>{
    const {action,payload={}}=route.request().postDataJSON();
    const result=action==='dp_get_orders'?{ok:true,orders:copy(orders),total:orders.length,activeCount:orders.length,revision:'shared'}:action==='dp_get_order'?{ok:true,order:copy(orders.find(o=>o.id===payload.id))}:{ok:true,products:[],toppings:[],payments:[],neighborhoods:[]};
    await route.fulfill({json:result});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
   for(const file of ['style.css','online-admin.css','waiter-orders.css','reception-notices.css'])await page.addStyleTag({path:path.join(root,file)});
   await page.addScriptTag({path:path.join(root,'date-format.js')});
   const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('  return { init };','  return { init, state, loadAdminData, renderAdminLive };').replace('document.addEventListener("DOMContentLoaded", App.init);','window.multiApp=App;');
   await page.addScriptTag({content:source});
   await page.evaluate(({id,tables})=>{
    document.body.classList.add('admin-authenticated');document.querySelectorAll('[data-admin-section="dashboard"]').forEach(n=>n.classList.add('section-active'));
    Object.assign(multiApp.state,{page:'admin',authToken:'token-'+id,currentUser:{id,role:id==='Supervisor'?'admin':'boss',permissions:['dashboard','service'],full_name:id},activeAdminSection:'dashboard',business:{business_name:'Don Pieros Pizza',currency:'COP'},tables,sessions:[],requests:[]});
    window.peerHandlers={};
    const db={rpc:(name,payload)=>{const promise=serverRpc(name,payload||{});promise.abortSignal=()=>promise;return promise;},
     from:()=>{let ids=[];return {select(){return this;},in(_key,value){ids=value;return this;},then(resolve,reject){return serverRpc('requests',{ids}).then(resolve,reject);}};},
     channel:topic=>({on(_type,filter,handler){(peerHandlers[topic]||={})[filter.event]=handler;return this;},subscribe(callback){queueMicrotask(()=>callback?.('SUBSCRIBED'));return this;},send:message=>sendPeer({topic,...message})}),removeChannel:async()=>{}};
    multiApp.state.sb=db;DonPierosAdmin.db=db;DonPierosAdmin.notify=()=>{};DonPierosAdmin.announceWebOrders=()=>{};
    window.DON_PIEROS_CONFIG={appsScriptUrl:'https://script.google.com/macros/s/test/exec',supabaseUrl:'https://bxyvxbutjlvoconfsjub.supabase.co',supabaseAnonKey:'public'};
    window.DonPierosLanguage={message:value=>value?.message||String(value)};window.DonPierosImages={resolve:()=>''};
    window.refreshFromCloud=async()=>{if(await multiApp.loadAdminData())multiApp.renderAdminLive();};
   },{id,tables});
   for(const file of ['packaging.js','order-labels.js','order-details.js','pending-deletions.js','reception-notices.js','online-admin.js','waiter-orders.js'])await page.addScriptTag({path:path.join(root,file)});
   await page.evaluate(async()=>{await refreshFromCloud();setInterval(()=>void refreshFromCloud(),500);});
   await page.waitForFunction(()=>document.querySelector('#dp-table-comandas')?.hidden===false);return page;
  }
  const a=await device('Caja'),b=await device('Supervisor');
  for(const page of [a,b])assert.equal(await page.locator('.dp-reception-notice.is-waiter').count(),2);
  const tile=page=>page.locator('#tablesGrid [data-open-table="table-1"]');
  const before=await tile(b).evaluate(n=>getComputedStyle(n).backgroundColor);
  assert.match(await tile(b).getAttribute('class'),/free/);
  await a.locator('[data-notice-key="request:command-1"] button').click();
  assert.equal(await a.locator('.dp-reception-notice.is-waiter').count(),2,'Ver no equivale a asignar.');
  assert.equal(await b.locator('.dp-reception-notice.is-waiter').count(),2);
  dropRefresh=true;// Simulate a missed Realtime wake-up: confirmed polling still reconciles.
  await a.locator('[data-dw-accept-order="command-1"]').click();
  for(const page of [a,b])await page.waitForFunction(()=>!DonPierosReception.has('request:command-1'));
  await b.waitForFunction(()=>document.querySelector('#tablesGrid [data-open-table="table-1"]').classList.contains('occupied'));
  assert.equal(await b.locator('[data-notice-key="request:command-2"]').count(),1,'Asignar una comanda no retira otras mesas pendientes.');
  assert.match(await tile(b).innerText(),/25\.000/);assert.doesNotMatch(await tile(b).getAttribute('class'),/needs-attention/);
  assert.notEqual(await tile(b).evaluate(n=>getComputedStyle(n).backgroundColor),before,'La mesa cambia al color de consumo ocupado.');
  const c=await device('Otro equipo');
  assert.equal(await c.locator('[data-notice-key="request:command-1"]').count(),0,'Un equipo nuevo también obtiene la asignación desde el servidor.');
  dropRefresh=false;
  await c.locator('[data-notice-key="request:command-2"] button').click();failAccept=true;
  await c.locator('[data-dw-accept-order="command-2"]').click();
  await c.waitForFunction(()=>document.querySelector('#dw-kitchen-error')?.textContent);
  assert.equal(await b.locator('[data-notice-key="request:command-2"]').count(),1,'Un envío fallido no hace desaparecer el aviso remoto.');
  await c.locator('[data-dw-accept-order="command-2"]').click();
  for(const page of [a,b,c])await page.waitForFunction(()=>!document.querySelector('.dp-reception-notice.is-waiter'));
  assert.equal(accepts,2);
  await a.locator('.dp-reception-notice.is-individual button').click();
  for(const page of [a,b,c])await page.waitForFunction(()=>!document.querySelector('.dp-reception-notice.is-individual'));
  await a.locator('#dp-order-dialog [data-dp-close]').first().click();
  await b.locator('.dp-reception-notice.is-online button').click();
  for(const page of [a,b,c])await page.waitForFunction(()=>!document.querySelector('.dp-reception-notice.is-online'));
  const d=await device('Cuarto equipo');
  await d.waitForFunction(()=>!document.querySelector('.dp-reception-notice'));
  assert.equal(await d.locator('.dp-reception-notice').count(),0,'Un navegador recién conectado recupera de los equipos activos los avisos ya gestionados.');
  assert.ok(orders.every(o=>o.status==='nueva'&&o.version===1),'Sincronizar avisos no cambia estados, precios ni ventas.');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
