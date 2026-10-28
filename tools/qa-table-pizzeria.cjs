const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const table={id:'11111111-1111-4111-8111-111111111111',table_number:2,table_name:'MESA 2',qr_code:'mesa-2',is_active:true};
  const session={id:'22222222-2222-4222-8222-222222222222',table_id:table.id,status:'open',subtotal:25000,total:25000};
  const line={id:'33333333-3333-4333-8333-333333333333',session_id:session.id,table_id:table.id,item_name:'Pizza hawaiana',quantity:1,unit_price:25000,status:'served'};
  const requests=Array.from({length:5},(_,i)=>({id:'old-song-'+i,table_id:table.id,session_id:session.id,request_type:'other',message:'Mesa 2 solicita la canción: tema '+i,status:'pending',created_at:new Date().toISOString()}));
  const business={business_name:'Don Pieros Pizza',subtitle:'Pizza para compartir',logo_url:'images/don-pieros-logo.png',currency:'COP',accent_color:'#111111',client_bill_enabled:true,client_waiter_enabled:true,client_menu_enabled:true,client_chat_enabled:true};
  const messages=[],errors=[];
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>route.fulfill({json:{ok:true,shift:null,shifts:[],items:[],everInitialized:true}}));
  await context.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'app.js'),'utf8').replace('  return { init };','  return { init,state,cachedQrDataUrl,drawQrPdfCard,qrTextForTable,renderClientQueue };')+'\nwindow.tableQa=App;'}));
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{
   const req=route.request(),url=new URL(req.url()),rpc=url.pathname.split('/').pop(),args=req.postData()?JSON.parse(req.postData()):{};let result=[];
   if(rpc==='get_bootstrap_data')result={business,tables:[table],categories:[],items:[]};
   if(rpc==='get_current_user')result={id:'boss-id',role:'boss',full_name:'Jefe',username:'jefe',is_active:true,permissions:[]};
   if(rpc==='get_admin_snapshot')result={requests:[],sessions:[]};
   if(rpc==='dp_setup_status')result=false;
   if(rpc==='business_settings'){if(req.method()==='PATCH')Object.assign(business,args);result=business;}
   if(rpc==='get_client_table_state'||rpc==='get_client_snapshot')result={session,sessionItems:[line],requests};
   if(rpc==='table_sessions')result=url.searchParams.get('limit')?[session]:session;
   if(rpc==='session_items')result=[line];if(rpc==='service_requests')result=requests;
   if(rpc==='get_service_request_queue')result={requests:[{id:'queue',kind:'service',position:1},...requests.map(r=>({id:r.id,kind:'song',position:2}))]};
   if(rpc==='get_session_payments')result={payments:[]};
   if(rpc==='list_chat_messages')result={messages};
   if(rpc==='send_chat_message'){const message={id:args.p_message_id,session_id:session.id,sender_type:'client',body:args.p_body,created_at:new Date().toISOString()};messages.push(message);result={message};}
   if(rpc==='create_service_requests_batch')result={results:args.requests.map(event=>{const row={...event,id:event.request_id,status:'pending',created_at:new Date().toISOString()};requests.push(row);return{request:row};})};
   if(rpc==='pos_get_menu_cards')result=[];
   return route.fulfill({json:result});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/mesa.html?mesa=mesa-2&page=client');
  await page.locator('#tablePicker').getByText('MESA 2',{exact:false}).waitFor();await page.waitForFunction(()=>tableQa.state.currentSession?.id);
  assert.equal(await page.locator('#assistantEyebrow').textContent(),'Agente pizzería');
  assert.equal(await page.locator('#assistantEyebrow').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');
  assert.equal(await page.locator('[data-song-request],.song-turn-notice,#songLimitNotice,[data-queue-kind="song"]').count(),0);
  assert.doesNotMatch(await page.locator('body').innerText(),/agente de bar|canasta de cerveza|ron medell|whisky|cigarrillo|5 canciones|cámaras/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(root,'artifacts/mesa-pizzeria-movil.png'),fullPage:true});
  await page.locator('#focusTableChat').click();assert.equal(await page.locator('#assistantInput').evaluate(n=>document.activeElement===n),true);
  assert.equal(await page.locator('#focusTableChat svg').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');
  await page.keyboard.type('Queremos una pizza hawaiana mediana');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>tableQa.state.chatMessages.some(m=>m.body==='Queremos una pizza hawaiana mediana'&&!m.pending));
  assert.ok(requests.some(r=>r.message.includes('pizza hawaiana mediana')),'El pedido llega a solicitudes incluso con cinco canciones antiguas.');
  await page.locator('[data-request="waiter"]').click();await page.waitForFunction(()=>tableQa.state.clientRequests.some(r=>r.request_type==='waiter'&&r.status==='pending'));
  await page.locator('[data-request="bill"]').click();await page.locator('#billChat').waitFor({state:'visible'});assert.match(await page.locator('#billChat').innerText(),/Pizza hawaiana/);
  await page.locator('[data-close-bill]').click();
  await page.locator('#openMenuCards').click();await page.locator('#menuCardsViewer[open]').waitFor();await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,'artifacts/mesa-pizzeria-desktop.png'),fullPage:true});
  await page.addScriptTag({path:path.join(process.env.TEMP,'don-pieros-qrcode.min.js')});
  await page.addScriptTag({path:path.join(process.env.TEMP,'don-pieros-jsqr.js')});
  await page.addScriptTag({path:path.join(root,'vendor/jspdf.umd.min.js')});
  const qr=await page.evaluate(async()=>{
   const urls=[tableQa.qrTextForTable(tableQa.state.currentTable),'https://devnnex.github.io/DON-PIEROS-PIZZA-BCA.COM/mesa.html?mesa='+crypto.randomUUID()+'&page=client'];
   const results=[];let preview;
   for(const url of urls)for(const size of [420,720,1000]){
    const data=await tableQa.cachedQrDataUrl(url,size),img=new Image();img.src=data;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;let ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);let pixels=ctx.getImageData(0,0,size,size);
    const decoded=jsQR(pixels.data,size,size)?.data;
    const center=ctx.getImageData(size*.43,size*.43,size*.14,size*.14).data;let red=0;for(let i=0;i<center.length;i+=4)if(center[i]>150&&center[i+1]<130&&center[i+2]<130)red++;
    results.push({url,size,decoded,red,corner:[...pixels.data.slice(0,4)]});if(size===1000)preview=data;
   }
   const pdf=new jspdf.jsPDF({unit:'mm',format:'a4'}),calls=[],round=pdf.roundedRect,text=pdf.text;
   pdf.roundedRect=function(...args){calls.push({type:'frame',args,color:this.getDrawColor()});return round.apply(this,args);};
   pdf.text=function(value,...args){calls.push({type:'text',value,size:this.getFontSize(),font:this.getFont().fontStyle,color:this.getTextColor()});return text.call(this,value,...args);};
   await tableQa.drawQrPdfCard(pdf,tableQa.state.currentTable,11,8);
   return {results,calls,preview,pdf:pdf.output('datauristring').split(',')[1]};
  });
  for(const item of qr.results){assert.equal(item.decoded,item.url);assert.ok(item.red>5);assert.deepEqual(item.corner,[255,255,255,255]);}
  const isBrandRed=color=>[220,45,40].every((value,index)=>Math.abs(parseInt(color.slice(1+index*2,3+index*2),16)-value)<=2);
  const frame=qr.calls.find(c=>c.type==='frame');assert.equal(frame.args[2],90);assert.equal(frame.args[3],90);assert.ok(isBrandRed(frame.color));
  assert.ok(isBrandRed(qr.calls.find(c=>c.value==='DON PIEROS PIZZA').color));
  const footer=qr.calls.find(c=>c.value==='ORDENA Y SOLICITA ATENCION');assert.ok(footer.size>=11);assert.equal(footer.font,'bold');assert.ok(qr.calls.some(c=>c.value==='DESDE TU MESA'));
  fs.writeFileSync(path.join(root,'artifacts/qr-pizzeria.png'),Buffer.from(qr.preview.split(',')[1],'base64'));
  fs.writeFileSync(path.join(root,'artifacts/qr-pizzeria-9x9.pdf'),Buffer.from(qr.pdf,'base64'));
  const admin=await context.newPage();admin.on('pageerror',error=>errors.push(error.message));await admin.addInitScript(()=>localStorage.setItem('don_pieros_admin_token','boss'));
  await admin.goto('http://127.0.0.1:4173/admin.html#brand');await admin.locator('#salesShiftDialog[open]').waitFor();await admin.locator('#salesShiftDialog [aria-label="Cerrar"]').click();
  const switches=admin.locator('#clientActionsSettings input[role="switch"]');assert.equal(await switches.count(),4);
  await admin.screenshot({path:path.join(root,'artifacts/marca-opciones-qr.png'),fullPage:true});
  for(const field of ['client_waiter_enabled','client_bill_enabled','client_menu_enabled','client_chat_enabled']){
   await admin.locator(`#clientActionsSettings input[name="${field}"]`).locator('..').click();
   await admin.waitForFunction(key=>tableQa.state.business[key]===false&&!tableQa.state.clientActionSaves?.has(key),field);
   assert.equal(business[field],false);
  }
  // A new anonymous browser sees the persisted settings, not the staff login.
  await page.evaluate(()=>localStorage.removeItem('don_pieros_admin_token'));await page.reload();
  await page.waitForFunction(()=>tableQa.state.business?.client_chat_enabled===false);
  assert.equal(await page.locator('.quick-actions').isVisible(),false);assert.equal(await page.locator('.assistant-panel').isVisible(),false);
  for(const field of ['client_waiter_enabled','client_bill_enabled','client_menu_enabled','client_chat_enabled']){
   await admin.locator(`#clientActionsSettings input[name="${field}"]`).locator('..').click();
   await admin.waitForFunction(key=>tableQa.state.business[key]===true&&!tableQa.state.clientActionSaves?.has(key),field);
  }
  await page.reload();await page.waitForFunction(()=>tableQa.state.business?.client_chat_enabled===true);
  assert.equal(await page.locator('.quick-actions .request-btn:visible').count(),4);assert.equal(await page.locator('.assistant-panel').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('Mesa: QR, chat con foco, pedido, mesero, cuenta y carta OK; seis QR con logo decodificados; tarjeta roja de 90 × 90 mm y pie grande en negrita OK.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
