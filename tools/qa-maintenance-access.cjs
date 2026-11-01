const assert=require('node:assert/strict'),{chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const users=[{id:'support-id',username:'soporte_temporal',full_name:'Soporte de mantenimiento',role:'boss',is_active:true,is_maintenance:true},
  {id:'boss-id',username:'jefe',full_name:'Jefe del negocio',role:'boss',is_active:true},
  {id:'waiter-id',username:'mesero',full_name:'Mesero QA',role:'waiter',is_active:true}];
 let deleted=false,bossListGate=null,releaseBossList,page;const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.routeWebSocket('wss://bxyvxbutjlvoconfsjub.supabase.co/**',socket=>socket.close());
  await context.route('https://script.google.com/**',route=>route.fulfill({json:{ok:true,items:[],orders:[],total:0,activeCount:0,shift:null,shifts:[],everInitialized:true}}));
  await context.route('https://bxyvxbutjlvoconfsjub.supabase.co/**',async route=>{
   const rpc=new URL(route.request().url()).pathname.split('/').pop(),args=route.request().postDataJSON()||{};
   if(process.env.PIEROS_DEBUG&&['get_current_user','list_users'].includes(rpc))console.log(rpc,args);
   if(rpc==='get_current_user')return route.fulfill({json:args.auth_token==='support'&&!deleted?users[0]:args.auth_token==='boss'?users[1]:null});
   if(rpc==='list_users'){if(args.auth_token==='boss'&&bossListGate)await bossListGate;return route.fulfill({json:args.auth_token==='support'?users:users.slice(1)});}
   if(rpc==='delete_user'){assert.equal(args.auth_token,'support');assert.equal(args.user_id,'support-id');deleted=true;return route.fulfill({json:{deleted:true,id:'support-id'}});}
   return route.fulfill({json:rpc==='get_bootstrap_data'?{business:{business_name:'Don Pieros Pizza',currency:'COP',tips_enabled:false},tables:[],categories:[],items:[]}:rpc==='get_admin_snapshot'?{requests:[],sessions:[]}:rpc==='dp_list_waiter_comandas'?{orders:[]}:rpc==='dp_setup_status'?false:[]});
  });
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultNavigationTimeout(60000);
  await page.addInitScript(()=>{if(!sessionStorage.getItem('qa-maintenance-seeded')){localStorage.setItem('don_pieros_admin_token','support');localStorage.setItem('waiter_alarm_enabled','0');sessionStorage.setItem('qa-maintenance-seeded','1');}});
  await page.goto('http://127.0.0.1:4173/admin.html#users');await page.locator('#usersList .user-card').nth(2).waitFor();await page.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  assert.match(await page.locator('#usersList').innerText(),/Soporte de mantenimiento/);assert.match(await page.locator('#usersList').innerText(),/Jefe del negocio/);
  await page.evaluate(()=>localStorage.setItem('don_pieros_admin_token','boss'));bossListGate=new Promise(resolve=>releaseBossList=resolve);
  await page.reload();await page.locator('#usersList .user-card').first().waitFor();
  assert.doesNotMatch(await page.locator('#usersList').innerText(),/Soporte|soporte_temporal/,'El caché del navegador no filtra la cuenta a otro jefe.');
  releaseBossList();bossListGate=null;await page.locator('#usersList .user-card').nth(1).waitFor();assert.equal(await page.locator('#usersList .user-card').count(),2);
  await page.evaluate(()=>localStorage.setItem('don_pieros_admin_token','support'));await page.reload();await page.locator('[data-delete-user="support-id"]').waitFor();await page.locator('#salesShiftDialog[open]').waitFor();await page.evaluate(()=>document.querySelector('#salesShiftDialog')?.close());
  await page.locator('[data-delete-user="support-id"]').click();await page.locator('#actionConfirmAccept').click();await page.waitForFunction(()=>localStorage.getItem('don_pieros_admin_token')===null);
  assert.equal(deleted,true);assert.deepEqual(errors,[]);console.log('OK: soporte ve a todos; otro jefe en el mismo navegador no lo ve ni desde caché; eliminar el acceso propio cierra la sesión.');
 }catch(error){console.log(await page?.evaluate(()=>({url:location.href,user:window.DonPierosAdmin?.getUser(),users:document.querySelector('#usersList')?.innerText,hidden:document.querySelector('#users')?.hidden})));console.log(errors);throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
