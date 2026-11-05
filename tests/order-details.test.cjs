const test=require('node:test'),assert=require('node:assert/strict'),details=require('../order-details.js');
const {harness}=require('./helpers/don-pieros-gas.cjs');
test('el aviso verde dura dos minutos desde la llegada, incluso al redibujar o recargar',t=>{
 let now=Date.parse('2026-10-31T20:00:00Z');const start=now,classes=new Set();
 t.mock.method(Date,'now',()=>now);
 const node={dataset:{},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},remove(name){classes.delete(name);}}};
 const doc={querySelectorAll:selector=>selector==='[data-order-arrival-until]'?[node]:[]};
 details.decorateArrival(node,new Date(start).toISOString());assert.equal(classes.has('order-arrival-new'),true);
 now=start+119999;details.updateCountdowns(doc);assert.equal(classes.has('order-arrival-new'),true);
 now=start+120000;details.updateCountdowns(doc);assert.equal(classes.has('order-arrival-new'),false);
 details.decorateArrival(node,new Date(start).toISOString());assert.equal(classes.has('order-arrival-new'),false,'Redibujar no reinicia los dos minutos.');
 details.decorateArrival(node,new Date(now).toISOString());assert.equal(classes.has('order-arrival-new'),true);
 details.decorateArrival(node,new Date(now).toISOString(),false);assert.equal(classes.has('order-arrival-new'),false,'Los pedidos retirados de recepcion no parpadean.');
 assert.equal(node.dataset.orderArrivalUntil,undefined);
 details.decorateArrival(node,'fecha invalida');assert.equal(classes.has('order-arrival-new'),false);
 now=start;details.decorateArrival(node,new Date(start).toISOString(),true,90000);
 now=start+89999;details.updateCountdowns(doc);assert.equal(classes.has('order-arrival-new'),true);
 now=start+90000;details.updateCountdowns(doc);assert.equal(classes.has('order-arrival-new'),false,'La venta individual deja de parpadear a los 90 segundos.');
 details.decorateArrival(node,new Date(start).toISOString(),true,90000);assert.equal(classes.has('order-arrival-new'),false,'Redibujar conserva el vencimiento original.');
});
test('el reloj suena solo el primer minuto de vencimiento y no reinicia al redibujar la tarjeta',()=>{
 const vm=require('node:vm'),fs=require('node:fs');let now=100000,tones=0,next=0;const timers=new Map();
 const node={dataset:{orderDeadline:String(now+1000),orderEstimate:'25 min'},classList:{toggle(){}},querySelector(){return null;}};
 let nodes=[node];const doc={querySelectorAll:()=>nodes};
 class Audio{constructor(){this.state='running';this.currentTime=0;this.destination={};}createOscillator(){return {frequency:{},connect(){},start(){tones++;},stop(){},disconnect(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}}
 const context=vm.createContext({document:doc,AudioContext:Audio,Date:class extends Date{static now(){return now;}},addEventListener(){},setInterval(fn,ms){timers.set(++next,{fn,ms});return next;},clearInterval(id){timers.delete(id);}});
 vm.runInContext(fs.readFileSync(require.resolve('../order-details.js'),'utf8'),context);const api=context.DonPierosOrderDetails;
 api.unlockClock();api.updateCountdowns(doc);assert.equal(tones,0);
 now+=1000;api.updateCountdowns(doc);assert.equal(tones,1);api.updateCountdowns(doc);
 assert.equal([...timers.values()].filter(timer=>timer.ms===500).length,1,'Una misma orden en varias vistas no duplica el reloj.');
 now+=59999;[...timers.values()].find(timer=>timer.ms===500).fn();assert.equal(tones,2);
 now++;[...timers.values()].find(timer=>timer.ms===500).fn();assert.equal(tones,2);assert.equal([...timers.values()].some(timer=>timer.ms===500),false);
 api.updateCountdowns(doc);assert.equal(tones,2,'Al recargar un vencido antiguo solo queda el aviso visual.');
 node.dataset.orderDeadline=String(now);api.updateCountdowns(doc);assert.equal(tones,3,'Un nuevo plazo tiene su propio minuto.');
 nodes=[];api.updateCountdowns(doc);assert.equal([...timers.values()].some(timer=>timer.ms===500),false,'Retirar el pedido detiene el sonido.');
});
test('plazos en minutos y horas, inicio persistente y observaciones independientes del reloj',()=>{
 for(const [text,minutes] of [['25 minutos',25],['30 min',30],['25',25],['1 hora 15 min',75],['En 30 minutos',30]])assert.equal(details.durationMs(text),minutes*60000);
 const start='2026-10-31T20:00:00.000Z',notes=details.withTime('Sin cebolla','25 minutos',start);
 assert.deepEqual(details.readTime(notes),{time:'25 minutos',notes:'Sin cebolla',startedAt:start});
 assert.equal(details.withTime(notes,'25 minutos'),notes,'Guardar el mismo plazo no reinicia el contador.');
 assert.equal(details.deadline(notes),Date.parse(start)+25*60000);
 assert.equal(details.withTime(notes,''),'Sin cebolla');
 assert.notEqual(details.readTime(details.withTime(notes,'30 min')).startedAt,start);
 assert.equal(details.deadline('Tiempo estimado: 25 minutos',start),Date.parse(start)+25*60000);
 assert.equal(details.durationMs('Por confirmar'),0);
 assert.deepEqual(details.sizeParts(['Segunda mitad: Carnes','Tamaño: Super maxi · 54 × 54 cm','Sin cebolla']),{sizes:['Tamaño: Super maxi · 54 × 54 cm'],others:['Segunda mitad: Carnes','Sin cebolla']});
});
test('tiempo y observaciones web se guardan con permisos, versión y sin cambiar importes',()=>{
 const h=harness(),p=h.product(),created=h.call('createOrder',{order:h.order(p,{notes:'Sin cebolla'})});
 const original=h.call('dp_get_order',{id:created.orderId}).order,payload={id:original.id,version:original.version,estimatedTime:'25 minutos'};
 const result=h.call('dp_order_time',payload,'waiter');assert.equal(result.ok,true,result.error);
 const info=details.readTime(result.order.notes);assert.equal(info.notes,'Sin cebolla');assert.equal(info.time,'25 minutos');assert.ok(Number.isFinite(Date.parse(info.startedAt)));
 assert.equal(result.order.total,original.total);assert.deepEqual(result.order.items,original.items);
 const retry=h.call('dp_order_time',payload);assert.equal(retry.duplicate,true);assert.equal(details.readTime(retry.order.notes).startedAt,info.startedAt);
 const observation=h.call('dp_order_time',{...payload,version:result.order.version,observations:'Salsa aparte'});assert.equal(observation.ok,true);
 assert.equal(details.readTime(observation.order.notes).startedAt,info.startedAt,'Editar observaciones conserva el reloj.');
 assert.equal(details.readTime(observation.order.notes).notes,'Salsa aparte');
 assert.equal(h.call('dp_order_time',{...payload,estimatedTime:'30 minutos'}).ok,false,'Un equipo atrasado no cambia un plazo reciente.');
 assert.equal(h.call('dp_order_time',{...payload,version:observation.order.version},'limited').ok,false);
 assert.equal(h.call('dp_order_time',{...payload,estimatedTime:'x'.repeat(81)}).ok,false);
 assert.equal(h.call('dp_order_time',{...payload,estimatedTime:'25\nminutos'}).ok,false);
});

test('agrupa productos repetidos y respeta observaciones, opciones y entrega',()=>{
 const lines=[
  {id:'a',item_name:'Pizza Hawaiana',quantity:1,unit_price:43000,waiter_options:{labels:['Tama�o: Mediana'],fulfillment:'pickup'},notes:''},
  {id:'b',item_name:'Pizza Hawaiana',quantity:2,unit_price:43000,waiter_options:{labels:['Tama�o: Mediana','Para llevar'],fulfillment:'pickup'},notes:''},
  {id:'c',item_name:'Pizza Carnes',quantity:1,unit_price:46000,notes:''}
 ];
 const grouped=details.groupComandaItems(lines);
 assert.deepEqual(grouped.map(line=>[line.item_name,line.quantity]),[['Pizza Hawaiana',3],['Pizza Carnes',1]]);
 const observed=details.groupComandaItems([...lines.slice(0,2),{...lines[1],id:'d',notes:'Salsa aparte'}]);
 assert.deepEqual(observed.map(line=>[line.id,line.quantity]),[['a',1],['b',2],['d',2]]);
 const different=details.groupComandaItems([lines[0],{...lines[0],id:'e',waiter_options:{labels:['Tama�o: Maxi'],fulfillment:'pickup'}}]);
 assert.equal(different.length,2);
});
