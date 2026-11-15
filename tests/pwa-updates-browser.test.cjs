const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const updater=fs.readFileSync(path.join(__dirname,'../pwa-updates.js'),'utf8');

test('cada navegador detecta la publicación automáticamente, incluso sin service worker, y espera a terminar la lectura o edición',async()=>{
 let marker='qa1',published='qa1';
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/pwa-updates.js'){res.setHeader('Content-Type','text/javascript');res.end(updater);return;}
  if(url.pathname==='/app-release.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:marker}));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><meta name="app-version" content="${published}"><meta name="viewport" content="width=device-width,initial-scale=1"><script defer src="pwa-updates.js"></script><main><p>Versión ${published}</p><details><summary>Ver desglose</summary><p>Productos</p></details><form id="draft"><input name="customer"></form></main>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const contexts=[],pages=[],errors=[];
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.addInitScript(({unsupported})=>{
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:unsupported?undefined:{register:async()=>{throw Error('Registration blocked by browser policy');},addEventListener(){}}});
    // Accelerate the production polling clock without sending a user event.
    let elapsed=0;const nativeNow=Date.now.bind(Date),nativeInterval=window.setInterval.bind(window);
    Date.now=()=>nativeNow()+elapsed;
    window.setInterval=(callback,ms,...args)=>nativeInterval(ms===30000?()=>{elapsed+=30000;callback(...args);}:callback,ms===30000?250:ms,...args);
   },{unsupported:width<640});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/admin.html');
   await page.evaluate(()=>localStorage.setItem('venta-pendiente','conservar'));
   contexts.push(context);pages.push(page);
  }
  marker='qa2';
  await new Promise(resolve=>setTimeout(resolve,700));
  for(const page of pages)assert.equal(await page.locator('meta[name="app-version"]').getAttribute('content'),'qa1','El marcador adelantado no provoca una recarga con HTML antiguo.');
  await pages[0].locator('summary').click();
  await pages[1].locator('input').fill('Cliente sin guardar');
  published='qa2';
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(await pages[0].locator('details').evaluate(n=>n.open),true,'Leer un desglose pospone la recarga.');
  assert.equal(await pages[0].locator('meta[name="app-version"]').getAttribute('content'),'qa1');
  assert.equal(await pages[1].locator('input').inputValue(),'Cliente sin guardar','Editar un formulario pospone la recarga.');
  await pages[0].locator('summary').click();
  await pages[1].evaluate(()=>document.querySelector('form').reset());
  for(const page of pages){
   await page.waitForFunction(()=>document.querySelector('meta[name="app-version"]').content==='qa2');
   assert.equal(await page.evaluate(()=>localStorage.getItem('venta-pendiente')),'conservar');
  }
  await pages[0].evaluate(()=>{window.DonPierosRemotePrint={busy:true};});
  marker=published='qa3';
  await pages[1].waitForFunction(()=>document.querySelector('meta[name="app-version"]').content==='qa3');
  await new Promise(resolve=>setTimeout(resolve,600));
  assert.equal(await pages[0].locator('meta[name="app-version"]').getAttribute('content'),'qa2','Una impresión pendiente pospone la actualización.');
  await pages[0].evaluate(()=>{DonPierosRemotePrint.busy=false;});
  for(const page of pages)await page.waitForFunction(()=>document.querySelector('meta[name="app-version"]').content==='qa3');
  let navigations=0;pages[0].on('framenavigated',()=>navigations++);
  await new Promise(resolve=>setTimeout(resolve,600));
  assert.equal(navigations,0,'Una versión ya aplicada no se recarga en bucle.');
  assert.deepEqual(errors,[]);
  for(const context of contexts)await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
