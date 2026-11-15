const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const {chromium}=require('playwright-core');
const {harness}=require('./helpers/don-pieros-gas.cjs');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'pedidos.js'),'utf8');
const context=vm.createContext({option:(id,name,price)=>({id,name,price}),group:(id,name,type,options,settings)=>({id,name,type,options,...settings})});
vm.runInContext(source.slice(source.indexOf('  function buildModifiers('),source.indexOf('  function applyStoreData('))+source.slice(source.indexOf('  function defaultSelections('),source.indexOf('  function selectedUnitPrice('))+';globalThis.presentation={buildModifiers,clientProductDetails,defaultSelections};',context);
const presentation=context.presentation;
const prepare=(product,catalog)=>presentation.clientProductDetails(product,presentation.buildModifiers(product.modifiers,catalog.toppings));

test('las siete sencillas no piden otra mitad y conservan precio, catálogo administrativo y validación del servidor',()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),before=JSON.stringify(catalog.products),simple=catalog.products.filter(p=>p.category==='Pizzas sencillas');
 assert.equal(simple.length,7);
 for(const product of simple){
  const prepared=prepare(product,catalog),automatic=prepared.modifiers.filter(group=>group.automaticOptionId),selections=presentation.defaultSelections(prepared);
  assert.equal(automatic.length,1);
  assert.equal(prepared.description,'Un solo sabor: '+product.name.replace(/^Pizza /,'')+'.');
  const size=prepared.modifiers.find(group=>/Tamaño/.test(group.source));selections[size.id]=[size.options[0].id];
  assert.equal(automatic[0].options.find(option=>option.id===selections[automatic[0].id][0]).name,product.name.replace(/^Pizza /,''));
  const result=h.call('createOrder',{order:h.order(product,{items:[{productId:product.id,quantity:1,unitPrice:product.price,selectionIds:JSON.parse(JSON.stringify(selections))}]})});
  assert.equal(result.ok,true,result.error);assert.equal(result.total,product.price+2000);
 }
 assert.equal(JSON.stringify(catalog.products),before,'No se reescribe el catálogo ni sus precios.');
});

test('conserva todos los ingredientes y textos nuevos del administrador; combinada mantiene los dos sabores y cinco tamaños',()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog');
 for(const product of catalog.products.filter(p=>p.category!=='Pizzas sencillas'&&p.name!=='Pizza combinada'))assert.equal(prepare(product,catalog).description,String(product.description||'').trim());
 const hawaiana=catalog.products.find(p=>p.name==='Pizza Hawaiana');
 const edited={...hawaiana,description:'Jamón, piña, queso y salsa de tomate. Sin cebolla; opción sin queso.'};
 assert.equal(prepare(edited,catalog).description,edited.description);
 const combined=prepare(catalog.products.find(p=>p.name==='Pizza combinada'),catalog),flavors=combined.modifiers.find(group=>group.min===2);
 assert.equal(flavors.required,true);assert.equal(flavors.max,2);assert.equal(flavors.automaticOptionId,undefined);
 assert.equal(presentation.defaultSelections(combined)[flavors.id].length,0);
 for(const size of ['pizzeta','Mini','Mediana','Maxi','Super maxi'])assert.ok(combined.description.toLowerCase().includes(size.toLowerCase()));
 assert.match(combined.description,/mitad y mitad/);
 const missing={...catalog,toppings:catalog.toppings.filter(t=>!(t.kind==='Sabor pizza sencilla'&&t.name==='Hawaiana'))};
 assert.equal(prepare(hawaiana,missing).modifiers.some(group=>group.automaticOptionId),false,'No inventa opciones ni reemplaza un sabor no disponible.');
});

test('cliente en escritorio y móvil: sencilla solo pide tamaño; combinada exige dos sabores; editar un carrito previo conserva la otra mitad',async()=>{
 const backend=harness({seedMenu:true}),catalog=backend.call('dp_get_catalog');
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [1440,390]){
  const browserContext=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await browserContext.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/vendor/supabase.js',route=>route.abort());
  await page.route('https://script.google.com/**',route=>route.fulfill({json:catalog}));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'domcontentloaded'});await page.locator('#welcome-close').click();
  await page.waitForFunction(()=>document.querySelector('#catalog-connection').hidden);
  await page.locator('[data-category="Pizzas sencillas"]').click();
  const simple=catalog.products.filter(p=>p.category==='Pizzas sencillas');
  for(const product of simple){
   await page.locator(`[data-add="${product.id}"]`).click();
   assert.equal(await page.locator('#product-detail .modifier').count(),1);
   assert.doesNotMatch(await page.locator('.detail-head p').innerText(),/segunda mitad|Primera mitad/);
   await page.locator('.option').filter({hasText:'Mediana'}).click();
   assert.equal(await page.locator('#add-product').getAttribute('aria-disabled'),'false');
   if(product.name==='Pizza Hawaiana'){
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await page.locator('#product-overlay .sheet').screenshot({path:path.join(root,`artifacts/carta-sencilla-${width}.png`)});
    await page.locator('#add-product').click();
    const item=await page.evaluate(()=>JSON.parse(localStorage.getItem('don-pieros-cart-v2'))[0]);
    assert.equal(item.selections[product.modifiers[1].id][0],catalog.toppings.find(t=>t.kind==='Sabor pizza sencilla'&&t.name==='Hawaiana').id);
   }else await page.locator('#product-overlay .sheet-close').click();
  }
  await page.evaluate(({product,flavor})=>{
   const item=JSON.parse(localStorage.getItem('don-pieros-cart-v2'))[0];item.selections[product.modifiers[1].id]=[flavor.id];item.selectionLabels[product.modifiers[1].id]=[flavor.name];
   localStorage.setItem('don-pieros-cart-v2',JSON.stringify([item]));
  },{product:simple.find(p=>p.name==='Pizza Hawaiana'),flavor:catalog.toppings.find(t=>t.kind==='Sabor pizza sencilla'&&t.name==='Napolitana')});
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#welcome-close').click();await page.locator('#nav-cart').click();await page.locator('[data-edit]').click();
  assert.equal(await page.locator('#product-detail .modifier').count(),2,'Una combinación guardada anteriormente sigue visible al editarla.');
  assert.equal(await page.locator('.option').filter({hasText:'Napolitana'}).locator('input').isChecked(),true);
  await page.locator('#product-overlay .sheet-close').click();
  await page.locator('[data-category="Pizzas especiales"]').click();
  const combo=catalog.products.find(p=>p.name==='Pizza combinada');await page.locator(`[data-add="${combo.id}"]`).click();
  await page.locator('.option').filter({hasText:'Mini ·'}).click();
  const flavors=page.locator('.modifier').filter({hasText:'Elige 2 sabores'}).locator('input');
  await flavors.nth(0).check();assert.equal(await page.locator('#add-product').getAttribute('aria-disabled'),'true');
  await flavors.nth(1).check();assert.equal(await page.locator('#add-product').getAttribute('aria-disabled'),'false');
  assert.equal(await page.locator('#product-overlay').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  assert.deepEqual(errors,[]);await browserContext.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
