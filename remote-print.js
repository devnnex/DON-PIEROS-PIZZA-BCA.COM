(() => {
 'use strict';
 if(document.body.dataset.page!=='admin')return;
 const bridge='http://127.0.0.1:8767',api=()=>window.DonPierosAdmin;
 let deviceId;try{deviceId=localStorage.getItem('dp-print-browser-id');if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('dp-print-browser-id',deviceId);}}catch(_){deviceId=crypto.randomUUID();}
 let busy=false,auth='',local=null,lastBeat=0,lastProbe=0,backoff=0,sending=0,devices=0,receivers=[];
 const label=()=>navigator.userAgentData?.platform||(/Windows/i.test(navigator.userAgent)?'Windows':/Android/i.test(navigator.userAgent)?'Android':'Navegador');
 const missing=error=>error?.code==='PGRST202'||/Could not find the function|schema cache/i.test(error?.message||'');
 async function rpc(name,args={},token=api()?.getToken?.()){
  const db=api()?.db;if(!db?.rpc||!token)throw Error('Inicia sesión para imprimir.');
  const request=db.rpc(name,{auth_token:token,...args});
  const result=await(request.abortSignal?request.abortSignal(AbortSignal.timeout(12000)):request);
  if(token!==api()?.getToken?.())throw Error('La sesión cambió.');
  if(result.error)throw result.error;return result.data;
 }
 async function localRequest(path,body){
  const response=await fetch(bridge+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(body?70000:2200),
   headers:{'X-Don-Pieros-Print':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'El receptor no respondió.');return data;
 }
 async function heartbeat(force=false){
  if(!force&&Date.now()-lastBeat<15000)return;
  if(!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)&&Date.now()-lastProbe>15000){
   lastProbe=Date.now();try{const info=await localRequest('/status');local=info.ready&&info.id&&info.secret?info:null;}catch(_){local=null;}
  }
  const token=api()?.getToken?.();
  await rpc('dp_print_heartbeat',{p_device_id:deviceId,p_label:local?.label||label(),p_receiver_id:local?.id||null,p_secret:local?.secret||null,p_printer:local?.printer||null},token);
  lastBeat=Date.now();
 }
 async function tick(){
  if(busy||!navigator.onLine||Date.now()<backoff)return;
  const token=api()?.getToken?.();if(!token){auth='';local=null;lastBeat=0;return;}
  if(auth!==token){auth=token;lastBeat=0;local=null;}
  busy=true;
  try{
   await heartbeat();
   if(!local)return;
   const receiver=local;
   const result=await rpc('dp_print_claim',{p_receiver_id:receiver.id,p_secret:receiver.secret},token);
   if(!result?.job)return;
   const job=result.job;
   // The local ledger reserves the job BEFORE handing it to the Windows driver.
   // If the response is interrupted, the same id retrieves its result, not a new copy.
   let receipt;
   try{receipt=await localRequest('/print',{id:job.id,secret:receiver.secret,pdf:job.pdf});}
   catch(_){return;}// A later claim reconciles with the local ledger.
   if(!['spooled','failed','unknown'].includes(receipt.status))return;
   await rpc('dp_print_finish',{p_receiver_id:receiver.id,p_secret:receiver.secret,p_job_id:job.id,p_status:receipt.status,p_error:receipt.error||''},token);
  }catch(error){if(missing(error))backoff=Date.now()+60000;}
  finally{busy=false;}
 }
 async function status(){
  if(!navigator.onLine||!api()?.getToken?.()||Date.now()<backoff)return null;
  try{
   await heartbeat();const result=await rpc('dp_print_status');devices=result?.devices||0;receivers=result?.receivers||[];return result;
  }catch(error){if(missing(error))backoff=Date.now()+60000;return null;}
 }
 async function send(pdf,title){
  const available=await status();if(!available?.receivers?.length)return null;
  const token=api().getToken(),id=crypto.randomUUID(),data=pdf.output('datauristring').split(',')[1];
  sending++;
  try{
   let job,error;
   // A lost submit response can be retried using the SAME job id.
   for(let attempt=0;attempt<2;attempt++){
    try{job=await rpc('dp_print_submit',{p_job_id:id,p_title:title,p_pdf:data,p_preferred:local?.id||null},token);error=null;break;}catch(failure){error=failure;}
   }
   if(error)throw Error('No pudimos confirmar el envío. Comprueba la impresora antes de reimprimir.');
   if(job?.unavailable)return null;
   if(!job?.id)throw Error('El servidor no confirmó el trabajo de impresión.');
   api()?.notify?.('Impresión enviada a '+(job.printer||'la impresora conectada')+'.','ok');
   void tick();
   const deadline=Date.now()+90000;
   while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,1000));
    if(token!==api()?.getToken?.())throw Error('La sesión cambió. Comprueba la impresora antes de reimprimir.');
    let result;try{result=await rpc('dp_print_result',{p_job_id:id},token);}catch(_){continue;}
    if(result?.status==='spooled'){
     api()?.notify?.('El equipo receptor confirmó el envío a la cola de impresión de Windows.','ok');return {remote:true,id,receiver:job.receiver};
    }
    if(['failed','unknown','expired'].includes(result?.status))throw Error(result.error||'No se confirmó la impresión. Comprueba el receptor antes de reimprimir.');
   }
   throw Error('La impresión sigue sin confirmarse. Comprueba el equipo receptor antes de reimprimir.');
  }finally{sending--;}
 }
 const panel=document.createElement('dialog');panel.className='modal';panel.id='remotePrintDialog';
 panel.innerHTML='<div class="modal-card"><div class="section-head"><h2>Impresión remota</h2><button type="button" class="icon-btn" aria-label="Cerrar">×</button></div><p data-print-summary role="status"></p><div data-print-receivers></div><p>En el Windows conectado a la impresora, instala el receptor y mantén el sistema abierto con sesión iniciada.</p><p><a href="impresion/INSTALAR-RECEPTOR.cmd" download>Descargar instalador para Windows</a> · <a href="IMPRESION-REMOTA.md" target="_blank" rel="noopener">Instrucciones</a></p><p>Sin receptor disponible se conserva la impresión habitual del navegador.</p></div>';
 panel.querySelector('button').onclick=()=>panel.close();panel.onclick=e=>{if(e.target===panel)panel.close();};document.body.append(panel);
 async function openStatus(){
  panel.showModal();const summary=panel.querySelector('[data-print-summary]');summary.textContent='Consultando equipos…';
  const result=await status();summary.textContent=result?`${devices} navegador(es) activo(s) · ${receivers.length} receptor(es) listo(s)`:'La impresión remota todavía no está disponible. Revisa la activación de Supabase y la conexión.';
  panel.querySelector('[data-print-receivers]').replaceChildren(...receivers.map(receiver=>{const p=document.createElement('p');p.textContent=receiver.label+' · '+receiver.printer;return p;}));
 }
 const button=document.createElement('button');button.className='ghost';button.type='button';button.textContent='Impresión';button.onclick=()=>void openStatus();
 document.querySelector('.admin-header-actions')?.prepend(button);
 window.DonPierosRemotePrint={send,status,get busy(){return sending>0||busy;}};
 setInterval(()=>void tick(),2000);
 window.addEventListener('online',()=>{backoff=0;void tick();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){backoff=0;lastBeat=0;void tick();}});
 void tick();
})();
