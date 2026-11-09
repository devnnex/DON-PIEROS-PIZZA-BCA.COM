const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const app=read('app.js').replace('  return { init };','  return { init, state, waitForAdminLogin, showAdminSection };').replace('document.addEventListener("DOMContentLoaded", App.init);','window.staffTest=App;');
const runtime=`window.DON_PIEROS_CONFIG={supabaseUrl:'https://fixture.supabase.co',appsScriptUrl:'https://script.google.com/macros/s/fixture/exec'};\n`+read('performance.js')+'\n'+read('staff-session.js')+'\n'+app+`\n
window.DON_PIEROS_CONFIG={appsScriptUrl:'https://script.google.com/macros/s/fixture/exec'};
window.DonPierosAdmin.notify=(text,tone)=>{window.lastNotice={text,tone};};
window.copied=[];
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied.push(text);}}});
const staffUser=role=>({id:role,role,full_name:role==='waiter'?'Mesero QA':'Administrador QA',username:role,is_active:true,permissions:['dashboard']});
Object.assign(staffTest.state,{page:'admin',business:{business_name:'Don Pieros Pizza',subtitle:'Servicio a la mesa'},sb:{
 setAuthToken:()=>{},rpc:async(name,payload)=>({data:name==='login'?{token:payload.username,expires_at:new Date(DonPierosStaffSession.nextCutoff()).toISOString(),user:staffUser(payload.username==='mesero'?'waiter':'admin')}:name==='getCurrentUser'?staffUser(payload.auth_token==='mesero'?'waiter':'admin'):null})
}});
void staffTest.waitForAdminLogin().then(()=>{
 staffTest.showAdminSection(location.hash.slice(1)||'dashboard');
 document.querySelectorAll('.js-business-name').forEach(node=>node.textContent='Don Pieros Pizza');
 document.querySelector('#realtimeStatus').textContent='En vivo';document.querySelector('#realtimeStatus').className='live-status live';
});
`;
test('navegador: rutas por rol, sesiones, copiar cuenta/llave y alineación responsive',async()=>{
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1);
  if(['admin.html','mesero.html'].includes(name)){
   res.setHeader('Content-Type','text/html;charset=utf-8');
   res.end(read(name).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>','<link rel="stylesheet" href="/style.css"></head>').replace('</body>','<script src="/test-runtime.js"></script><script src="/admin-payment-shortcuts.js"></script></body>'));
  }else if(name==='test-runtime.js'){res.setHeader('Content-Type','application/javascript');res.end(runtime);}
  else if(/\.css$|\.png$|\.js$/.test(name)&&fs.existsSync(path.join(root,name))){res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'image/png');res.end(fs.readFileSync(path.join(root,name)));}
  else{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  const base='http://127.0.0.1:'+server.address().port;
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);
   let catalogReads=0;
   await context.route('https://script.google.com/**',route=>{catalogReads++;return route.fulfill({json:{ok:true,products:[],toppings:[],neighborhoods:[],payments:[
    {name:'Bancolombia',account_value:'01234567890',available:true},
    {name:'Llave Bre-B',account_value:'@DONPIEROS',available:true},
    {name:'Desactivado',account_value:'999',available:false},
    {name:'Efectivo',account_value:'',available:true}
   ]}});});
   await page.goto(base+'/admin.html');
   await page.locator('#loginForm [name=username]').fill('admin');await page.locator('#loginForm [name=pin]').fill('1234');await page.locator('#loginForm button[type=submit]').click();
   await page.waitForFunction(()=>document.body.dataset.userRole==='admin');
   await page.locator('.admin-payment-copy').first().waitFor();
   assert.equal(catalogReads,1,'Precarga y botones comparten una sola consulta pública');
   await page.evaluate(()=>Promise.all(Array.from({length:5},()=>DonPierosPerformance.loadCatalog())));
   assert.equal(catalogReads,1,'La carta precargada se reutiliza sin consultas adicionales');
   await page.evaluate(()=>dispatchEvent(new CustomEvent('donpieros-payment-methods-change',{detail:[{id:'bank',name:'Cuenta editada',account_value:'009988',available:true}]})));
   assert.equal(await page.locator('.admin-payment-copy strong').textContent(),'009988');
   await page.locator('.admin-payment-copy').click();assert.equal((await page.evaluate(()=>copied)).at(-1),'009988');
   await page.evaluate(()=>dispatchEvent(new CustomEvent('donpieros-payment-methods-change',{detail:[{id:'bank',name:'Cuenta editada',account_value:'009988',available:false}]})));
   assert.equal(await page.locator('#adminPaymentShortcuts').isVisible(),false,'Desactivar el medio lo retira inmediatamente de Inicio');
   await page.evaluate(()=>{copied.length=0;dispatchEvent(new CustomEvent('donpieros-payment-methods-change',{detail:[{name:'Bancolombia',account_value:'01234567890',available:true},{name:'Llave Bre-B',account_value:'@DONPIEROS',available:true}]}));});
   assert.equal(await page.locator('.admin-payment-copy').count(),2);
   await page.locator('.admin-payment-copy').first().click();
   assert.deepEqual(await page.evaluate(()=>copied),['01234567890']);
   assert.equal(await page.evaluate(()=>lastNotice.text),'Bancolombia: dato copiado.');
   await page.locator('.admin-payment-copy').nth(1).click();
   assert.equal((await page.evaluate(()=>copied)).at(-1),'@DONPIEROS');
   assert.equal(await page.locator('.admin-payment-copy svg').count(),2);
   await page.mouse.move(0,0);
   await page.waitForFunction(()=>!document.querySelector('.admin-payment-copy[data-copied]'));
   const layout=await page.evaluate(()=>{
    const live=document.querySelector('#realtimeStatus').getBoundingClientRect(),buttons=[...document.querySelectorAll('.admin-payment-copy')].map(node=>node.getBoundingClientRect());
    return {overflow:document.documentElement.scrollWidth>innerWidth,buttonTopDiff:Math.abs(buttons[0].top-buttons[1].top),liveCenterDiff:Math.abs(live.top+live.height/2-buttons[0].top-buttons[0].height/2),heightDiff:Math.max(...buttons.map(button=>Math.abs(button.height-live.height))),radius:getComputedStyle(document.querySelector('.admin-payment-copy')).borderRadius};
   });
   assert.equal(layout.overflow,false);if(width>600)assert.ok(layout.buttonTopDiff<1,JSON.stringify({width,...layout}));
   if(width>600)assert.ok(layout.liveCenterDiff<2);
   assert.equal(layout.heightDiff,0,'Todos los botones tienen exactamente el alto de En vivo');assert.equal(layout.radius,'999px');
   fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
   await page.locator('#dashboard').screenshot({path:path.join(root,'artifacts','bank-shortcuts-'+width+'.png')});
   await page.reload();await page.waitForFunction(()=>document.body.dataset.userRole==='admin');
   await page.locator('.admin-payment-copy').first().waitFor();
   assert.equal(catalogReads,1,'Reabrir la página muestra la caché vigente sin otra descarga');
   assert.equal(await page.locator('#adminLogin').isVisible(),false,'Una sesión vigente no pide PIN otra vez');
   await page.evaluate(()=>{localStorage.removeItem('don_pieros_admin_token');dispatchEvent(new Event('storage'));});
   await page.locator('#loginForm').waitFor({state:'visible'});
   await page.locator('#loginForm [name=username]').fill('mesero');await page.locator('#loginForm [name=pin]').fill('0012');await page.locator('#loginForm button[type=submit]').click();
   await page.waitForURL('**/mesero.html#service');await page.waitForFunction(()=>document.body.dataset.userRole==='waiter');
   assert.equal(await page.locator('.admin-sidebar a[href="#dashboard"]').isVisible(),false);
   assert.equal(await page.locator('.admin-sidebar a[href="#service"]').isVisible(),true);
   assert.equal(await page.locator('#adminPaymentShortcuts').isVisible(),false);
   assert.equal(await page.evaluate(()=>localStorage.getItem('don_pieros_admin_token')),null);
   assert.equal(await page.evaluate(()=>localStorage.getItem('don_pieros_waiter_token')),'mesero');
   assert.equal(await page.locator('#appManifest').getAttribute('href'),'mesero.webmanifest?v=1');
   await page.reload();await page.waitForFunction(()=>document.body.dataset.userRole==='waiter');
   assert.equal(new URL(page.url()).pathname,'/mesero.html');
   assert.deepEqual(errors,[]);await context.close();
  }
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
