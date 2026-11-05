const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
const sync=require('../individual-sales-sync.js');
const session=()=>({id:crypto.randomUUID(),sale_channel:'walk_in',local_only:true,status:'open',payer_name:'laura',individual_number:1,session_items:[{id:crypto.randomUUID(),item_name:'Pizza combinada',quantity:1,unit_price:100000,status:'served',notes:'Sabores: Don Pieros / Hawaiana'}]});
function setup(){
  const h=harness(),data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  const make=key=>sync.create({storage,key,rpc:async(name,payload)=>({data:h.call(name,payload)}),changed(){}});
  const save=(sale,version=0,action='save',operation=crypto.randomUUID(),token='boss')=>h.call('dp_save_individual_sale',{p_id:sale.id,p_operation_id:operation,p_version:version,p_action:action,p_session:sale},token);
  const read=(revision,knownIds=[])=>h.call('dp_get_orders',{includeIndividuals:true,individualRevision:revision,individualKnownIds:knownIds});
  return {h,make,save,read,storage};
}
test('dos dispositivos comparten ventas, correcciones y cierres desde Code.gs, sin Supabase',async()=>{
  const h=setup(),a=h.make('a'),b=h.make('b'),sale=session();a.queue(sale);await a.flush();
  const first=h.read();assert.equal(first.individualSales.length,1);
  const received=b.reconcile(first.individualSales);assert.equal(received[0].payer_name,'laura');assert.equal(received[0].session_items.length,1);
  received[0].session_items[0].quantity=2;b.queue(received[0]);await b.flush();
  const corrected=a.reconcile(h.read().individualSales,[sale]);assert.equal(corrected[0].session_items[0].quantity,2);
  const operation=crypto.randomUUID();await a.close(corrected[0],operation);await a.close(corrected[0],operation);
  assert.equal(b.reconcile(h.read().individualSales,received).length,0);
  assert.equal(h.read().individualSales.length,0,'Un equipo nuevo no descarga ventas cerradas.');
  const closed=h.read(undefined,[sale.id]).individualSales[0];assert.equal(closed.status,'closed');assert.equal(closed.session,undefined,'Los equipos antiguos reciben solo el cierre de sus cuentas conocidas.');
});
test('revisiones evitan leer de nuevo Sheets y caché atiende otro dispositivo',()=>{
  const h=setup();h.save(session());const first=h.read();h.h.reads.length=0;
  const unchanged=h.read(first.individualRevision);assert.equal(unchanged.individualSales,undefined);
  assert.equal(h.h.reads.filter(row=>row.sheet==='Ventas_Individuales_Pendientes').length,0);
  h.read();assert.equal(h.h.reads.filter(row=>row.sheet==='Ventas_Individuales_Pendientes').length,0);
});
test('escritura repetible, roles, validación y conflicto de edición/cobro entre equipos',()=>{
  const h=setup(),sale=session(),operation=crypto.randomUUID();
  assert.equal(h.save(sale,0,'save',operation).ok,true);assert.equal(h.save(sale,0,'save',operation).version,1);
  assert.equal(h.save(sale).conflict,true);
  assert.equal(h.save(sale,1,'save',crypto.randomUUID(),'waiter').ok,false);
  assert.equal(h.save(sale,1,'save',crypto.randomUUID(),'limited').ok,false);
  assert.equal(h.save({...sale,session_items:[{...sale.session_items[0],quantity:0}]},1).ok,false);
  const closing=crypto.randomUUID();assert.equal(h.save(sale,1,'close',closing).ok,true);
  assert.equal(h.save(sale,1,'close',closing).ok,true);
  assert.equal(h.save(sale,1,'close').conflict,true,'Otro cobro no obtiene permiso para registrar una segunda venta.');
  assert.equal(h.save(sale,2).conflict,true,'Un dispositivo anterior no reabre una venta cobrada.');
});
test('la cola se recupera al recargar; una respuesta perdida repite la misma operación',async()=>{
  const h=setup(),sale=session();h.make('a').queue(sale);
  const restored=h.make('a');await restored.flush();assert.equal(h.read().individualSales[0].version,1);
  let lose=true;const client=sync.create({storage:h.storage,key:'lost',rpc:async(name,payload)=>{
    const data=h.h.call(name,payload);if(lose){lose=false;throw Error('Respuesta perdida');}return {data};
  }});
  const another=session();client.queue(another);await assert.rejects(client.flush(),/Respuesta perdida/);await client.flush();
  assert.equal(h.read().individualSales.find(row=>row.id===another.id).version,1);
});
test('cambios rápidos durante una escritura se guardan después sin perder productos',async()=>{
  const h=setup(),sale=session();let release;
  const gate=new Promise(resolve=>release=resolve);let first=true;
  const client=sync.create({storage:h.storage,key:'rapid',rpc:async(name,payload)=>{if(first){first=false;await gate;}return {data:h.h.call(name,payload)};}});
  client.queue(sale);const saving=client.flush();sale.session_items.push({...sale.session_items[0],id:crypto.randomUUID(),item_name:'Bebida'});client.queue(sale);release();await saving;
  const remote=h.read().individualSales[0];assert.equal(remote.version,2);assert.equal(remote.session.session_items.length,2);assert.equal(client.hasPending(sale.id),false);
});
test('un fallo posterior a escribir publica la revisión, recupera el recibo y no duplica el consecutivo',()=>{
 const h=setup(),sale=session(),operation=crypto.randomUUID();
 const before=h.read().individualRevision;let fail=true;
 h.h.context.SpreadsheetApp.flush=()=>{if(fail){fail=false;throw Error('Respuesta perdida después de guardar');}};
 assert.equal(h.save(sale,0,'save',operation).ok,false);
 const snapshot=h.read(before);assert.equal(snapshot.individualSales.length,1);
 assert.equal(h.save(sale,0,'save',operation).version,1);
 h.h.props.set('DP_NEXT_INDIVIDUAL','1');assert.equal(h.save(session()).number,2);
});
test('una consulta iniciada antes del guardado no borra la venta ni restaura cantidades o cuentas cerradas',async()=>{
 const h=setup(),client=h.make('a'),sale=session(),started=Date.now()-1;
 client.queue(sale);await client.flush();
 assert.equal(client.reconcile([],[sale],{readStartedAt:started}).length,1);
 const old=h.read().individualSales;sale.session_items[0].quantity=3;client.queue(sale);await client.flush();
 assert.equal(client.reconcile(old,[sale],{readStartedAt:started})[0].session_items[0].quantity,3);
 await client.close(sale,crypto.randomUUID());assert.equal(client.reconcile(old,[sale],{readStartedAt:started}).length,0);
});
test('una consulta de recepción no descarta la venta nueva mientras se selecciona el primer producto',()=>{
 const h=setup(),client=h.make('a'),sale={...session(),session_items:[]};
 assert.equal(client.reconcile([],[sale])[0].id,sale.id);assert.equal(client.hasPending(sale.id),false);
 assert.equal(h.read().individualSales.length,0,'Un borrador vacío no consume escrituras en el backend.');
});
