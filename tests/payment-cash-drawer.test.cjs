const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const section=(start,end)=>{const from=source.indexOf('  const '+start+' ='),to=source.indexOf('  const '+end+' =',from+1);assert.ok(from>=0&&to>from);return source.slice(from,to);};
const setup=(method,closed=true,device='bridge')=>{
 const calls=[];
 const account={id:'account-8',table_id:'table-8',session_payments:[{id:'abono-1',amount:40,payment_method:'transfer',created_at:'2026-10-07T18:00:00Z'}],
  session_items:[{id:'item-1',item_name:'Producto',quantity:1,unit_price:100,status:'served'}]};
 const state={paymentProcessing:false,authToken:'valid',currentUser:{id:'staff-1'},sessions:[account],inventoryMeta:{},invoiceHistory:[],inventoryMovements:[],activeAdminSection:'inventory',activePaymentBase:100,activePaymentTotal:60};
 state.posFeatures={remote_drawer:true};
 state.sb={rpc:async(name)=>{calls.push(name);return {data:{command:{id:'remote-command',status:'accepted'}}};}};
 const buttons=[{disabled:false},{disabled:false}];
 const form={session_id:{value:account.id},cash_received:{value:100,focus(){}},payment_reference:{value:''}};
 const local=new Map();
 const context=vm.createContext({state,console,
  INVENTORY_STORAGE_KEY:'inventory', INVOICE_STORAGE_KEY:'invoices', INVENTORY_MOVEMENTS_STORAGE_KEY:'movements', APPS_SCRIPT_OUTBOX_KEY:'outbox',
  hydrateDurableKey:async()=>{},readLocalJson:(key,fallback)=>local.has(key)?structuredClone(local.get(key)):fallback,
  persistDurableJson:async(key,value)=>{local.set(key,structuredClone(value));return true;},
  flushDurableWrites:async()=>true,persistCheckoutAtomically:async project=>{project();return true;},
  persistInvoiceHistory(){local.set('invoices',structuredClone(state.invoiceHistory));},readAppsScriptOutbox:()=>[],writeAppsScriptOutbox:async()=>true,flushAppsScriptOutbox(){},
  $:()=>({close(){calls.push('dialog-close');}}),$$:()=>buttons,
  window:{posCashDrawer:device==='bridge'?{open:async()=>{calls.push('drawer');return true;}}:null,open:()=>({close(){calls.push('popup-close');}})},
  navigator:{userAgent:device==='mobile'?'Android':'Windows',onLine:true},setTimeout:callback=>callback(),
  cashDrawerRequest:async()=>{if(device==='controller')return {settings:{printer:'POS'},printers:['POS']};throw Error('No local drawer');},
  sendCashDrawerPulse:async()=>{calls.push('drawer');return true;},
  dbQuiet:async query=>(await query).data,
  toast:()=>{},tipsEnabled:()=>false,integerMoney:value=>Math.max(0,Math.round(Number(value||0))),currencyInputNumber:input=>Number(input?.value||0),
  paymentFromForm:()=>({method,payments:method==='mixed'?[{method:'cash',amount:30},{method:'breb',amount:30}]:[{method,amount:60}]}),
  paidInventoryPlan:()=>[],validatePaidInventory:()=>true,
  sessionTotals:()=>({subtotal:100,total:100,discount:0,tax:0,serviceFee:0}),
  closeSession:async(id,checkout)=>{assert.equal(id,account.id);assert.equal(checkout.paid,40);return closed?{session:account,saved:{closed_at:'2026-10-07T19:00:00Z'},totals:{subtotal:100,total:100}}:null;},
  uid:()=> 'invoice-8',sessionReference:()=> 'M8',sessionLabel:()=> 'Mesa 8',paymentMethodLabel:()=>method,
  applyPaidInventoryLocally:()=>{},applyInvoiceToInventory:invoice=>{state.invoiceHistory.push(invoice);calls.push(invoice);},
  renderAdminLive(){},renderInventory:()=>calls.push('render-inventory'),renderTips:()=>{},printThermalReceipt:()=>calls.push('print')});
 vm.runInContext(section('sessionPayments','abonoRowsHtml')+section('openLocalCashDrawer','getAppsScriptUrl')
  +section('CHECKOUT_INTENTS_KEY','renderConsumptionSelection')+';globalThis.process=processPayment;globalThis.openDrawer=openCashDrawer;',context);
 return {context,calls,form,buttons};
};
test('el clic responde antes de leer el almacenamiento y reserva una sola ventana de impresión',async()=>{
 const app=setup('cash');let release;const gate=new Promise(resolve=>{release=resolve;});
 app.context.hydrateDurableKey=()=>gate;
 const pending=app.context.process(app.form,{value:'print'});
 assert.ok(app.buttons.every(button=>button.disabled&&button.textContent==='Procesando…'));
 assert.equal(app.calls.includes('drawer'),false);assert.equal(app.calls.includes('print'),false);
 await app.context.process(app.form,{value:'print'}); // Repeated clicks cannot create another checkout.
 release();await pending;
 assert.equal(app.calls.filter(call=>typeof call==='object').length,1);
 assert.ok(app.buttons.every(button=>!button.disabled));
});
for(const method of ['cash','transfer','breb','card','mixed'])for(const action of ['save','print']){
 test('BCA '+method+'/'+action+': cobra saldo, conserva abono y abre solo con efectivo',async()=>{
  const app=setup(method);await app.context.process(app.form,{value:action});
  const invoice=app.calls.find(call=>typeof call==='object');
  assert.equal(invoice.remainingPaid,60);assert.equal(invoice.prepayments.length,1);
  assert.equal(invoice.payments.reduce((sum,row)=>sum+row.amount,0),100);
  assert.equal(invoice.totals.total,100);assert.equal(invoice.changeDue,method==='cash'?40:0);
  const expectedPulses=['cash','mixed'].includes(method)?1:0;
  assert.equal(app.calls.filter(call=>call==='drawer').length,expectedPulses);
  if(expectedPulses)assert.ok(app.calls.indexOf('drawer')<app.calls.indexOf('render-inventory'),'El pulso sale antes de reconstruir la interfaz.');
  assert.equal(app.calls.filter(call=>call==='print').length,action==='print'?1:0);
 });
}
test('BCA no abre ni imprime cuando el servidor rechaza el cierre',async()=>{
 const app=setup('cash',false);await app.context.process(app.form,{value:'print'});
 assert.equal(app.calls.includes('drawer'),false);assert.equal(app.calls.includes('print'),false);
 assert.equal(app.calls.some(call=>typeof call==='object'),false);
});

