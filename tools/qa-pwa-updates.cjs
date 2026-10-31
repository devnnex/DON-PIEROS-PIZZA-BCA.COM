const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 let revision='qa1',visits=0;
 const updater=fs.readFileSync('pwa-updates.js'),worker=fs.readFileSync('service-worker.js','utf8');
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','max-age=600');
  if(url.pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
  if(url.pathname==='/service-worker.js'){res.setHeader('Content-Type','text/javascript');return res.end(worker.replaceAll('20261030-v33',revision));}
  if(url.pathname==='/pwa-updates.js'){res.setHeader('Content-Type','text/javascript');return res.end(updater);}
  if(url.pathname==='/app-release.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version:revision}));}
  if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`window.assetVersion='${revision}';`);}
  visits++;res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta name="app-version" content="${revision}"><title>PWA QA</title><script defer src="pwa-updates.js?v=1"></script><script defer src="fixture.js?v=${revision}"></script><p id="phone">${revision==='qa1'?'3102241444':'3138367511 · 3185536604'}</p><form id="draft"><input name="customer"></form>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/index.html');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(visits,1,'La primera instalación no recarga en bucle');
  await page.evaluate(()=>localStorage.setItem('pedido-protegido','conservar'));
  await page.locator('input').fill('Nombre sin guardar');revision='qa2';
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(700);assert.equal(await page.locator('input').inputValue(),'Nombre sin guardar');assert.equal(visits,1,'No interrumpe un formulario');
  await page.evaluate(()=>{document.querySelector('form').remove();window.dispatchEvent(new Event('don-pieros-update-ready'));});
  await page.waitForFunction(()=>document.querySelector('meta[name=app-version]').content==='qa2',{},{timeout:10000}).catch(async error=>{console.log(await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {version:document.querySelector('meta[name=app-version]').content,url:location.href,active:r?.active?.state,installing:r?.installing?.state,waiting:r?.waiting?.state,online:navigator.onLine,hidden:document.hidden};}));throw error;});
  assert.match(await page.locator('#phone').innerText(),/3138367511.*3185536604/);
  await page.waitForFunction(()=>assetVersion==='qa2');
  assert.equal(await page.evaluate(()=>localStorage.getItem('pedido-protegido')),'conservar');
  const stableVisits=visits;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.waitForTimeout(300);assert.equal(visits,stableVisits,'Una versión igual no recarga');
  revision='qa3';await page.close();const reopened=await context.newPage();await reopened.goto(base+'/index.html');
  await reopened.waitForFunction(()=>document.querySelector('meta[name=app-version]').content==='qa3'&&assetVersion==='qa3');
  await reopened.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await reopened.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing&&!r.waiting;});
  await reopened.reload();
  await context.setOffline(true);await reopened.reload();assert.match(await reopened.locator('#phone').innerText(),/3138367511/);assert.equal(await reopened.evaluate(()=>assetVersion),'qa3');
  assert.deepEqual(errors,[]);console.log('OK: instalación existente, reabrir, volver a app, sin bucles, formulario protegido, recursos nuevos y copia sin conexión.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
