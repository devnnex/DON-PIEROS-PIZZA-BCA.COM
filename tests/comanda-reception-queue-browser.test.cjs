const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
test('cola de comandas: las mesas permanecen hasta asignar; los otros avisos hasta abrir',async()=>{
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<body data-page="admin"></body>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const init=async()=>{
   await page.evaluate(()=>{window.user='boss';window.DonPierosAdmin={getUser:()=>user?{id:user}:null,getToken:()=>user?'valid':'',revealReception(){}};window.opened=[];});
   await page.addScriptTag({path:path.join(root,'reception-notices.js')});
   await page.evaluate(()=>{DonPierosReception.register('waiter',async e=>opened.push(e.key));DonPierosReception.register('individual',async e=>opened.push(e.key));});
  };
  await page.goto(`http://127.0.0.1:${server.address().port}`);await init();
  await page.evaluate(()=>{
   const show=(key,kind,minute)=>DonPierosReception.show({key,kind,title:'Mesa 9',detail:key,createdAt:`2026-11-14T20:${minute}:00Z`});
   show('request:second','waiter','02');show('order:sale','individual','03');show('request:first','waiter','01');
   show('request:second','waiter','02');
  });
  const keys=()=>page.locator('.dp-reception-notice').evaluateAll(nodes=>nodes.map(n=>n.dataset.noticeKey));
  assert.deepEqual(await keys(),['request:first','request:second','order:sale']);
  assert.deepEqual(await page.locator('.dp-notice-number').allTextContents(),['Turno 1','Turno 2','Turno 3']);
  const other=await page.context().newPage();
  await other.goto(`http://127.0.0.1:${server.address().port}`);
  await other.evaluate(()=>{window.DonPierosAdmin={getUser:()=>({id:'boss'}),getToken:()=> 'valid'};});
  await other.addScriptTag({path:path.join(root,'reception-notices.js')});
  await other.evaluate(()=>DonPierosReception.register('waiter',async()=>{}));
  await page.evaluate(()=>DonPierosReception.show({key:'request:tabs',kind:'waiter',title:'Mesa 3'}));
  await other.waitForFunction(()=>DonPierosReception.has('request:tabs'));
  await other.evaluate(()=>DonPierosReception.mark('request:tabs','viewed'));
  assert.equal(await page.evaluate(()=>DonPierosReception.has('request:tabs')),true,'Abrir desde otra pestaña no equivale a asignar.');
  await other.evaluate(()=>DonPierosReception.mark('request:tabs','accepted'));
  await page.waitForFunction(()=>!DonPierosReception.has('request:tabs'));
  assert.deepEqual(await keys(),['request:first','request:second','order:sale'],'Completar en otra pestaña sincroniza solo esa comanda.');
  await other.close();
  await page.clock.install();await page.clock.runFor(15*60000);
  await page.evaluate(()=>DonPierosReception.syncRequests([],{label:()=>'',body:()=>''}));
  assert.equal(await page.locator('.dp-reception-notice').count(),3,'El tiempo y una lectura vacía no borran la cola.');
  await page.evaluate(()=>DonPierosReception.mark('request:first','printed'));
  assert.equal(await page.locator('.dp-reception-notice').count(),3,'Imprimir sin asignar no retira el aviso.');
  await page.locator('[data-notice-key="request:first"] button').click();
  assert.equal(await page.locator('.dp-reception-notice').count(),3,'Ver la comanda de mesa conserva su aviso pendiente.');
  await page.evaluate(()=>DonPierosReception.mark('request:first','accepted'));
  assert.deepEqual(await keys(),['request:second','order:sale'],'Asignar retira solamente el aviso de esa comanda.');
  await page.locator('[data-notice-key="request:second"] button').click();
  await page.reload();await init();
  assert.deepEqual(await keys(),['request:second','order:sale'],'Recargar conserva las mesas todavía sin asignar aunque se hayan abierto.');
  await page.evaluate(()=>DonPierosReception.mark('request:second','accepted'));
  assert.deepEqual(await keys(),['order:sale'],'La asignación también retira un aviso sin exigir impresión.');
  await page.locator('[data-notice-key="order:sale"] button').click();
  assert.equal(await page.locator('.dp-reception-notice').count(),0,'Abrir una venta individual también retira su aviso.');
  assert.deepEqual(await keys(),[]);
  await page.evaluate(()=>{
   const key=Object.keys(localStorage).find(key=>key.startsWith('dp-reception-queue-v1:'));
   const records=JSON.parse(localStorage.getItem(key));
   records.push({key:'request:previous-release',kind:'waiter',createdAt:new Date().toISOString(),ordinal:100,complete:true});
   localStorage.setItem(key,JSON.stringify(records));
  });
  await page.reload();await init();
  assert.deepEqual(await keys(),[],'La caché sola no revive avisos anteriores.');
  await page.evaluate(()=>DonPierosReception.show({key:'request:previous-release',kind:'waiter',title:'Mesa 4',accepted:false}));
  assert.deepEqual(await keys(),['request:previous-release'],'Una mesa confirmada como pendiente recupera el aviso que la versión anterior retiró al abrir.');
  await page.evaluate(()=>DonPierosReception.show({key:'request:previous-release',kind:'waiter',title:'Mesa 4',accepted:true}));
  await page.evaluate(()=>DonPierosReception.show({key:'request:first',kind:'waiter',title:'Mesa 9'}));
  assert.deepEqual(await keys(),[],'Una lectura antigua no revive una comanda terminada.');
  await page.evaluate(()=>{DonPierosReception.show({key:'request:failure',kind:'waiter',title:'Mesa 2',action:async()=>{throw Error('offline');}});});
  await page.locator('.dp-reception-notice button').click();
  assert.match(await page.locator('.dp-notice-progress').innerText(),/agregar a la mesa/,'Una apertura fallida conserva el aviso pendiente.');
  await page.evaluate(()=>{user='other';DonPierosReception.register('waiter',async()=>{});});
  assert.deepEqual(await keys(),[],'No se mezclan usuarios.');
  await page.evaluate(()=>{user='boss';DonPierosReception.register('waiter',async()=>{});});
  assert.deepEqual(await keys(),['request:failure']);
  await page.evaluate(()=>{
   const request={id:'failure',request_source:'waiter'};
   DonPierosReception.syncRequests([request],{label:()=>'',body:()=>'',completed:new Set(['failure'])});
  });
  assert.deepEqual(await keys(),[],'Una resolución confirmada retira el aviso aunque llegue una lectura anterior.');
  await page.evaluate(()=>{
   user='mesero';DonPierosAdmin.getUser=()=>({id:user,role:'waiter'});
   DonPierosReception.syncRequests([{id:'otra-mesa',request_source:'waiter'}],{label:()=>'',body:()=>''});
  });
  assert.deepEqual(await keys(),[],'Meseros no reciben avisos de comandas que su sesión no puede abrir.');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
