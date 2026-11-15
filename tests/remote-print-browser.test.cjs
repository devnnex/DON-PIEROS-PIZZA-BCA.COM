const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
test('impresión remota: dos navegadores, confirmación perdida y un solo envío a Windows',async()=>{
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<body data-page="admin"><div class="admin-header-actions"></div></body>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const receiverId='11111111-1111-4111-8111-111111111111',secret='s'.repeat(43),jobs=new Map(),ledger=new Map(),heartbeats=new Set(),errors=[];
 let available=true,spools=0,loseSubmit=true,loseReceipt=true,missing=false,nativeSessions=0;
 const backend=async(name,args)=>{
  if(missing)return {error:{code:'PGRST202',message:'Could not find the function'}};
  if(name==='dp_print_heartbeat'){heartbeats.add(args.p_device_id);return {data:{ok:true}};}
  if(name==='dp_print_status')return {data:{devices:heartbeats.size,receivers:available?[{id:receiverId,label:'PC Cocina',printer:'POS 80'}]:[]}};
  if(name==='dp_print_submit'){
   if(!jobs.has(args.p_job_id))jobs.set(args.p_job_id,{id:args.p_job_id,pdf:args.p_pdf,title:args.p_title,status:'pending'});
   if(loseSubmit){loseSubmit=false;return {error:{message:'Conexión interrumpida después de guardar'}};}
   return {data:{id:args.p_job_id,receiver:receiverId,printer:'POS 80'}};
  }
  if(name==='dp_print_claim'){const job=[...jobs.values()].find(j=>['pending','claimed'].includes(j.status));if(job)job.status='claimed';return {data:{job:job?{...job}:null}};}
  if(name==='dp_print_finish'){Object.assign(jobs.get(args.p_job_id),{status:args.p_status,error:args.p_error,pdf:null});return {data:{ok:true}};}
  if(name==='dp_print_result')return {data:{...jobs.get(args.p_job_id)}};
  throw Error(name);
 };
 try{
  async function setup(receiver){
   const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.exposeFunction('backendRpc',backend);
   await page.route('http://127.0.0.1:8767/**',async route=>{
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
    if(route.request().method()==='OPTIONS')return route.fulfill({headers,body:''});
    if(route.request().url().endsWith('/status'))return route.fulfill({headers,json:{ready:!!receiver,native:receiver==='native',id:receiverId,secret,label:'PC Cocina',printer:'POS 80'}});
    const body=route.request().postDataJSON();assert.equal(body.secret,secret);
    if(route.request().url().endsWith('/session')){assert.equal(body.token,'valid');assert.equal(body.url,'https://bxyvxbutjlvoconfsjub.supabase.co');nativeSessions++;return route.fulfill({headers,json:{ok:true}});}
    if(!ledger.has(body.id)){spools++;ledger.set(body.id,{status:'spooled'});}
    if(loseReceipt){loseReceipt=false;return route.abort('connectionfailed');}
    return route.fulfill({headers,json:ledger.get(body.id)});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
   await page.evaluate(()=>{window.notices=[];window.token='valid';window.DON_PIEROS_CONFIG={supabaseUrl:'https://bxyvxbutjlvoconfsjub.supabase.co',supabaseAnonKey:'public-key'};window.DonPierosAdmin={getToken:()=>token,getUser:()=>({role:'boss'}),notify:(...args)=>notices.push(args),db:{rpc:(name,args)=>backendRpc(name,args)}};});
   await page.addScriptTag({path:path.join(root,'remote-print.js')});return page;
  }
  const receiver=await setup(true),sender=await setup(false);
  await receiver.waitForFunction(()=>DonPierosRemotePrint.busy===false);
  const result=await sender.evaluate(()=>DonPierosRemotePrint.send({output:()=> 'data:application/pdf;base64,JVBERi0xLjQKUmVjZWlwdA=='},'Comanda Mesa 9'));
  assert.equal(result.remote,true);assert.equal(jobs.size,1,'Reintentar el envío conserva el mismo identificador.');
  assert.equal(spools,1,'Una confirmación local perdida no genera otra copia.');
  assert.equal([...jobs.values()][0].status,'spooled');assert.equal([...jobs.values()][0].pdf,null);
  assert.match(await sender.evaluate(()=>notices.at(-1)[0]),/cola de impresión de Windows/);
  await sender.addScriptTag({path:path.join(root,'vendor/jspdf.umd.min.js')});
  await sender.addScriptTag({path:path.join(root,'thermal-print.js')});
  const remoteThermal=await sender.evaluate(async()=>{
   const popup=open('','_blank');popup.document.write('<!doctype html><title>Comanda térmica</title><body><p>1 Pizza · Mesa 9</p></body>');popup.document.close();
   const result=await DonPierosThermal.print(popup,58);return {remote:result.remote,width:result.width,closed:popup.closed};
  });
  assert.deepEqual(remoteThermal,{remote:true,width:58,closed:true},'La impresión térmica real se enruta al receptor y cierra la vista local.');
  assert.equal(spools,2);
  await sender.locator('.admin-header-actions button').click();
  await sender.waitForFunction(()=>document.querySelector('[data-print-summary]').textContent.includes('receptor(es) listo(s)'));
  assert.match(await sender.locator('[data-print-receivers]').innerText(),/PC Cocina.*POS 80/);
  await sender.locator('#remotePrintDialog button').click();
  available=false;
  assert.equal(await sender.evaluate(()=>DonPierosRemotePrint.send({output(){throw Error('No debe convertir un PDF sin receptor.');}},'Local')),null,'Sin receptor se conserva la ruta habitual.');
  const localThermal=await sender.evaluate(async()=>{
   const popup=open('','_blank');popup.document.write('<!doctype html><title>Impresión local</title><body><p>1 Pizza</p></body>');popup.document.close();
   const result=await DonPierosThermal.print(popup,80);const ready=popup.document.body.dataset.thermalPdfReady;popup.close();return {width:result.width,ready,remote:!!result.remote};
  });
  assert.deepEqual(localThermal,{width:80,ready:'1',remote:false},'El PDF y su vista habitual siguen funcionando sin receptor.');
  const native=await setup('native');await native.waitForFunction(()=>!DonPierosRemotePrint.busy);
  assert.ok(nativeSessions>0,'El navegador renueva la autorización del receptor nativo.');
  await native.close();
  missing=true;
  assert.equal(await sender.evaluate(()=>DonPierosRemotePrint.status()),null,'Sin la migración no se interrumpe la impresión habitual.');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
