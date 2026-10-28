const fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{},localStorage:{getItem:()=>''}});vm.runInContext(fs.readFileSync('config.js','utf8'),context);const config=context.window.DON_PIEROS_CONFIG;
(async()=>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
 try{
  const [health,setup,bootstrap,catalog]=await Promise.allSettled([
   fetch(config.appsScriptUrl,{signal:controller.signal}).then(r=>r.json()),
   fetch(config.supabaseUrl+'/rest/v1/rpc/dp_setup_status',{method:'POST',headers:{apikey:config.supabaseAnonKey,Authorization:'Bearer '+config.supabaseAnonKey,'Content-Type':'application/json'},body:'{}',signal:controller.signal}).then(async r=>({status:r.status,data:await r.json()})),
   fetch(config.supabaseUrl+'/rest/v1/rpc/get_bootstrap_data',{method:'POST',headers:{apikey:config.supabaseAnonKey,Authorization:'Bearer '+config.supabaseAnonKey,'Content-Type':'application/json'},body:'{}',signal:controller.signal}).then(async r=>({status:r.status,data:await r.json()})),
   fetch(config.appsScriptUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'dp_get_catalog'}),signal:controller.signal}).then(r=>r.json())
  ]);
  console.log('Apps Script:',health.status==='fulfilled'?JSON.stringify(health.value):health.reason.message);
  console.log('Primer Jefe:',setup.status==='fulfilled'?JSON.stringify(setup.value):setup.reason.message);
  if(catalog.status==='fulfilled')console.log('Menú real:',JSON.stringify({ok:catalog.value.ok,products:catalog.value.products?.length,options:catalog.value.toppings?.length}));
  if(bootstrap.status==='fulfilled'){const b=bootstrap.value;console.log('Supabase:',JSON.stringify({status:b.status,business:b.data.business?.business_name,tables:b.data.tables?.length,items:b.data.items?.length,categories:b.data.categories?.length,error:b.data.message}));}else console.log('Supabase:',bootstrap.reason.message);
 }finally{clearTimeout(timer);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
