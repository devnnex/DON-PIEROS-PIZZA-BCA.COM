const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('la caché espera confirmación de operaciones libres y revisa de nuevo antes de depurar',async()=>{
  const app=read('app.js');
  const code=app.slice(app.indexOf('  let staffCacheSince='),app.indexOf('  const refreshAdminNow ='));
  const queue=[];
  let activeOrder=true,refreshes=0,prunes=0,completeRefresh;
  const state={authToken:'session',requests:[],sessions:[]};
  const window={
    requestIdleCallback:callback=>queue.push(callback),
    DonPierosOnlineOrders:{isIdleForCache:()=>!activeOrder},
    DonPierosWaiter:{isIdleForCache:()=>true},
    DonPierosPerformance:{
      refreshStaffCatalog:()=>{refreshes++;return new Promise(resolve=>{completeRefresh=resolve;});},
      pruneExpiredStaffCatalogs:()=>{prunes++;}
    }
  };
  const sandbox={window,state,document:{hidden:false,querySelector:()=>null},navigator:{onLine:true},
    checkoutSubmissionBusy:false,checkoutRecoveryBusy:false,CHECKOUT_INTENTS_KEY:'pending',
    readLocalJson:()=>({}),readAppsScriptOutbox:()=>[],readRequestOutbox:()=>[]};
  const api=vm.runInNewContext(code+`
    staffCacheSession='session';
    ({scheduleStaffCacheRefresh,confirmSnapshot:()=>{staffCacheSnapshotToken='session';}})
  `,sandbox);
  api.scheduleStaffCacheRefresh();
  assert.equal(queue.length,0);
  api.confirmSnapshot();
  api.scheduleStaffCacheRefresh();
  assert.equal(queue.length,0);
  activeOrder=false;
  state.sessions=[{status:'open'}];
  api.scheduleStaffCacheRefresh();
  assert.equal(queue.length,0);
  state.sessions=[];
  api.scheduleStaffCacheRefresh();
  api.scheduleStaffCacheRefresh();
  assert.equal(queue.length,1);
  activeOrder=true;
  await queue.shift()();
  assert.equal(refreshes,0);
  activeOrder=false;
  api.scheduleStaffCacheRefresh();
  const firstRefresh=queue.shift()();
  activeOrder=true;
  completeRefresh();
  await firstRefresh;
  assert.equal(prunes,0);
  activeOrder=false;
  api.scheduleStaffCacheRefresh();
  const idleRefresh=queue.shift()();
  completeRefresh();
  await idleRefresh;
  assert.equal(prunes,1);
  api.scheduleStaffCacheRefresh();
  assert.equal(queue.length,0);
});

test('solo elimina instantáneas de catálogo vencidas y conserva datos de trabajo',()=>{
  const namespace='don-pieros-fast-v1:supabase:apps-script:';
  const old=JSON.stringify({at:Date.now()-8*86400000,value:[]});
  const values=new Map([
    [namespace+'admin-catalog:old',old],
    [namespace+'admin-catalog:current',JSON.stringify({at:Date.now(),value:[]})],
    [namespace+'staff-public-catalog',old],
    ['donpieros_checkout_intents_v1',old],
    ['don_pieros_admin_token','token']
  ]);
  const localStorage={get length(){return values.size;},key:index=>[...values.keys()][index],
    getItem:key=>values.get(key),removeItem:key=>values.delete(key)};
  const window={DON_PIEROS_CONFIG:{supabaseUrl:'supabase',appsScriptUrl:'apps-script'},addEventListener(){}};
  vm.runInNewContext(read('performance.js'),{window,navigator:{},localStorage});
  window.DonPierosPerformance.pruneExpiredStaffCatalogs();
  assert.deepEqual([...values.keys()],[namespace+'admin-catalog:current',namespace+'staff-public-catalog',
    'donpieros_checkout_intents_v1','don_pieros_admin_token']);
});
