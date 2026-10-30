const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const clone=value=>JSON.parse(JSON.stringify(value));
test('recepción: retiro persistente con reintentos, revisión e impresión antes de asignar',async()=>{
 const orders=[1,2].map(sequence=>({id:'DP-test-'+sequence,sequence,status:'nueva',version:1,createdAt:new Date().toISOString(),customerName:'Cliente '+sequence,phone:'3101234567',fulfillment:'pickup',total:25000,paymentMethod:'Efectivo',items:[{name:'Pizza',quantity:1,selections:[]}]}));
 const products=[1,2].map(n=>({id:'product-'+n,name:'Pizza '+n,category:'Pizzas',price:25000,available:true,version:1,sort_order:n,modifiers:[]}));
 let revision=1;const gates=new Map(),calls=[],errors=[],deletionVersions=[];
 const hold=action=>{let release;const promise=new Promise(resolve=>release=resolve);gates.set(action,promise);return result=>{gates.delete(action);release(result);};};
 const server=http.createServer((req,res)=>{
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body data-page="admin"><main class="admin-app"><section id="dashboard"><div id="alertsPanel"></div></section><section id="service"></section></main><b id="dp-nav-count"></b><form id="loginForm"></form></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.route('https://script.google.com/**',async route=>{
   const {action,payload={}}=route.request().postDataJSON();calls.push(action);
   const outcome=gates.has(action)?await gates.get(action):null;
   if(outcome==='fail')return route.fulfill({json:{ok:false,error:'Fallo controlado'}});
   let result={ok:true};
   if(action==='dp_admin_catalog')result={...result,products:clone(products),toppings:[],payments:[],neighborhoods:[]};
   if(action==='dp_get_orders'){
    const active=o=>['nueva','atendiendo','lista'].includes(o.status),filtered=orders.filter(o=>o.status!=='eliminada'&&(payload.status==='all'||payload.status==='active'?payload.status==='all'||active(o):o.status===payload.status));
    result={...result,revision:String(revision),orders:clone(filtered),total:filtered.length,activeCount:orders.filter(active).length};
   }
   if(action==='dp_get_order')result.order=clone(orders.find(o=>o.id===payload.id&&o.status!=='eliminada')||null);
   if(action==='dp_delete_order'){
    const order=orders.find(o=>o.id===payload.id);deletionVersions.push(payload.version);
    if(order.status!=='eliminada'&&order.version!==payload.version)return route.fulfill({json:{ok:false,error:'Versión anterior'}});
    order.status='eliminada';revision++;
   }
   if(action==='dp_update_order'){const order=orders.find(o=>o.id===payload.id);order.status=payload.status;order.version++;revision++;result.order=clone(order);}
   if(action==='dp_save_catalog'){const item={...payload.item,version:payload.item.version+1};products.splice(products.findIndex(p=>p.id===item.id),1,item);result.item=item;}
   if(action==='dp_delete_catalog')products.splice(products.findIndex(p=>p.id===payload.id),1);
   await route.fulfill({json:result});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const setup=()=>{
   const commands=[{id:'comanda-1',table_id:'table-1',session_id:'session-1',version:1,updated_at:new Date().toISOString(),waiter_name:'Laura',notes:'Salsa aparte',accepted_at:null,table:{table_name:'Mesa 1'},items:[{id:'line-1',item_name:'Pizza mesero',quantity:2,unit_price:25000,waiter_options:{labels:['Tamaño: Maxi']}}]},
    {id:'retirada',table_id:'table-1',session_id:'session-1',items:[],updated_at:new Date().toISOString()}];
   window.fixture={commands,accepted:0,printed:[],notices:[],rpcCalls:[],sessions:[{id:'session-1',table_id:'table-1',status:'open',session_items:[]}],handlers:{},waiterHold:null,waiterFailures:1};
   window.DON_PIEROS_CONFIG={appsScriptUrl:'https://script.google.com/macros/s/test/exec'};
   window.DonPierosLanguage={message:value=>value?.message||String(value)};
   window.DonPierosDates={dateTime:value=>String(value),time:()=> '12:00'};
   window.DonPierosImages={resolve:()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'};
   window.DonPierosAdmin={getUser:()=>({id:'boss',role:'boss',full_name:'Jefe'}),getToken:()=> 'token',notify:(...args)=>fixture.notices.push(args),announceWebOrders:()=>{},
    getOperations:()=>({tables:[{id:'table-1',table_name:'Mesa 1'}],sessions:fixture.sessions,requests:[]}),refreshOperations:async()=>{},
    applyWaiterResult:data=>{if(data?.session)fixture.sessions=[data.session];},previewWaiterRemoval:()=>()=>{},
    db:{rpc:(name,payload)=>({abortSignal:async()=>{
     fixture.rpcCalls.push(name);
     if(name==='dp_setup_status')return {data:false};
     if(name==='dp_list_waiter_comandas')return {data:{orders:structuredClone(fixture.commands)}};
     if(name==='dp_accept_waiter_comanda'){
      const order=fixture.commands.find(o=>o.id===payload.p_comanda_id);order.accepted_at=new Date().toISOString();fixture.accepted++;
      return {data:{comanda:{...order,items:order.items.map(i=>({id:i.id,name:i.item_name,quantity:i.quantity,unit_price:i.unit_price}))},session:{...fixture.sessions[0],session_items:[{id:'line-1',status:'served'}]}}};
     }
     if(name==='dp_save_waiter_comanda'){
      if(fixture.waiterHold)await fixture.waiterHold;
      if(fixture.waiterFailures-->0)return {error:{message:'Red temporalmente interrumpida'}};
      const order=fixture.commands.find(o=>o.id===payload.p_comanda_id);order.items=[];order.version++;
      return {data:{comanda:order,request:{id:order.id,status:'resolved'},session:{...fixture.sessions[0],session_items:[]}}};
     }
     throw Error(name);
    }}),channel:()=>({on(type,filter,fn){fixture.handlers[filter.event]=fn;return this;},subscribe(){return this;},send:async()=>{},}),removeChannel:async()=>{}}
   };
   window.open=()=>({document:{write:html=>fixture.printed.push(html),close(){}},focus(){},print(){}});
  };
  const initialize=async()=>{
   await page.evaluate(setup);
   for(const file of ['online-admin.css','reception-notices.css','waiter-orders.css'])await page.addStyleTag({path:path.join(root,file)});
   for(const file of ['pending-deletions.js','reception-notices.js','online-admin.js','waiter-orders.js'])await page.addScriptTag({path:path.join(root,file)});
  };
  await initialize();
  await page.waitForSelector('[data-dp-order="DP-test-1"]');
  await page.waitForSelector('[data-dw-open-comanda="comanda-1"]');
  assert.equal(await page.locator('[data-dw-open-comanda="retirada"]').count(),0);
  const releaseDelete=hold('dp_delete_order');
  await page.locator('#dp-orders-list [data-dp-order="DP-test-1"] [data-dp-remove-order]').click();
  assert.equal(await page.locator('[data-dp-order="DP-test-1"]').count(),0,'Desaparece de ambas vistas mientras guarda.');
  assert.equal(await page.locator('#dp-nav-count').textContent(),'1');
  await page.locator('#dp-orders-refresh').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-dp-order="DP-test-1"]').count(),0,'Una lectura anterior no resucita el pedido.');
  releaseDelete();await page.waitForFunction(()=>DonPierosDeletions.list('web-order').some(row=>row.id==='DP-test-1'&&row.state==='done'));
  const failDelete=hold('dp_delete_order');
  orders[1].version=2;
  await page.locator('#dp-orders-list [data-dp-order="DP-test-2"] [data-dp-remove-order]').click();
  assert.equal(await page.locator('[data-dp-order="DP-test-2"]').count(),0);
  failDelete('fail');await page.waitForFunction(()=>DonPierosDeletions.list('web-order').some(row=>row.id==='DP-test-2'&&row.attempts>0));
  assert.equal(await page.locator('[data-dp-order="DP-test-2"]').count(),0,'Un fallo no devuelve el pedido a la pantalla.');
  const retryDelete=hold('dp_delete_order');
  await page.reload();await initialize();
  await page.waitForSelector('[data-dp-edit="product-1"]');
  assert.equal(await page.locator('[data-dp-order="DP-test-2"]').count(),0,'La intención de eliminar sobrevive a recargar.');
  retryDelete();await page.waitForFunction(()=>DonPierosDeletions.list('web-order').some(row=>row.id==='DP-test-2'&&row.state==='done'));
  assert.ok(deletionVersions.includes(2),'El reintento usa la versión nueva sin devolver la tarjeta.');
  const save=hold('dp_save_catalog');
  await page.locator('[data-dp-edit="product-1"]').click();await page.locator('#dp-item-form [name="name"]').fill('Pizza editada');
  await page.locator('#dp-item-save').click();
  assert.equal(await page.locator('#dp-item-dialog').evaluate(node=>node.open),false);
  assert.match(await page.locator('#dp-catalog-list').textContent(),/Pizza editada/);
  await page.locator('[data-dp-edit="product-2"]').click();
  save();await page.waitForFunction(()=>fixture.notices.some(([text])=>text==='Guardado.'));
  assert.equal(await page.locator('#dp-item-dialog').evaluate(node=>node.open),true,'El guardado anterior no cierra otra edición.');
  await page.locator('#dp-item-dialog [data-dp-close]').first().click();
  const removeProduct=hold('dp_delete_catalog');await page.locator('[data-dp-delete="product-1"]').click();
  assert.equal(await page.locator('[data-dp-edit="product-1"]').count(),0);
  removeProduct('fail');await page.waitForFunction(()=>DonPierosDeletions.list('catalog-products').some(row=>row.attempts>0));
  assert.equal(await page.locator('[data-dp-edit="product-1"]').count(),0,'El producto tampoco reaparece mientras reintenta.');
  await page.waitForFunction(()=>DonPierosDeletions.list('catalog-products').some(row=>row.state==='done'));
  await page.evaluate(()=>DonPierosReception.syncRequests([{id:'comanda-1',request_source:'waiter'}],{label:()=> 'Laura',body:()=> 'Pizza mesero',accept:id=>DonPierosWaiter.openRequest(id)}));
  await page.locator('.dp-reception-notice.is-waiter button').click();
  assert.equal(await page.locator('#dw-kitchen-dialog').evaluate(node=>node.open),true);
  assert.equal(await page.evaluate(()=>fixture.accepted),0,'Aceptar la notificación solo abre la comanda.');
  await page.locator('[data-dw-print-order]').click();
  assert.match(await page.evaluate(()=>fixture.printed[0]),/Pizza mesero/);
  assert.equal(await page.evaluate(()=>fixture.accepted),0,'Imprimir no asigna el consumo.');
  await page.locator('[data-dw-accept-order]').click();await page.waitForFunction(()=>fixture.accepted===1);
  assert.equal(await page.locator('[data-dw-accept-order]').count(),0);
  await page.evaluate(()=>{fixture.waiterHold=new Promise(resolve=>fixture.releaseWaiter=resolve);});
  await page.locator('[data-dw-remove-order]').click();
  assert.equal(await page.locator('[data-dw-open-comanda="comanda-1"]').count(),0,'El retiro desde inicio se refleja inmediatamente.');
  await page.evaluate(()=>{fixture.releaseWaiter();fixture.waiterHold=null;});
  await page.waitForFunction(()=>DonPierosDeletions.list('waiter-comanda').some(row=>row.attempts>0));
  assert.equal(await page.locator('[data-dw-open-comanda="comanda-1"]').count(),0,'Un fallo al retirar la comanda no la devuelve al inicio.');
  await page.waitForFunction(()=>DonPierosDeletions.list('waiter-comanda').some(row=>row.state==='done'));
  orders.push({...clone(orders[1]),id:'DP-test-3',sequence:3,status:'nueva'});revision++;
  await page.evaluate(()=>fixture.handlers['order-created']({payload:{orderId:'DP-test-3',customerName:'Dato público falso'}}));
  await page.waitForSelector('[data-dp-order="DP-test-3"]');
  assert.ok(calls.includes('dp_get_order'));
  assert.doesNotMatch(await page.locator('#dp-orders-list').textContent(),/Dato público falso/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
