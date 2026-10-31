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
  const errors=[];let writes=0,loseResponse=false,rejectAcceptance=false,queue=Promise.resolve();
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
      if(rpc==='dp_accept_waiter_comanda'){if(rejectAcceptance){rejectAcceptance=false;throw Error('No pudimos guardar. Intenta de nuevo.');}return (await db.query('select dp_accept_waiter_comanda($1,$2) as data',[args.p_comanda_id,args.p_expected_version])).rows[0].data;}
      if(rpc==='dp_save_waiter_comanda'){
       writes++;
       return (await db.query('select dp_save_waiter_comanda($1,$2,$3,$4,$5,$6::jsonb,$7) as data',[args.p_operation_id,args.p_comanda_id,args.p_table_id,args.p_session_id,args.p_expected_version,JSON.stringify(args.p_items),args.p_notes])).rows[0].data;
      }
      if(rpc==='acknowledge_service_requests')return (await db.query('select acknowledge_service_requests($1,$2::uuid[],$3,$4) as data',[user.token,args.ids,args.acknowledged_at,args.message||null])).rows[0].data;
      if(rpc==='get_pos_features')return {};
      if(rpc==='list_users')return [];
      if(rpc==='service_requests')return (await db.query('select * from service_requests')).rows;
      if(rpc==='table_sessions'&&request.method()==='PATCH')return (await db.query('update table_sessions set payer_name=$1,assigned_waiter_id=$2 where id=$3 returning *',[args.payer_name,args.assigned_waiter_id,url.searchParams.get('id').replace(/^eq\./,'')])).rows[0];
      if(rpc==='session_items'&&request.method()==='PATCH')return (await db.query('update session_items set item_name=$1,quantity=$2,unit_price=$3,notes=$4 where id=$5 returning *',[args.item_name,args.quantity,args.unit_price,args.notes,url.searchParams.get('id').replace(/^eq\./,'')])).rows[0];
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
  assert.equal((await db.query('select assigned_waiter_id from table_sessions where id=$1',[initial.session_id])).rows[0].assigned_waiter_id,waiter.user.id);
  assert.equal((await db.query('select count(*)::int n from service_requests')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from session_items')).rows[0].n,0,'Enviar queda pendiente, sin consumo.');
  await admin.locator(`[data-dw-open-comanda="${initial.id}"]`).waitFor({timeout:10000});
  await admin.locator(`[data-dw-open-comanda="${initial.id}"]`).click();
  assert.match(await admin.locator('#dw-kitchen-body').innerText(),/Super maxi.*54 × 54 cm/s);
  assert.match(await admin.locator('#dw-kitchen-body').innerText(),/Separar las salsas/);
  assert.ok(await admin.locator('#dw-kitchen-body .dw-review-lines p').first().evaluate(node=>Number(getComputedStyle(node).fontWeight))>=800,'Opciones y notas de la comanda en negrita');
  assert.equal(await admin.locator('#dw-kitchen-body .dw-review-lines p').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),14,'Opciones y notas: tamaño original más 2 píxeles');
  const [printed]=await Promise.all([admin.context().waitForEvent('page'),admin.locator('[data-dw-print-order]').click()]);
  await printed.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
  assert.doesNotMatch(await printed.locator('body').innerText(),/Devnex|3246394689/);
  assert.equal(await printed.evaluate(()=>[...document.querySelectorAll('body *')].filter(node=>node.textContent.trim()).every(node=>Number(getComputedStyle(node).fontWeight)>=800)),true,'Toda la letra impresa del mesero es negrita');
  assert.equal(await printed.locator('body').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),16);
  assert.equal(await printed.locator('article strong').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),19);
  assert.match(await printed.locator('body').evaluate(node=>getComputedStyle(node).fontFamily),/monospace/);
  const sizeLine=await printed.locator('.size-option').first().evaluate(node=>({line:parseFloat(getComputedStyle(node).fontSize),word:parseFloat(getComputedStyle(node.querySelector('.size-name')).fontSize),left:parseFloat(getComputedStyle(node).marginLeft)}));
  assert.equal(sizeLine.line,16);assert.equal(sizeLine.word,18);assert.equal(sizeLine.left,-4);
  const pdfData=await printed.evaluate(async()=>{const bytes=new Uint8Array(await(await fetch(document.querySelector('[data-thermal-pdf-viewer]').src)).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);});
  const printedPdf=Buffer.from(pdfData,'base64');assert.match(printedPdf.toString('latin1'),/\/N \/Print/);
  fs.writeFileSync(path.join(root,'artifacts/comanda-mesero-negrita.pdf'),printedPdf);await printed.close();
  // Administration can correct the received comanda before accepting it.
  await admin.locator('#dw-kitchen-body [data-dw-edit-order]').click();await admin.locator('[data-dw-edit-line]').click();
  await admin.locator('#dw-line-notes').fill('Ajuste de administración');await admin.locator('#dw-add-product').click();await admin.locator('#dw-send-order').click();
  await admin.locator('#dw-kitchen-dialog[open]').waitFor();
  assert.equal((await db.query('select count(*)::int n from session_items')).rows[0].n,0);
  rejectAcceptance=true;await admin.locator('[data-dw-accept-order]').click();
  await admin.locator('#dw-kitchen-error').filter({hasText:'No pudimos guardar'}).waitFor();
  assert.equal(await admin.locator('#dw-kitchen-dialog').evaluate(dialog=>dialog.open),true,'Un fallo de aceptación deja la comanda abierta para reintentar.');
  await admin.locator('[data-dw-accept-order]').click();
  await admin.waitForFunction(()=>!document.querySelector('[data-dw-accept-order]'));
  assert.equal(await admin.locator('#dw-kitchen-dialog').evaluate(dialog=>dialog.open),false,'Aceptar cierra la comanda al confirmar el consumo.');
  assert.equal((await db.query('select quantity from session_items')).rows[0].quantity,2);
  assert.equal(await admin.evaluate(id=>DonPierosAdmin.getOperations().sessions.find(session=>session.id===id)?.assigned_waiter?.full_name,initial.session_id),'Ana Mesera','Editar y aceptar desde administración conserva quién atendió');
  await page.waitForFunction(()=>document.querySelector('.dw-sent-order small')?.textContent.includes('v2'),{},{timeout:10000});
  await page.locator('[data-dw-edit-order]').click();await page.locator('[data-dw-edit-line]').click();
  assert.equal(await page.locator('#dw-unit-price').inputValue(),'','Sin precio manual se conserva el valor de la carta.');
  await page.locator('#dw-unit-price').fill('90000');
  await page.locator('[data-dw-quantity="1"]').click();await page.locator('#dw-line-notes').fill('Sin cebolla ni piña');await page.locator('#dw-add-product').click();
  await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  await admin.locator(`[data-dw-open-comanda="${initial.id}"]`).filter({hasText:'3 ×'}).waitFor();
  await admin.locator(`[data-dw-open-comanda="${initial.id}"]`).click();
  await admin.waitForFunction(()=>document.querySelector('#dw-kitchen-body').innerText.includes('3 ×'),{},{timeout:10000});
  assert.match(await admin.locator('#dw-kitchen-body').innerText(),/Sin cebolla ni piña/);
  assert.equal((await db.query('select count(*)::int n from service_requests')).rows[0].n,1);
  assert.equal((await db.query('select status from service_requests')).rows[0].status,'acknowledged');
  assert.equal((await db.query('select version from waiter_comandas')).rows[0].version,3);
  assert.equal(Number((await db.query('select unit_price from session_items')).rows[0].unit_price),90000,'El mesero puede cambiar el precio al editar.');
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
  // Administration starts a new order from the table tile using the same menu.
  const secondTable=(await serial(()=>db.query('select * from restaurant_tables where table_number=2'))).rows[0];
  const reloadAdmin=async()=>{await admin.reload();await admin.locator('#salesShiftDialog[open]').waitFor();await admin.locator('#salesShiftDialog [data-close-dialog]').first().click();await admin.evaluate(()=>DonPierosReception.reset());await admin.locator(`[data-open-table="${secondTable.id}"]:visible`).first().waitFor();};
  await reloadAdmin();
  await admin.locator(`[data-open-table="${secondTable.id}"]:visible`).first().click();
  await admin.locator('#dw-catalog-dialog[open]').waitFor();
  assert.equal(await admin.locator('#consumptionDialog').evaluate(dialog=>dialog.open),false,'Las mesas usan la carta, no el selector de inventario.');
  assert.equal(await admin.locator('#dw-manager-products [data-dw-product]').count(),catalog.products.filter(p=>p.available).length);
  await admin.setViewportSize({width:390,height:950});
  await admin.locator('#dw-manager-search').fill('no existe en la carta');
  await admin.locator('#dw-manager-products [data-dw-custom]').click();
  await admin.locator('#dw-add-product').click();assert.equal(await admin.locator('#dw-product-dialog').evaluate(dialog=>dialog.open),true,'Otro requiere nombre y precio.');
  await admin.locator('#dw-custom-name').fill('Postre del día');await admin.locator('#dw-custom-price').fill('12500');
  await admin.locator('[data-dw-quantity="1"]').click();await admin.locator('[data-dw-quantity="1"]').click();await admin.locator('[data-dw-quantity="-1"]').click();
  assert.equal(await admin.locator('#dw-product-quantity').innerText(),'2');
  await admin.locator('#dw-line-notes').fill('Sin azúcar; salsa aparte');await admin.locator('#dw-add-product').click();
  await admin.locator('#dw-review-dialog[open]').waitFor();assert.match(await admin.locator('#dw-review-body').innerText(),/2 × Postre del día/);
  await admin.locator('[data-dw-edit-line]').click();assert.equal(await admin.locator('#dw-custom-name').inputValue(),'Postre del día');
  assert.equal(await admin.locator('#dw-custom-price').inputValue(),'12500');assert.equal(await admin.locator('#dw-line-notes').inputValue(),'Sin azúcar; salsa aparte');
  await admin.locator('[data-dw-quantity="1"]').click();await admin.locator('#dw-custom-price').fill('13000');await admin.locator('#dw-add-product').click();
  await admin.locator('[data-dw-add-extra]').click();await admin.locator(`#dw-manager-products [data-dw-product="${first.id}"]`).click();
  await admin.locator('#dw-add-product').click();assert.match(await admin.locator('#dw-product-error').innerText(),/obligatorias/);
  await admin.locator(`#dw-product-body input[value="${maxi.id}"]`).check();await admin.locator('#dw-line-notes').fill('Sin cebolla');await admin.locator('#dw-add-product').click();
  assert.match(await admin.locator('.dw-review-total').innerText(),/135.000/);
  const customPrice=()=>admin.locator('.dw-review-lines article').filter({hasText:'Postre del día'}).locator('[data-dw-price]');
  await customPrice().dblclick();await customPrice().locator('input').fill('14000');await customPrice().locator('input').press('Enter');
  assert.match(await admin.locator('.dw-review-total').innerText(),/138.000/);
  await customPrice().dblclick();await customPrice().locator('input').fill('15000');await customPrice().locator('input').press('Escape');
  assert.match(await admin.locator('.dw-review-total').innerText(),/138.000/,'Escape cancela la edición en la línea.');
  await customPrice().dblclick();await customPrice().locator('input').fill('13000');await customPrice().locator('input').press('Tab');
  assert.match(await admin.locator('.dw-review-total').innerText(),/135.000/);
  await admin.screenshot({path:path.join(root,'artifacts/mesa-carta-otro-movil.png'),animations:'disabled'});
  assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // The saved local selection and an uncertain write survive reload together.
  await reloadAdmin();await admin.locator(`[data-open-table="${secondTable.id}"]:visible`).first().click();await admin.locator('#dw-review-dialog[open]').waitFor();
  assert.match(await admin.locator('#dw-review-body').innerText(),/3 × Postre del día/);
  loseResponse=true;await admin.locator('#dw-send-order').click();await admin.locator('#dw-send-order').filter({hasText:'Confirmar envío pendiente'}).waitFor();
  const managerOrder=(await serial(()=>db.query('select * from waiter_comandas where table_id=$1',[secondTable.id]))).rows[0];
  assert.ok(managerOrder.accepted_at,'Administración agrega los consumos al enviar.');
  const beforeManagerRetry=(await serial(()=>db.query('select count(*)::int n from session_items where table_id=$1',[secondTable.id]))).rows[0].n;assert.equal(beforeManagerRetry,2);
  await reloadAdmin();await admin.locator(`[data-open-table="${secondTable.id}"]:visible`).first().click();await admin.locator('#dw-review-dialog[open]').waitFor();
  await admin.locator('#dw-send-order').click();await admin.locator('#dw-kitchen-dialog[open]').waitFor();
  assert.equal((await serial(()=>db.query('select count(*)::int n from session_items where table_id=$1',[secondTable.id]))).rows[0].n,2,'Reintentar no duplica consumos.');
  assert.equal(await admin.locator('[data-dw-accept-order]').count(),0,'La comanda creada desde caja ya está agregada.');
  const managerLines=(await serial(()=>db.query('select * from session_items where table_id=$1',[secondTable.id]))).rows;
  assert.ok(managerLines.every(line=>line.menu_item_id===null));
  assert.equal(managerLines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unit_price),0),135000);
  assert.equal(managerLines.find(line=>line.item_name==='Postre del día').waiter_options.custom,true);
  assert.equal(managerLines.find(line=>line.item_name==='Postre del día').quantity,3);
  for(const width of [58,80]){
   await admin.selectOption('#dw-print-width',String(width));
   const [customPrint]=await Promise.all([admin.context().waitForEvent('page'),admin.locator('[data-dw-print-order]').click()]);
   await customPrint.waitForFunction(()=>document.body.dataset.thermalPdfReady==='1');
   assert.match(await customPrint.locator('article').filter({hasText:'Postre del día'}).innerText(),/3 ×[\s\S]*Sin azúcar; salsa aparte/);
   assert.match(await customPrint.locator('footer').innerText(),/135.000/);
   const pdf=await customPrint.evaluate(async()=>{const buffer=await(await fetch(document.querySelector('[data-thermal-pdf-viewer]').src)).arrayBuffer();let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);return btoa(binary);});
   fs.writeFileSync(path.join(root,`artifacts/comanda-carta-otro-${width}mm.pdf`),Buffer.from(pdf,'base64'));await customPrint.close();
  }
  await admin.locator('#dw-kitchen-body [data-dw-close]').click();await admin.locator(`[data-open-table="${secondTable.id}"]:visible`).first().click();
  await admin.locator('[data-dw-account]').click();await admin.locator('#accountDetailDialog[open]').waitFor();
  assert.match(await admin.locator('#accountDetailContent').innerText(),/135.000/);
  assert.equal(await admin.locator('#dw-review-dialog').evaluate(dialog=>dialog.open),false,'Ver consumo no vuelve a abrir la selección.');
  await admin.locator('.account-detail-line').filter({hasText:'Postre del día'}).locator('strong').first().dblclick();
  await admin.locator('#dw-product-dialog[open]').waitFor();assert.equal(await admin.locator('#dw-review-dialog').evaluate(dialog=>dialog.open),false,'Doble clic abre directamente el producto, sin el resumen de comanda.');
  assert.equal(await admin.locator('#dw-custom-price').inputValue(),'13000');await admin.locator('[data-dw-quantity="-1"]').click();await admin.locator('#dw-add-product').click();
  await admin.waitForFunction(tableId=>DonPierosAdmin.getOperations().sessions.find(session=>session.table_id===tableId)?.session_items.find(item=>item.item_name==='Postre del día')?.quantity===2,secondTable.id);
  const editedCustom=(await serial(()=>db.query("select quantity from session_items where table_id=$1 and item_name='Postre del día'",[secondTable.id]))).rows[0];
  assert.equal(editedCustom.quantity,2,'Editar desde la cuenta actualiza el mismo producto personalizado.');
  assert.equal(await admin.locator('#dw-kitchen-dialog').evaluate(dialog=>dialog.open),false,'Guardar la edición directa no abre otra comanda.');
  // Previous table lines also use the direct product editor, not the old form.
  const legacy=(await serial(()=>db.query("insert into session_items(session_id,table_id,item_name,quantity,unit_price,notes,status,created_by_user_id) values($1,$2,'Consumo anterior',1,16500,'Nota anterior','served',$3) returning *",[managerOrder.session_id,secondTable.id,boss.user.id]))).rows[0];
  await admin.evaluate(()=>DonPierosAdmin.refreshOperations());await admin.evaluate(id=>DonPierosAdmin.openTableAccount(id),secondTable.id);
  await admin.locator('.account-detail-line').filter({hasText:'Consumo anterior'}).locator('strong').first().dblclick();
  await admin.locator('#dw-product-dialog[open]').waitFor();assert.equal(await admin.locator('#consumptionDialog').evaluate(dialog=>dialog.open),false);
  await admin.evaluate(()=>DonPierosWaiter.sync());
  assert.equal(await admin.evaluate(key=>localStorage.getItem(key),`dp_waiter_draft_v1:${boss.user.id}:${secondTable.id}`),null,'Editar un consumo anterior no crea una comanda nueva pendiente.');
  await admin.locator('#dw-custom-price').fill('14000');await admin.locator('[data-dw-quantity="1"]').click();await admin.locator('#dw-line-notes').fill('Observación corregida');await admin.locator('#dw-add-product').click();
  await admin.locator('#dw-product-dialog').waitFor({state:'hidden'});
  const legacySaved=(await serial(()=>db.query('select * from session_items where id=$1',[legacy.id]))).rows[0];
  assert.equal(legacySaved.quantity,2);assert.equal(Number(legacySaved.unit_price),14000);assert.equal(legacySaved.notes,'Observación corregida');
  // Waiters can add a custom product and edit an accepted line directly too.
  await page.setViewportSize({width:390,height:950});await page.locator(`[data-dw-table="${table.id}"]`).click();await page.locator('#dp-waiter-app .dw-tabs [data-dw-tab="menu"]').click();
  await page.locator('#dw-products [data-dw-custom]').click();await page.locator('#dw-custom-name').fill('Jugo especial');await page.locator('#dw-custom-price').fill('7500');await page.locator('#dw-line-notes').fill('Poco hielo');await page.locator('#dw-add-product').click();
  await page.locator('[data-dw-review]').click();await page.locator('#dw-send-order').click();await page.locator('#dw-review-dialog').waitFor({state:'hidden'});
  const waiterCustom=(await serial(()=>db.query("select * from waiter_comandas where items @> '[{\"name\":\"Jugo especial\"}]'::jsonb"))).rows[0];
  assert.equal(waiterCustom.accepted_at,null);
  await admin.locator(`[data-dw-open-comanda="${waiterCustom.id}"]`).waitFor();await admin.locator(`[data-dw-open-comanda="${waiterCustom.id}"]`).click();await admin.locator('[data-dw-accept-order]').click();await admin.locator('#dw-kitchen-dialog').waitFor({state:'hidden'});
  await page.locator('.dw-consumption-lines article').filter({hasText:'Jugo especial'}).waitFor();
  await page.locator('.dw-consumption-lines article').filter({hasText:'Jugo especial'}).locator('strong').first().dblclick();await page.locator('#dw-product-dialog[open]').waitFor();
  await page.locator('#dw-custom-price').fill('8000');await page.locator('#dw-add-product').click();await page.locator('#dw-product-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.dw-consumption-lines')?.textContent.includes('8.000'));
  assert.equal(Number((await serial(()=>db.query("select unit_price from session_items where waiter_comanda_id=$1",[waiterCustom.id]))).rows[0].unit_price),8000);
  console.log('OK: precio opcional del mesero, doble clic en precio con Enter/Tab/Escape, edición directa de consumo/comanda y de productos anteriores, Otro desde ambos roles.');
  console.log('OK: carta y Otro desde la mesa de administración; -/+, observación, precio, recarga, reintento sin duplicados, consumo y edición, PDF 58/80 mm; aceptar cierra el modal solo tras confirmar.');
  assert.deepEqual(errors,[]);console.log('OK: mesero y administrador con base real local, mesas reutilizables tras cierre/eliminación, selección conservada, ediciones antiguas aisladas, reintento cobrado sin reabrir cuentas y móvil/escritorio.');
 }finally{await browser.close();await db.close();}
})().catch(error=>{console.error(error);process.exit(1);});