for(const device of ['mobile','desktop','controller'])for(const method of ['cash','transfer','breb','card','mixed'])for(const action of ['save','print']){
 test('BCA '+device+' '+method+'/'+action+': apertura automática exclusivamente local',async()=>{
  const app=setup(method,true,device);await app.context.process(app.form,{value:action});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(app.calls.some(call=>typeof call==='object'),'El pago se registra.');
  assert.equal(app.calls.filter(call=>call==='drawer').length,device==='controller'&&['cash','mixed'].includes(method)?1:0);
  assert.equal(app.calls.includes('request_pos_drawer'),false,'El cobro no solicita abrir una caja remota.');
  assert.equal(app.calls.filter(call=>call==='print').length,action==='print'?1:0);
 });
}

test('La apertura manual explícita conserva su comportamiento',async()=>{
 const app=setup('cash',true,'mobile');
 assert.equal(await app.context.openDrawer(),true);
 assert.equal(app.calls.filter(call=>call==='request_pos_drawer').length,1);
});

test('BCA un pago mixto sin efectivo no abre la caja',async()=>{
 const app=setup('mixed');app.context.paymentFromForm=()=>({method:'mixed',payments:[{method:'transfer',amount:30},{method:'breb',amount:30}]});
 await app.context.process(app.form,{value:'save'});assert.equal(app.calls.includes('drawer'),false);
});

test('BCA un fallo de impresión conserva el cobro y permite reimprimirlo sin cobrar otra vez',async()=>{
 const app=setup('card');app.context.printThermalReceipt=()=>{throw Error('printer_unavailable');};
 await app.context.process(app.form,{value:'print'});
 await app.context.process(app.form,{value:'save'});
 assert.equal(app.calls.filter(call=>typeof call==='object').length,1);
});

test('cuentas independientes se pueden confirmar mientras otra espera, sin mezclar dinero ni cerrar el formulario siguiente',async()=>{
 const app=setup('cash'),{state}=app.context;
 let release;const gate=new Promise(resolve=>{release=resolve;});const closed=[],dialogCloses=[];
 app.context.$=()=>({close(){dialogCloses.push(app.form.session_id.value);}});
 app.context.closeSession=async id=>{closed.push(id);if(id==='account-8')await gate;return {saved:{id}};};
 app.context.sessionTotals=session=>({subtotal:session.session_items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0),total:session.session_items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0)});
 app.context.paymentFromForm=()=>({method:'cash',payments:[{method:'cash',amount:state.activePaymentTotal}]});
 app.form.payment_reference.value='PRIMERA';
 const first=app.context.process(app.form,{value:'save'});
 for(let i=0;i<10&&!closed.length;i++)await new Promise(setImmediate);
 assert.deepEqual(closed,['account-8']);
 const secondSession={id:'account-9',table_id:'table-9',session_items:[{id:'second',item_name:'Otra pizza',quantity:1,unit_price:200,status:'served'}]};
 state.sessions.push(secondSession);state.activePaymentTotal=200;state.activePaymentBase=200;
 app.form.session_id.value=secondSession.id;app.form.payment_reference.value='SEGUNDA';app.form.cash_received.value=300;
 const second=app.context.process(app.form,{value:'save'});
 for(let i=0;i<10&&!state.checkoutAccounts.has(secondSession.id);i++)await new Promise(setImmediate);
 await new Promise(setImmediate);
 assert.equal(state.checkoutAccounts.size,2,'Solo se bloquean las dos cuentas enviadas');
 assert.equal(Object.keys(app.context.readLocalJson('donpieros_checkout_intents_v1',{})).length,2,'Los dos intentos ya son durables antes de terminar el primero');
 assert.deepEqual(closed,['account-8'],'El guardado financiero se mantiene en orden');
 app.form.session_id.value='third-open';app.form.payment_reference.value='BORRADOR';
 release();await Promise.all([first,second]);
 const invoices=app.calls.filter(call=>typeof call==='object');
 assert.equal(invoices.length,2);assert.deepEqual(closed,['account-8','account-9']);
 assert.equal(invoices[0].reference,'PRIMERA');assert.equal(invoices[0].remainingPaid,60);
 assert.equal(invoices[1].reference,'SEGUNDA');assert.equal(invoices[1].remainingPaid,200);assert.equal(invoices[1].changeDue,100);
 assert.equal(dialogCloses.includes('third-open'),false);assert.equal(state.checkoutAccounts.size,0);assert.equal(state.paymentProcessing,false);
});
