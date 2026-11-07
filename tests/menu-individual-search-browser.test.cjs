const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{randomUUID}=require('node:crypto');
const {chromium}=require('playwright-core'),{harness}=require('./helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..');
test('index y admin ordenan categorías y Todos; el buscador encuentra clientes de caja/mesero sin cambiar tarjetas',async()=>{
 const h=harness({seedMenu:true});
 for(const category of ['Pizzetas especiales','Pizzetas sencillas'])h.save('products',{name:category+' de prueba',category,price:5000,available:true,modifiers:[]});
 const catalog=h.call('dp_get_catalog'),categoryById=Object.fromEntries(catalog.products.map(p=>[p.id,p.category]));
 const now=new Date().toISOString(),id=randomUUID(),local={id,local_only:true,sale_channel:'walk_in',status:'open',payer_name:'José Caja',customer_phone:'3001234567',opened_at:now,created_at:now,updated_at:now,session_items:[{id:randomUUID(),item_name:'Postre',quantity:1,unit_price:5000,status:'served'}]};
 assert.equal(h.call('dp_save_individual_sale',{p_id:id,p_operation_id:randomUUID(),p_version:0,p_action:'save',p_session:local}).ok,true);
 const staff=h.call('dp_create_staff_order',{order:{requestId:randomUUID(),customerName:'Ana Mesero',phone:'3117654321',items:[{productId:randomUUID(),custom:true,name:'Postre',quantity:1,unitPrice:5000,selectionIds:{},fulfillment:'dinein',notes:''}]}},'waiter');assert.equal(staff.ok,true,staff.error);
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),errors=[];
  await context.addInitScript(()=>{localStorage.setItem('don_pieros_admin_token','boss');localStorage.setItem('waiter_alarm_enabled','0');});
  await context.route('https://**/*',route=>route.abort());await context.routeWebSocket('wss://**/*',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>{const req=route.request();if(req.method()==='GET')return route.fulfill({json:{ok:true}});const body=req.postDataJSON();return route.fulfill({json:body.action==='bootstrap'?{ok:true}:h.call(body.action,body.payload||body,body.authToken||'boss')});});
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',route=>{const rpc=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({json:rpc==='get_current_user'?{id:'boss-id',role:'boss',full_name:'Jefe',is_active:true}:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP'},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{sessions:[],requests:[]}:rpc==='dp_list_waiter_comandas'?{orders:[]}:rpc==='dp_setup_status'?false:[]});});
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin);await page.locator('#welcome-close').click();await page.locator('#categories [data-category="Bebidas"]').waitFor();
  const categories=await page.locator('#categories [data-category]').allTextContents();
  assert.deepEqual(categories.slice(1,6),['Pizzas especiales','Pizzas sencillas','Pizzetas especiales','Pizzetas','Pizzetas sencillas']);assert.equal(categories.at(-1),'Bebidas');
  const assertBeveragesLast=async locator=>{const ids=await locator.evaluateAll(nodes=>nodes.map(node=>node.dataset.product||node.dataset.dwProduct));const names=ids.map(id=>categoryById[id]);const first=names.indexOf('Bebidas');assert.ok(first>0);assert.ok(names.slice(first).every(name=>name==='Bebidas'));};
  await assertBeveragesLast(page.locator('#products [data-product]'));
  await page.locator('[data-category="Pizzas sencillas"]').click();await page.locator('[data-category="Todo el menú"]').click();await assertBeveragesLast(page.locator('#products [data-product]'));
  await page.goto(origin+'/admin.html#dashboard');await page.locator('#staffIndividualSalesGrid [data-dp-order]').waitFor();await page.locator('#individualSalesGrid [data-open-individual]').waitFor();
  await page.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  const search=page.locator('#individualSalesSearch');assert.equal(await search.isVisible(),true);assert.equal(await page.locator('#individualSalesCount').innerText(),'2');
  await search.fill('jose');await page.waitForFunction(()=>!document.querySelector('#staffIndividualSalesGrid [data-dp-order]'));
  assert.match(await page.locator('#individualSalesGrid').innerText(),/José Caja/);
  await search.fill('311 765');await page.locator('#staffIndividualSalesGrid [data-dp-order]').waitFor();assert.equal(await page.locator('#individualSalesGrid [data-open-individual]').count(),0);assert.match(await page.locator('#staffIndividualSalesGrid').innerText(),/Ana Mesero/);
  await search.fill('nadie');await page.waitForFunction(()=>!document.querySelector('#staffIndividualSalesGrid [data-dp-order]'));assert.match(await page.locator('#individualSalesGrid').innerText(),/No hay ventas individuales/);assert.equal(await page.locator('#individualSalesCount').innerText(),'2');
  await search.fill('');await page.locator('#individualSalesGrid [data-open-individual]').waitFor();await page.locator('#staffIndividualSalesGrid [data-dp-order]').waitFor();
  assert.equal(await page.locator('#individualSalesPanel').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  if(width>1000){const layout=await page.evaluate(()=>{const search=document.querySelector('#individualSalesSearch').getBoundingClientRect(),button=document.querySelector('[data-new-individual]').getBoundingClientRect();return {gap:button.left-search.right,top:Math.abs(button.top-search.top)};});assert.ok(layout.gap>=0&&layout.top<5,'Buscador y Nueva venta comparten fila en escritorio.');}
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.locator('#individualSalesPanel').screenshot({path:path.join(root,`artifacts/clientes-buscador-${width}.png`)});
  await page.evaluate(()=>{document.querySelector('#webmenu').hidden=false;});await page.locator('#dp-menu-category option[value="Bebidas"]').waitFor({state:'attached'});
  const options=await page.locator('#dp-menu-category option').allTextContents();assert.equal(options.at(-1),'Bebidas');assert.deepEqual(options.slice(1,6),categories.slice(1,6));
  await page.locator('[data-new-individual]').click();await page.locator('#dw-manager-products [data-dw-product]').first().waitFor();
  const managerCategories=await page.locator('#dw-manager-categories [data-dw-manager-category]').allTextContents();assert.equal(managerCategories.at(-1),'Bebidas');assert.deepEqual(managerCategories.slice(1,6),categories.slice(1,6));
  await assertBeveragesLast(page.locator('#dw-manager-products [data-dw-product]'));
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
