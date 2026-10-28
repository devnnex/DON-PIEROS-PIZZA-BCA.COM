const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/admin.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(root,'admin.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
  await page.goto('http://127.0.0.1:4173/admin.html');
  for(const name of ['style.css','online-admin.css'])await page.addStyleTag({path:path.join(root,name)});
  for(const name of ['business-language.js','sales-shift.js'])await page.addScriptTag({path:path.join(root,name)});
  const hooks='state,bindAdmin,showAdminSection,openSalesShift,armAlarmOnFirstGesture,addConsumptionBatch,notifyWaiterOrder,renderAlerts,groupedActiveRequests,flushRequestOutbox';
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'app.js'),'utf8').replace('  return { init };',`  return { init,${hooks} };`).replace('document.addEventListener("DOMContentLoaded", App.init);','window.qa=App;')});
  await page.evaluate(()=>{
   document.body.classList.add('admin-authenticated');document.body.dataset.userRole='boss';
   const user={id:crypto.randomUUID(),role:'boss',full_name:'Jefe'};
   Object.assign(qa.state,{page:'admin',currentUser:user,authToken:'test',business:{business_name:'Don Pieros Pizza'},soundEnabled:false});
   window.savedRequests=new Map();window.savedLines=[];
   qa.state.sb={
    rpc:async(name,args)=>{
     if(name==='dp_notify_waiter_order'){
      const existing=savedRequests.get(args.p_request_id);if(existing)return {data:{request:existing,duplicate:true}};
      const row={id:args.p_request_id,table_id:qa.state.sessions[0].table_id,session_id:args.p_session_id,request_type:'other',status:'pending',request_source:'waiter',requested_by_name:'Laura Pérez',requested_by_user_id:qa.state.currentUser.id,message:'2 × Pizza de prueba (Sin cebolla)',created_at:new Date().toISOString()};savedRequests.set(row.id,row);return {data:{request:row}};
     }
     if(name==='createServiceRequestsBatch')return {data:{results:args.requests.map(event=>{
      if(!savedRequests.has(event.request_id))savedRequests.set(event.request_id,{...event,id:event.request_id,status:'pending',created_at:new Date().toISOString()});
      return {request:savedRequests.get(event.request_id)};
     })}};
     if(name==='acknowledgeServiceRequests')return {data:args.request_ids.map(id=>{const row={...savedRequests.get(id),id,status:'acknowledged',acknowledged_at:new Date().toISOString()};savedRequests.set(id,row);return row;})};
     return {data:null};
    },
    from:table=>{
     let payload=null,single=false;
     const query={insert(value){payload=value;return this;},update(value){payload=value;return this;},select(){return this;},eq(){return this;},in(){return this;},single(){single=true;return this;},
      then(resolve,reject){let rows=payload==null?[]:(Array.isArray(payload)?payload:[payload]).map(row=>({id:crypto.randomUUID(),...row,created_at:new Date().toISOString()}));if(table==='session_items')savedLines.push(...rows);return Promise.resolve({data:single?rows[0]:rows}).then(resolve,reject);}};
     return query;
    },channel:()=>({on(){return this;},subscribe(){return this;},send:async()=> 'ok'})
   };
   qa.bindAdmin();qa.showAdminSection('service');
  });
  const links=await page.locator('.admin-sidebar nav a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  assert.ok(links.indexOf('#onlineorders')<links.indexOf('#webmenu')&&links.indexOf('#webmenu')<links.indexOf('#inventory'));
  assert.equal(await page.locator('#assistant,.admin-sidebar a[href="#assistant"],#servicePointsGrid').count(),0);
  assert.equal(await page.locator('#dp-nav-count').evaluate(n=>getComputedStyle(n).display),'none');
  assert.equal(await page.locator('.admin-sidebar a[href="#onlineorders"]').evaluate(n=>getComputedStyle(n).borderLeftColor),'rgba(245, 207, 73, 0.8)');
  const sizes=await page.evaluate(()=>{const a=document.querySelector('.service-sales-layout').getBoundingClientRect(),b=document.querySelector('.service-tables-panel').getBoundingClientRect();return [a.width,b.width];});assert.ok(Math.abs(sizes[0]-sizes[1])<2);
  await page.evaluate(()=>qa.showAdminSection('menu'));
  for(const number of ['1','2']){
   if(number==='1')await page.locator('#tableForm [name=table_number]').fill(number);else await page.keyboard.type(number);
   await page.locator('#tableForm [name=table_name]').fill('MESA '+number);await page.locator('#tableForm [name=table_name]').press('Enter');
   await page.waitForFunction(()=>document.activeElement===document.querySelector('#tableForm [name=table_number]'));
  }
  await page.waitForFunction(()=>qa.state.tables.length===2);
  await page.evaluate(()=>{qa.state.soundEnabled=true;qa.armAlarmOnFirstGesture();qa.openSalesShift();});
  await page.mouse.move(30,30);await page.locator('#salesShiftDialog [aria-label="Cerrar"]').click();await page.locator('#salesShiftDialog').waitFor({state:'hidden',timeout:1000});
  await page.evaluate(async()=>{
   qa.state.soundEnabled=false;qa.state.currentUser={id:crypto.randomUUID(),role:'waiter',full_name:'Laura Pérez'};document.body.dataset.userRole='waiter';
   const table=qa.state.tables[0],session={id:crypto.randomUUID(),table_id:table.id,status:'open',assigned_waiter_id:qa.state.currentUser.id,assigned_waiter:qa.state.currentUser,restaurant_tables:table,session_items:[]};
   qa.state.sessions=[session];const form=document.querySelector('#consumptionForm');form.session_id.value=session.id;
   window.result=await qa.addConsumptionBatch(form,[{itemName:'Pizza de prueba',quantity:2,unitPrice:25000,notes:'Sin cebolla',payerName:''}]);
  });
  await page.waitForFunction(()=>qa.state.requests.some(r=>r.request_source==='waiter'));
  assert.equal(await page.evaluate(()=>savedLines.length),1);
  await page.evaluate(()=>{
   const staff=qa.state.requests.find(r=>r.request_source==='waiter');
   qa.state.requests.push({...staff,id:crypto.randomUUID(),request_source:'client',requested_by_user_id:null,requested_by_name:null,message:'Quisiera otra pizza',created_at:new Date().toISOString()});
   qa.state.currentUser={id:crypto.randomUUID(),role:'boss',full_name:'Caja'};document.body.dataset.userRole='boss';qa.showAdminSection('dashboard');
  });
  assert.equal(await page.locator('#alertsPanel .alert-card').count(),2);
  assert.match(await page.locator('#alertsPanel .alert-origin.is-waiter').innerText(),/Pedido de mesero · Laura Pérez/);
  assert.match(await page.locator('#alertsPanel .alert-origin:not(.is-waiter)').innerText(),/Cliente · En línea/);
  assert.doesNotMatch(await page.locator('#alertsPanel').innerText(),/\[MESERO:/);
  await page.locator('#alertsPanel .alert-card').filter({has:page.locator('.alert-origin.is-waiter')}).locator('[data-accept-request]').click();
  await page.waitForFunction(()=>qa.state.requests.find(r=>r.request_source==='waiter').status==='acknowledged');
  assert.equal(await page.evaluate(()=>savedLines.length),1);
  assert.equal(await page.locator('.admin-chat-window').count(),0);
  await page.screenshot({path:path.join(root,'artifacts/solicitudes-origen.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Menú amarillo, contador vacío oculto, mesas amplias, Enter con foco, X en un clic y pedido del mesero separado sin duplicar consumos: OK.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
