const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('confirmación del cliente: espera la recepción, acepta un aviso anticipado y continúa si el admin está desconectado',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../pedidos.js'),'utf8');
 const start=source.indexOf('  function rememberReception('),end=source.indexOf('  function openOrderWhatsApp(',start);
 const timers=new Map(),state={orderSignal:{state:'joined'}},receptionReceipts=new Set(),receptionWaiters=new Map();let serial=0;
 const context=vm.createContext({state,receptionReceipts,receptionWaiters,localStorage:{getItem:()=>null},window:{addEventListener(){}},setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source.slice(start,end)+';globalThis.wait=waitForReception;globalThis.receive=rememberReception;',context);
 let confirmed=false;const waiting=context.wait('DP-test-1').then(()=>confirmed=true);
 await Promise.resolve();assert.equal(confirmed,false);
 context.receive({payload:{orderId:'DP-test-1'}});await waiting;assert.equal(confirmed,true);assert.equal(timers.size,0);
 context.receive({payload:{orderId:'DP-test-2'}});await context.wait('DP-test-2');assert.equal(timers.size,0);
 const offline=context.wait('DP-test-3');assert.equal([...timers.values()][0].ms,1800);[...timers.values()][0].fn();await offline;
 state.orderSignal.state='closed';await context.wait('DP-test-4');
 assert.ok(source.indexOf('await waitForReception(result.orderId);')<source.indexOf("state.cartStep = 'success';"));
});
