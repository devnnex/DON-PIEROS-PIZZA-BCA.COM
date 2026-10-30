const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const {chromium}=require('playwright-core'),{harness}=require('../tests/helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});await db.waitReady;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema realtime;create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;create publication supabase_realtime;
   create schema extensions;create extension pgcrypto with schema extensions;`);
  for(const file of ['01_BASE.sql','02_ACTUALIZACIONES_NAPOLES.sql','03_DON_PIEROS.sql','04_PIN_4_A_12.sql','05_PEDIDOS_MESERO.sql','06_OPCIONES_QR.sql','07_COMANDAS_MESERO.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/install',file),'utf8'));
  await db.query("select dp_create_boss('Jefe QA','jefeqatest','1234')");
  const boss=(await db.query("select login('jefeqatest','1234') as data")).rows[0].data;
  await db.query("select save_user($1,gen_random_uuid(),'Ana Mesera','anaqa','1234','waiter',true,'[]'::jsonb)",[boss.token]);
  const waiter=(await db.query("select login('anaqa','1234') as data")).rows[0].data;
  const table=(await db.query("insert into restaurant_tables(table_number,table_name,qr_code) values(1,'Mesa 1','qa-mesa-1') returning *")).rows[0];
  await db.query("insert into restaurant_tables(table_number,table_name,qr_code) values(2,'Mesa 2','qa-mesa-2')");
  const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),first=catalog.products[0],group=first.modifiers[0];
  const maxi=catalog.toppings.find(t=>t.kind===group.source&&t.name.startsWith('Super maxi'));
  const errors=[];let writes=0,loseResponse=false,queue=Promise.resolve();
  const serial=operation=>{const result=queue.then(operation);queue=result.catch(()=>{});return result;};
  async function contextFor(user){
   const context=await browser.newContext({viewport:{width:user.user.role==='waiter'?390:1440,height:950},serviceWorkers:'block'});
   await context.addInitScript(token=>{try{localStorage?.setItem('don_pieros_admin_token',token);localStorage?.setItem('waiter_alarm_enabled','0');}catch(_){}},user.token);
   await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
   await context.route('https://script.google.com/**',route=>{
    if(route.request().method()==='GET')return route.fulfill({json:{ok:true}});
    const body=route.request().postDataJSON();
    return route.fulfill({json:body.action==='dp_get_catalog'||body.action==='dp_admin_catalog'?catalog:body.action==='dp_get_orders'?{ok:true,changed:true,revision:'0',total:0,activeCount:0,orders:[]}:body.action==='get_sales_shift'?{ok:true,shift:null,shifts:[]}:body.action==='bootstrap'?{ok:true}:{ok:true,items:[],everInitialized:true}});
   });
   await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),rpc=url.pathname.split('/').pop(),args=request.postData()?JSON.parse(request.postData()):{};
    try{
     const data=await serial(async()=>{
      await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':user.token})]);
      if(rpc==='get_current_user')return user.user;
      if(rpc==='dp_setup_status')return false;
      if(rpc==='get_bootstrap_data')return (await db.query('select get_bootstrap_data($1,$2) as data',[user.token,''])).rows[0].data;
      if(rpc==='get_admin_snapshot')return (await db.query('select get_admin_snapshot($1) as data',[user.token])).rows[0].data;
      if(rpc==='dp_list_waiter_comandas')return (await db.query('select dp_list_waiter_comandas() as data')).rows[0].data;
      if(rpc==='dp_accept_waiter_comanda')return (await db.query('select dp_accept_waiter_comanda($1,$2) as data',[args.p_comanda_id,args.p_expected_version])).rows[0].data;
      if(rpc==='dp_save_waiter_comanda'){
       writes++;
       return (await db.query('select dp_save_waiter_comanda($1,$2,$3,$4,$5,$6::jsonb,$7) as data',[args.p_operation_id,args.p_comanda_id,args.p_table_id,args.p_session_id,args.p_expected_version,JSON.stringify(args.p_items),args.p_notes])).rows[0].data;
      }
      if(rpc==='acknowledge_service_requests')return (await db.query('select acknowledge_service_requests($1,$2::uuid[],$3,$4) as data',[user.token,args.ids,args.acknowledged_at,args.message||null])).rows[0].data;
      if(rpc==='get_pos_features')return {};
      if(rpc==='list_users')return [];
      if(rpc==='service_requests')return (await db.query('select * from service_requests')).rows;
      if(rpc==='table_sessions')return (await db.query("select * from table_sessions where status='open'")).rows;
      return [];
     });
     if(rpc==='dp_save_waiter_comanda'&&loseResponse){loseResponse=false;return route.abort('failed');}
     await route.fulfill({json:data});
    }catch(error){if(process.env.PIEROS_DEBUG)console.log('Error de prueba',rpc,error.code,error.message);await route.fulfill({status:400,json:{code:error.code||'P0001',message:error.message}});}
   });return context;
  }
  const adminContext=await contextFor(boss),waiterContext=await contextFor(waiter);
  const admin=await adminContext.newPage(),page=await waiterContext.newPage();
  for(const p of [admin,page]){p.setDefaultTimeout(10000);p.on('pageerror',error=>errors.push(error.message));}
  await admin.goto('http://127.0.0.1:4173/admin.html#dashboard');await admin.locator('#salesShiftDialog[open]').waitFor();await admin.locator('#salesShiftDialog [data-close-dialog]').first().click();
  await page.goto('http://127.0.0.1:4173/admin.html#service');
  await page.locator('.dw-table').first().waitFor();
  assert.equal(await page.locator('#consumptionDialog').evaluate(dialog=>dialog.open),false);
  await page.locator(`[data-dw-table="${table.id}"]`).click();await page.locator(`[data-dw-product="${first.id}"]`).waitFor();
  await page.evaluate(()=>Promise.all([...document.querySelectorAll('.dw-product img')].slice(0,4).map(image=>image.decode().catch(()=>{}))));
  await page.screenshot({path:path.join(root,'artifacts/mesero-carta-movil.png'),fullPage:false,animations:'disabled'});
  await page.locator(`[data-dw-product="${first.id}"]`).click();await page.locator('#dw-add-product').click();
  assert.match(await page.locator('#dw-product-error').innerText(),/obligatorias/);
  await page.locator(`#dw-product-body input[value="${maxi.id}"]`).check();
  await page.locator('[data-dw-quantity="1"]').click();await page.locator('#dw-line-notes').fill('Sin cebolla');await page.locator('#dw-add-product').click();
  await page.locator('[data-dw-review]').click();await page.locator('#dw-order-notes').fill('Separar las salsas');
  await page.screenshot({path:path.join(root,'artifacts/mesero-revisar-comanda.png'),animations:'disabled'});
  await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  await page.locator('.dw-sent-order').waitFor();assert.equal(writes,1);
  assert.equal(await page.locator('.dp-reception-notice').count(),0,'El mesero no recibe un aviso de su propio envío.');
  const initial=(await db.query('select * from waiter_comandas')).rows[0];
  assert.equal((await db.query('select count(*)::int n from service_requests')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from session_items')).rows[0].n,0,'Enviar queda pendiente, sin consumo.');
  await admin.locator(`[data-dw-open-comanda="${initial.id}"]`).waitFor({timeout:10000});
  await admin.locator(`[data-dw-open-comanda="${initial.id}"]`).click();
  assert.match(await admin.locator('#dw-kitchen-body').innerText(),/Super maxi.*54 × 54 cm/s);
  assert.match(await admin.locator('#dw-kitchen-body').innerText(),/Separar las salsas/);
  assert.ok(await admin.locator('#dw-kitchen-body .dw-review-lines p').first().evaluate(node=>Number(getComputedStyle(node).fontWeight))>=800,'Opciones y notas de la comanda en negrita');
  assert.ok(await admin.locator('#dw-kitchen-body .dw-review-lines p').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize))>=16,'Opciones y notas más grandes en la revisión');
  const [printed]=await Promise.all([admin.context().waitForEvent('page'),admin.locator('[data-dw-print-order]').click()]);
  await printed.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
  assert.doesNotMatch(await printed.locator('body').innerText(),/Devnex|3246394689/);
  assert.equal(await printed.evaluate(()=>[...document.querySelectorAll('body *')].filter(node=>node.textContent.trim()).every(node=>Number(getComputedStyle(node).fontWeight)>=800)),true,'Toda la letra impresa del mesero es negrita');
  assert.ok(await printed.locator('body').evaluate(node=>parseFloat(getComputedStyle(node).fontSize))>=15);
  assert.ok(await printed.locator('article strong').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize))>=20);
  const pdfData=await printed.evaluate(async()=>{const bytes=new Uint8Array(await(await fetch(document.querySelector('[data-thermal-pdf-viewer]').src)).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);});
  const printedPdf=Buffer.from(pdfData,'base64');assert.match(printedPdf.toString('latin1'),/\/N \/Print/);
  fs.writeFileSync(path.join(root,'artifacts/comanda-mesero-negrita.pdf'),printedPdf);await printed.close();
  // Administration can correct the received comanda before accepting it.
  await admin.locator('#dw-kitchen-body [data-dw-edit-order]').click();await admin.locator('[data-dw-edit-line]').click();
  await admin.locator('#dw-line-notes').fill('Ajuste de administración');await admin.locator('#dw-add-product').click();await admin.locator('#dw-send-order').click();
  await admin.locator('#dw-kitchen-dialog[open]').waitFor();
  assert.equal((await db.query('select count(*)::int n from session_items')).rows[0].n,0);
  await admin.locator('[data-dw-accept-order]').click();
  await admin.waitForFunction(()=>!document.querySelector('[data-dw-accept-order]'));
  assert.equal((await db.query('select quantity from session_items')).rows[0].quantity,2);
  await page.waitForFunction(()=>document.querySelector('.dw-sent-order small')?.textContent.includes('v2'),{},{timeout:10000});
  await page.locator('[data-dw-edit-order]').click();await page.locator('[data-dw-edit-line]').click();
  await page.locator('[data-dw-quantity="1"]').click();await page.locator('#dw-line-notes').fill('Sin cebolla ni piña');await page.locator('#dw-add-product').click();
  await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  await admin.waitForFunction(()=>document.querySelector('#dw-kitchen-body').innerText.includes('3 ×'),{},{timeout:10000});
  assert.match(await admin.locator('#dw-kitchen-body').innerText(),/Sin cebolla ni piña/);
  assert.equal((await db.query('select count(*)::int n from service_requests')).rows[0].n,1);
  assert.equal((await db.query('select status from service_requests')).rows[0].status,'acknowledged');
  assert.equal((await db.query('select version from waiter_comandas')).rows[0].version,3);
  // Editing from administration after acceptance updates the same consumption.
  await admin.locator('#dw-kitchen-body [data-dw-edit-order]').click();await admin.locator('[data-dw-edit-line]').click();await admin.locator('[data-dw-quantity="1"]').click();await admin.locator('#dw-add-product').click();await admin.locator('#dw-send-order').click();
  await admin.locator('#dw-kitchen-dialog[open]').waitFor();assert.equal((await db.query('select quantity from session_items')).rows[0].quantity,4);
  await page.waitForFunction(()=>document.querySelector('.dw-sent-order small')?.textContent.includes('v4'),{},{timeout:10000});
  await page.locator('[data-dw-edit-order]').click();await page.locator('[data-dw-replace-line]').click();
  const replacement=catalog.products[1];await page.locator(`[data-dw-product="${replacement.id}"]`).click();await page.locator(`#dw-product-body input[value="${maxi.id}"]`).check();await page.locator('#dw-add-product').click();
  await page.locator('#dw-review-dialog[open]').waitFor();await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  assert.equal((await db.query("select item_name from session_items where status<>'cancelled'")).rows[0].item_name,replacement.name);
  assert.equal((await db.query('select count(*)::int n from service_requests')).rows[0].n,1);
  // Remove a sent product; the table turns free without deleting its account.
  await page.locator('[data-dw-edit-order]').click();await page.locator('[data-dw-remove-line]').click();await page.locator('#dw-send-order').click();
  await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.dw-account-total strong').textContent.includes('0'));
  assert.equal((await db.query("select count(*)::int n from session_items where status<>'cancelled'")).rows[0].n,0);
  await page.locator('[data-dw-home]').click();assert.equal(await page.locator('.dw-table.is-occupied').count(),0);
  // A lost response leaves the same operation available for retry across reload.
  await page.locator(`[data-dw-table="${table.id}"]`).click();
  await page.locator(`[data-dw-product="${first.id}"]`).click();await page.locator(`#dw-product-body input[value="${maxi.id}"]`).check();await page.locator('#dw-add-product').click();
  await page.locator('[data-dw-review]').click();loseResponse=true;await page.locator('#dw-send-order').click();
  await page.locator('#dw-send-order').filter({hasText:'Confirmar envío pendiente'}).waitFor();
  const beforeRetry=(await db.query('select count(*)::int n from waiter_comandas')).rows[0].n;
  const pendingId=(await db.query('select id from waiter_comandas where id<>$1',[initial.id])).rows[0].id;
  await admin.keyboard.press('Escape');await admin.locator(`[data-dw-open-comanda="${pendingId}"]`).waitFor({timeout:10000});await admin.locator(`[data-dw-open-comanda="${pendingId}"]`).click();
  await admin.locator('[data-dw-accept-order]').click();await admin.waitForFunction(()=>!document.querySelector('[data-dw-accept-order]')||document.querySelector('#dw-kitchen-error')?.textContent,{},{timeout:10000});
  assert.equal(await admin.locator('#dw-kitchen-error').innerText(),'');
  await page.reload();await page.locator(`[data-dw-table="${table.id}"]`).click();await page.locator('[data-dw-review]').click();await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  assert.equal((await db.query('select count(*)::int n from waiter_comandas')).rows[0].n,beforeRetry);
  assert.equal((await db.query("select count(*)::int n from session_items where status<>'cancelled'")).rows[0].n,1,'Reintentar conserva el consumo que administración ya aceptó, sin duplicarlo.');
  await page.locator('[data-dw-home]').click();assert.equal(await page.locator('.dw-table.is-occupied').count(),1);
  const changeAccount=async(id,remove=false)=>serial(async()=>{
   await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':boss.token})]);
   await db.query(remove?'delete from table_sessions where id=$1':"update table_sessions set status='closed' where id=$1",[id]);
  });
  const activeAccount=async()=>serial(async()=>(await db.query("select id from table_sessions where table_id=$1 and status='open'",[table.id])).rows[0]?.id);
  const addFreshProduct=async()=>{
   await page.locator('#dp-waiter-app .dw-tabs [data-dw-tab="menu"]').click();
   await page.locator(`[data-dw-product="${first.id}"]`).click();await page.locator(`#dw-product-body input[value="${maxi.id}"]`).check();await page.locator('#dw-add-product').click();
  };
  const sendFreshProduct=async()=>{
   await page.locator('[data-dw-review]').click();await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  };
  // The waiter can keep taking an order while admin closes the previous account.
  await page.locator(`[data-dw-table="${table.id}"]`).click();await addFreshProduct();
  const paidAccount=await activeAccount();await changeAccount(paidAccount);
  await page.evaluate(()=>DonPierosAdmin.refreshOperations());await sendFreshProduct();
  const secondCustomer=await activeAccount();assert.ok(secondCustomer);assert.notEqual(secondCustomer,paidAccount);
  assert.equal((await serial(()=>db.query('select status from table_sessions where id=$1',[paidAccount]))).rows[0].status,'closed');
  await admin.keyboard.press('Escape');await admin.evaluate(()=>DonPierosAdmin.refreshOperations());
  await admin.waitForFunction(()=>document.querySelectorAll('#dp-table-comandas [data-dw-open-comanda]').length===1);
  // A receipt whose response was lost must not reopen an account paid before retry.
  await addFreshProduct();await page.locator('[data-dw-review]').click();loseResponse=true;await page.locator('#dw-send-order').click();
  await page.locator('#dw-send-order').filter({hasText:'Confirmar envío pendiente'}).waitFor();
  const receiptCount=(await serial(()=>db.query('select count(*)::int n from waiter_comandas'))).rows[0].n;
  await changeAccount(secondCustomer);await page.reload();await page.locator(`[data-dw-table="${table.id}"]`).click();
  await page.locator('[data-dw-review]').click();await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  assert.equal(await activeAccount(),undefined);assert.equal((await serial(()=>db.query('select count(*)::int n from waiter_comandas'))).rows[0].n,receiptCount);
  await addFreshProduct();await sendFreshProduct();const thirdCustomer=await activeAccount();assert.ok(thirdCustomer);assert.notEqual(thirdCustomer,secondCustomer);
  // Deleting the account also frees the same table, retaining the new selection.
  await addFreshProduct();await changeAccount(thirdCustomer,true);await page.evaluate(()=>DonPierosAdmin.refreshOperations());await sendFreshProduct();
  const fourthCustomer=await activeAccount();assert.ok(fourthCustomer);assert.notEqual(fourthCustomer,thirdCustomer);
  // An old edit is cleared when its account closes; its charged items are never
  // copied into the next customer's account.
  await page.waitForFunction(()=>document.querySelectorAll('.dw-sent-order').length===1);await page.locator('.dw-sent-order [data-dw-edit-order]').click();
  await changeAccount(fourthCustomer);await page.evaluate(()=>DonPierosAdmin.refreshOperations());
  await page.locator('#dw-review-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('[data-dw-review]').isDisabled(),true);
  await addFreshProduct();await sendFreshProduct();assert.notEqual(await activeAccount(),fourthCustomer);
  await page.locator('[data-dw-home]').click();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.screenshot({path:path.join(root,'artifacts/mesero-mesas-escritorio.png'),animations:'disabled'});
  await admin.screenshot({path:path.join(root,'artifacts/admin-comanda-mesero.png'),animations:'disabled'});
  assert.deepEqual(errors,[]);console.log('OK: mesero y administrador con base real local, mesas reutilizables tras cierre/eliminación, selección conservada, ediciones antiguas aisladas, reintento cobrado sin reabrir cuentas y móvil/escritorio.');
 }finally{await browser.close();await db.close();}
})().catch(error=>{console.error(error);process.exit(1);});
