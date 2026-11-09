const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const snapshot={window:{}};require('node:vm').runInNewContext(read('catalog-snapshot.js'),snapshot);
const catalog=snapshot.window.DonPierosCatalogSnapshot.catalog;
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webmanifest':'application/manifest+json'};
async function serverFor(run){
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',(types[path.extname(file)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await run('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}
}
for(const engine of ['chromium','webkit'])test(engine+': primera visita muestra carta antes de la red; sigue usable sin almacenamiento, realtime ni APIs opcionales',async()=>{
 const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true,...(process.env.WEBKIT_PATH?{executablePath:process.env.WEBKIT_PATH}:{})}));
 try{await serverFor(async base=>{
  for(const restricted of [false,true]){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],held=[];let reads=0;
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);
   if(restricted)await context.addInitScript(()=>{
    Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});
    window.structuredClone=undefined;window.AbortController=undefined;
   });
   await context.route('**/vendor/supabase.js',route=>route.abort());
   await context.route('https://script.google.com/**',route=>{reads++;held.push(route);});
   await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelectorAll('#products .product-card').length>0);
   assert.equal(held.length,1,'Precarga y pantalla comparten la descarga');
   assert.equal(await page.locator('#products .product-card').count(),catalog.products.length,'Carta incluida incluso en primera visita sin caché');
   await page.locator('#welcome-close').click();
   const simple=catalog.products.find(item=>item.available&&!(item.modifiers||[]).length);
   await page.locator('[data-add="'+simple.id+'"]').click();await page.locator('#add-product').click();
   assert.equal(await page.locator('.cart-count').first().textContent(),'1');
   await held.shift().fulfill({json:catalog});
   await page.waitForFunction(()=>document.querySelector('#catalog-connection').hidden);
   await page.evaluate(()=>DonPierosPerformance.loadCatalog());assert.equal(reads,1);
   assert.deepEqual(errors,[]);
   await context.close();
  }
 });}finally{await browser.close();}
});
test('conexión fallida conserva carta; Reintentar actualiza precio y disponibilidad sin recargar',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{await serverFor(async base=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let failing=true,reads=0;
  await context.route('https://script.google.com/**',route=>{reads++;return failing?route.abort():route.fulfill({json:{...catalog,products:catalog.products.map((item,index)=>index?item:{...item,price:12345,available:false})}});});
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.locator('#welcome-close').click();
  await page.locator('#catalog-connection').waitFor();assert.equal(reads,2,'Reintento automático acotado');
  assert.equal(await page.locator('#products .product-card').count(),catalog.products.length);
  failing=false;await page.locator('[data-retry-catalog]').click();
  await page.waitForFunction(()=>document.querySelector('#catalog-connection').hidden);
  assert.equal(await page.locator('[data-add="'+catalog.products[0].id+'"]').isDisabled(),true);
  assert.equal(reads,3);await context.close();
 });}finally{await browser.close();}
});
test('Menú online muestra la copia al abrir; el diseño nuevo afecta solamente Tamaños y opciones',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{await serverFor(async base=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),held=[];page.setDefaultTimeout(8000);
  await context.route('**/admin.html',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:read('admin.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
  await context.route('https://script.google.com/**',route=>held.push(route));
  await page.goto(base+'/admin.html',{waitUntil:'domcontentloaded'});
  await page.addStyleTag({path:path.join(root,'style.css')});
  const css=read('online-admin.css'),premiumStart=css.indexOf('/* Tarjetas del cat');
  await page.addStyleTag({content:css.slice(0,premiumStart)});
  for(const file of ['config.js','catalog-snapshot.js','performance.js','product-images.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.evaluate(()=>{
   document.body.classList.add('admin-authenticated');document.body.dataset.userRole='boss';
   window.DonPierosAdmin={getUser:()=>({id:'qa',role:'boss'}),getToken:()=> 'qa',db:{rpc:async()=>({data:false})}};
   window.DonPierosDates={dateTime:String};window.DonPierosLanguage={message:String};
  });
  await page.addScriptTag({content:read('online-admin.js').replace('  mount();setInterval(tick,3000);void tick();','  mount();window.catalogLoadForQA=loadCatalog;')});
  await page.evaluate(()=>{document.querySelector('#webmenu').classList.add('section-active');void catalogLoadForQA();});
  await page.waitForFunction(()=>document.querySelectorAll('#dp-catalog-list .dp-menu-card').length>0);
  assert.equal(held.length,1,'Una verificacion privada en segundo plano');
  const productStyles=()=>page.locator('#dp-catalog-list .dp-menu-card').first().evaluate(card=>[card,card.querySelector('h3'),card.querySelector('[data-dp-edit]')].map(el=>{const s=getComputedStyle(el);return [s.padding,s.backgroundImage,s.backgroundColor,s.borderColor,s.fontSize,s.color];}));
  const before=await productStyles();await page.addStyleTag({content:css.slice(premiumStart)});assert.deepEqual(await productStyles(),before,'Productos conserva exactamente sus estilos anteriores');
  await page.locator('[data-catalog="toppings"]').click();
  assert.equal(await page.locator('#webmenu').getAttribute('data-catalog-kind'),'toppings');
  assert.equal(await page.locator('#dp-catalog-list [data-dp-edit]').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(247, 242, 230)');
  await held.shift().fulfill({json:catalog});
  await page.waitForFunction(()=>document.querySelector('#dp-menu-status').textContent.startsWith('Menú actualizado'));
  assert.equal(await page.evaluate(()=>DonPierosPerformance.read('admin-catalog:qa',10000,'local').products.length),catalog.products.length);
  await context.close();
 });}finally{await browser.close();}
});
