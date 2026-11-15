const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');

test('las solicitudes permanecen en su panel, independientemente de filtros y notificaciones, hasta Aceptar',async()=>{
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'admin.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
  for(const file of ['style.css','reception-notices.css'])await page.addStyleTag({path:path.join(root,file)});
  await page.addScriptTag({path:path.join(root,'date-format.js')});
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('  return { init };','  return { init, state, bindAdmin, renderAlerts, receiveAdminRequests, loadAdminData, requestKind, renderAssistant, activateSongRequestMode };').replace('document.addEventListener("DOMContentLoaded", App.init);','window.requestTest=App;');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
   document.body.classList.add('admin-authenticated');document.querySelectorAll('[data-admin-section="dashboard"]').forEach(n=>n.classList.add('section-active'));
   const now=new Date().toISOString();
   window.requestRows=[{id:'call-1',table_id:'t1',request_type:'waiter',status:'pending',created_at:now,restaurant_tables:{table_name:'Mesa 1'}},{id:'message-2',table_id:'t2',request_type:'other',message:'Necesitamos servilletas',status:'pending',created_at:now,restaurant_tables:{table_name:'Mesa 2'}}];
   requestRows.push({id:'staff-comanda',table_id:'t1',request_type:'other',request_source:'waiter',requested_by_name:'Laura',status:'pending',message:'Comanda para cocina',created_at:now,restaurant_tables:{table_name:'Mesa 1'}});
   window.DonPierosWaiter={sync(){},openRequest:async id=>{window.openedWaiterRequest=id;return true;}};
   window.writes=[];window.partialSnapshot=false;
   Object.assign(requestTest.state,{page:'admin',currentUser:{id:'boss',role:'boss',full_name:'Caja'},authToken:'test',activeAdminSection:'dashboard',business:{business_name:'Prueba'},tables:[{id:'t1',table_name:'Mesa 1',is_active:true},{id:'t2',table_name:'Mesa 2',is_active:true}],sessions:[],requests:structuredClone(requestRows)});
   requestTest.state.sb={rpc:async(name,payload)=>{
    if(name==='getAdminSnapshot')return {data:{requests:partialSnapshot?[]:structuredClone(requestRows),sessions:[]}};
    if(name==='acknowledgeServiceRequests'){
     writes.push([...payload.ids]);const rows=requestRows.filter(row=>payload.ids.includes(row.id));rows.forEach(row=>Object.assign(row,{status:'acknowledged',acknowledged_at:payload.acknowledged_at}));
     return {data:structuredClone(rows)};
    }
    return {data:[]};
   },from:()=>{
    let ids=[];
    return {select(){return this;},in(_key,value){ids=value;return this;},then(resolve,reject){return Promise.resolve({data:structuredClone(requestRows.filter(row=>!ids.length||ids.includes(row.id)))}).then(resolve,reject);}};
   }};
   requestTest.bindAdmin();
   sessionStorage.setItem('dp-reception-filters-v2',JSON.stringify({query:'Otro cliente',source:'online',stage:'ready',sort:'newest'}));
  });
  await page.addScriptTag({path:path.join(root,'reception-notices.js')});
  await page.addScriptTag({path:path.join(root,'reception-board.js')});
  await page.evaluate(()=>requestTest.renderAlerts());
  assert.equal(await page.locator('#alertsPanel .alert-card').count(),2);
  assert.equal(await page.locator('#requestsHeading').isVisible(),true);
  assert.equal(await page.locator('#alertsPanel').isVisible(),true,'El filtro de pedidos no oculta las solicitudes.');
  assert.equal(await page.locator('#alertsPanel [data-alert-card="staff-comanda"]').count(),0,'Las comandas del mesero no se mezclan con solicitudes del cliente.');
  assert.equal(await page.locator('#alertFilter [value="comanda"]').count(),0);
  assert.equal(await page.locator('.dp-reception-notice:not(.is-waiter):not(.is-individual):not(.is-online)').count(),0,'Las solicitudes de clientes no son notificaciones flotantes.');
  assert.equal(await page.locator('.dp-reception-notice.is-waiter').count(),1,'La notificación de comanda del mesero continúa funcionando.');
  await page.locator('.dp-reception-notice.is-waiter button').click();
  assert.equal(await page.evaluate(()=>window.openedWaiterRequest),'staff-comanda');
  assert.equal(await page.locator('.dp-reception-notice.is-waiter').count(),1,'La comanda de mesa conserva su aviso hasta asignarse.');
  assert.equal(await page.evaluate(()=>writes.length),0,'Ver una comanda no acepta solicitudes de los clientes.');
  await page.evaluate(()=>DonPierosReception.show({key:'order:individual-test',kind:'individual',title:'Venta individual',detail:'Comanda de Laura',action:async()=>{}}));
  assert.equal(await page.locator('.dp-reception-notice.is-individual').count(),1,'Las ventas individuales conservan su notificación.');
  assert.equal(await page.locator('#alertsPanel .alert-card').count(),2);
  assert.doesNotMatch(await page.locator('#requestsHeading').innerText(),/canci[oó]n/i);
  assert.match(await page.locator('[data-alert-card="message-2"]').innerText(),/Mensaje de mesa/);
  await page.clock.install();
  await page.clock.runFor(125000);
  await page.evaluate(()=>requestTest.renderAlerts());
  assert.equal(await page.locator('#alertsPanel .alert-card').count(),2,'El paso del tiempo no retira solicitudes.');
  await page.evaluate(async()=>{partialSnapshot=true;await requestTest.loadAdminData();requestTest.renderAlerts();});
  assert.equal(await page.locator('#alertsPanel .alert-card').count(),2,'Una respuesta parcial tampoco retira las pendientes.');
  assert.equal(await page.locator('.dp-reception-notice').count(),2,'Ni el tiempo ni las lecturas parciales retiran las mesas sin asignar.');
  await page.evaluate(()=>DonPierosReception.mark('request:staff-comanda','accepted'));
  await page.locator('.dp-reception-notice.is-individual button').click();
  assert.equal(await page.locator('.dp-reception-notice').count(),0,'Cada aviso termina al abrir su comanda.');
  await page.locator('[data-alert-card="call-1"] [data-accept-request]').click();
  assert.equal(await page.locator('[data-alert-card="call-1"]').count(),0);
  assert.equal(await page.locator('[data-alert-card="message-2"]').count(),1,'Aceptar una solicitud conserva las demás.');
  await page.waitForFunction(()=>writes.length===1);
  await page.evaluate(async()=>{await requestTest.loadAdminData();requestTest.renderAlerts();});
  assert.equal(await page.locator('[data-alert-card="call-1"]').count(),0,'La solicitud aceptada no reaparece al refrescar.');
  await page.locator('#alertFilter').selectOption('waiter');
  assert.equal(await page.locator('#alertsPanel .alert-card').count(),0);
  await page.locator('#alertFilter').selectOption('all');
  assert.equal(await page.locator('#alertsPanel .alert-card').count(),1,'El filtro propio del panel sí funciona.');
  assert.equal(await page.evaluate(()=>requestTest.requestKind({request_type:'other',message:'Mesa solicita la canción: anterior'})),'chat','Los datos antiguos no activan un tipo musical en la pizzería.');
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  await page.locator('#requestsHeading').locator('..').screenshot({path:path.join(root,`artifacts/solicitudes-persistentes-${width}.png`)});
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
