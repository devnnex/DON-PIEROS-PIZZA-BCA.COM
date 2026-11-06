const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
function setup(){
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),product=catalog.products.find(p=>p.name==='Pizza combinada');
 const [sizes,flavors]=product.modifiers,size=catalog.toppings.find(t=>t.kind===sizes.source&&t.name.startsWith('Maxi'));
 const choices=catalog.toppings.filter(t=>t.kind===flavors.source).slice(0,2);
 const raw={requestId:crypto.randomUUID(),customerName:'Cliente mostrador',notes:'Sin salsa',items:[{productId:product.id,name:product.name,
  quantity:2,unitPrice:78000,selectionIds:{[sizes.id]:[size.id],[flavors.id]:choices.map(t=>t.id)},takeaway:true,notes:'Bien dorada',packagingSize:'Maxi'}]};
 return {h,raw,product};
}

test('venta individual a domicilio conserva la entrega y calcula cajas sin duplicar productos',()=>{
 const {h,raw}=setup();raw.items[0].fulfillment='delivery';raw.address='Carrera 10 # 20-30, barrio Centro, apartamento 402';
 const receipt=h.call('dp_create_staff_order',{order:raw},'waiter');assert.equal(receipt.ok,true,receipt.error);
 const order=h.call('dp_get_order',{id:receipt.orderId}).order;
 assert.equal(order.fulfillment,'delivery');assert.equal(order.items[0].fulfillment,'delivery');
 assert.equal(order.address,raw.address,'La dirección que envía el mesero llega a la comanda de caja.');
 assert.equal(order.items[0].packagingUnitFee,4000);assert.equal(order.total,164000);
 assert.equal(h.call('dp_create_staff_order',{order:raw},'waiter').duplicate,true);
});
test('mesero envía venta sin mesa ni teléfono, caja compartida, atribución e idempotencia',()=>{
 const {h,raw}=setup(),receipt=h.call('dp_create_staff_order',{order:raw},'waiter');assert.equal(receipt.ok,true,receipt.error);assert.equal(receipt.total,164000);
 const order=h.call('dp_get_order',{id:receipt.orderId}).order;
 assert.equal(order.source,'staff_walk_in');assert.equal(order.waiterId,'waiter-id');assert.equal(order.waiterName,'Mesero');assert.equal(order.items[0].notes,'Bien dorada');
 assert.equal(order.items[0].packagingUnitFee,4000);assert.equal(h.call('dp_get_orders').orders.length,1);
 assert.equal(h.call('dp_create_staff_order',{order:raw},'waiter').duplicate,true);assert.equal(h.call('dp_get_orders').orders.length,1);
 assert.equal(h.call('dp_create_staff_order',{order:{...raw,customerName:'Otra persona'}},'waiter').ok,false);
 assert.equal(h.call('dp_create_staff_order',{order:raw},'boss').ok,false,'Otro actor no puede reutilizar el envío');
 const id='walk-in-web-'+order.id,invoice={id,sessionId:id,saleChannel:'walk_in',webOrderId:order.id,checkoutId:crypto.randomUUID(),
  table:'Pedido web',waiterName:'Falso',orderSource:'web',totals:{subtotal:164000,total:164000},payments:[{method:'cash',amount:164000}],
  items:[{id:'line',item_name:order.items[0].name,quantity:2,unit_price:82000}],createdAt:'2026-11-01T20:00:00Z'};
 assert.equal(h.call('checkout_web_order',{invoice},'waiter').ok,false);
 const paid=h.call('checkout_web_order',{invoice});assert.equal(paid.ok,true,paid.error);
 const sale=h.sheets.get('Ventas').rows[1];assert.equal(sale[7],'Mesero');assert.equal(sale[4],'Venta individual');assert.equal(sale[15],'Venta individual/AppScript');
 assert.equal(h.call('dp_get_orders').orders.length,0);assert.equal(h.call('checkout_web_order',{invoice}).duplicate,true);
});
test('requiere sesión/origen y valida opciones, importes, disponibilidad y productos personalizados',()=>{
 const {h,raw,product}=setup();
 assert.equal(h.call('dp_create_staff_order',{order:raw},'').ok,false);assert.equal(h.call('dp_create_staff_order',{order:raw},'limited').ok,false);
 assert.equal(h.context.apiRequest(JSON.stringify({action:'dp_create_staff_order',payload:{order:raw},authToken:'waiter',origin:'https://otro.test'})).ok,false);
 for(const bad of [{quantity:0},{quantity:1.5},{unitPrice:-1},{unitPrice:'78000'},{selectionIds:{}},{notes:'x'.repeat(501)},{name:'x'.repeat(161)}]){
  const r=h.call('dp_create_staff_order',{order:{...raw,items:[{...raw.items[0],...bad}]}},'waiter');assert.equal(r.ok,false,JSON.stringify(bad));
 }
 const custom={requestId:crypto.randomUUID(),customerName:'Laura',notes:'',items:[{productId:crypto.randomUUID(),name:'Postre del día',custom:true,quantity:1,unitPrice:8000,notes:'Sin helado',takeaway:false}]};
 for(const customerName of ['', ' ', 'A'])assert.equal(h.call('dp_create_staff_order',{order:{...custom,customerName}},'waiter').ok,false);
 const receipt=h.call('dp_create_staff_order',{order:custom},'waiter');assert.equal(receipt.ok,true,receipt.error);assert.equal(receipt.total,8000);
 assert.equal(h.call('dp_get_order',{id:receipt.orderId}).order.customerName,'Laura');
 const renamed=h.call('dp_create_staff_order',{order:{...raw,requestId:crypto.randomUUID(),items:[{...raw.items[0],name:'Combinada de Laura'}]}},'waiter');
 assert.equal(renamed.ok,true,renamed.error);const saved=h.call('dp_get_order',{id:renamed.orderId}).order.items[0];
 assert.equal(saved.name,'Combinada de Laura');assert.equal(saved.catalogName,product.name);assert.equal(saved.packagingUnitFee,4000);
 const updated=h.save('products',{...product,available:false});assert.equal(updated.available,false);
 assert.equal(h.call('dp_create_staff_order',{order:raw},'waiter').ok,false);
});
