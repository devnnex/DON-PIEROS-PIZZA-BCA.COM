const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
function setup(fulfillment='pickup',kind='Tamaño pizza QA'){
 const h=harness(),original=h.product();
 const size=h.save('toppings',{name:'Mini',kind,price:3000,available:true});
 const product=h.save('products',{name:'Pizza adicional',category:'Pizzas',price:20000,available:true,modifiers:[{id:'size',name:'Elige el tamaño',source:size.kind,required:true,min:1,max:1,usePrice:true}]});
 const receipt=h.call('createOrder',{order:h.order(original,{fulfillment,...(fulfillment==='delivery'?{address:'Calle 10 # 5-20',neighborhood:'Centro'}:{})})});
 assert.equal(receipt.ok,true,receipt.error);
 const order=h.call('dp_get_order',{id:receipt.orderId}).order;
 const payload={id:order.id,version:order.version,operationId:crypto.randomUUID(),item:{productId:product.id,quantity:2,unitPrice:23000,selectionIds:{size:[size.id]},notes:'Salsa aparte',name:'Nombre falso',packagingUnitFee:0}};
 return {h,order,payload,product,size};
}
test('agregar de la carta conserva el pedido y calcula productos, cajas y total sin cobrar ni mover inventario',()=>{
 const {h,order,payload}=setup(),inventory=JSON.stringify(h.sheets.get('Inventario').rows);
 const result=h.call('dp_add_order_product',payload);assert.equal(result.ok,true,result.error);
 const updated=result.order;assert.equal(updated.items.length,2);assert.deepEqual(updated.items[0],order.items[0]);
 assert.equal(updated.subtotal,order.subtotal+46000);assert.equal(updated.packagingFee,4000);assert.equal(updated.total,order.total+50000);
 assert.equal(updated.items[1].name,'Pizza adicional');assert.equal(updated.items[1].packagingSize,'Mini');assert.equal(updated.items[1].packagingUnitFee,2000);
 assert.equal(updated.items[1].notes,'Salsa aparte');assert.match(updated.items[1].selections[0],/Mini/);
 for(const key of ['createdAt','customerName','phone','status','queuePosition','ordersAhead','paymentMethod','fulfillment','notes'])assert.deepEqual(updated[key],order[key],key);
 assert.equal(h.sheets.get('Ventas').rows.length,1);assert.equal(JSON.stringify(h.sheets.get('Inventario').rows),inventory);
 const retry=h.call('dp_add_order_product',payload);assert.equal(retry.duplicate,true);assert.equal(retry.order.items.length,2);assert.equal(retry.order.version,updated.version);
 assert.equal(h.call('dp_add_order_product',{...payload,item:{...payload.item,quantity:3}}).ok,false,'No reutiliza una operacion con contenido distinto.');
 assert.equal(h.call('dp_add_order_product',{...payload,operationId:crypto.randomUUID()}).ok,false,'Otra adicion con version antigua se rechaza.');
});
test('la caja coincide con el selector de mesas aunque el grupo tenga un nombre personalizado',()=>{
 const {h,payload}=setup('pickup','Tamaño QA'),result=h.call('dp_add_order_product',payload);
 assert.equal(result.ok,true,result.error);assert.equal(result.order.items[1].packagingUnitFee,2000);assert.equal(result.order.total,75000);
});
test('respeta entrega en local y domicilio pendiente; acepta precio de administracion y valida el menu',()=>{
 for(const fulfillment of ['dinein','delivery']){
  const {h,order,payload,product,size}=setup(fulfillment);
  for(const token of ['waiter','limited',''])assert.equal(h.call('dp_add_order_product',payload,token).ok,false);
  for(const item of [{...payload.item,selectionIds:{}},{...payload.item,quantity:0},{...payload.item,quantity:100},{...payload.item,unitPrice:-1},{...payload.item,unitPrice:'1000'},{...payload.item,productId:crypto.randomUUID()}])assert.equal(h.call('dp_add_order_product',{...payload,item}).ok,false);
  h.save('toppings',{...size,available:false});assert.equal(h.call('dp_add_order_product',payload).ok,false);
  h.save('toppings',{...size,version:size.version+1,available:true});
  h.save('products',{...product,available:false});assert.equal(h.call('dp_add_order_product',payload).ok,false);
  h.save('products',{...product,version:product.version+1,available:true});
  assert.equal(h.call('dp_add_order_product',{...payload,item:{...payload.item,unitPrice:21000}}).ok,false,'Un precio desactualizado no se interpreta como precio manual.');
  const result=h.call('dp_add_order_product',{...payload,item:{...payload.item,unitPrice:21000,manualUnitPrice:21000}});assert.equal(result.ok,true,result.error);
  assert.equal(result.order.items[1].unitPrice,21000);assert.equal(result.order.packagingFee,fulfillment==='dinein'?0:4000);
  assert.equal(result.order.deliveryFee,order.deliveryFee);assert.equal(result.order.deliveryFeePending,order.deliveryFeePending);
 }
});
test('no agrega a pedidos retirados, entregados o cobrados; un cobro abierto con total anterior se rechaza',()=>{
 for(const status of ['cancelada','despachada','cobrada','eliminada']){
  const {h,order,payload}=setup();h.sheets.get('Ordenes_Web').rows.find(row=>row[0]===order.id)[5]=status;
  assert.equal(h.call('dp_add_order_product',payload).ok,false,status);
 }
 const {h,order,payload}=setup(),updated=h.call('dp_add_order_product',payload).order,id='walk-in-web-'+order.id;
 const invoice={id,sessionId:id,webOrderId:order.id,saleChannel:'walk_in',checkoutId:crypto.randomUUID(),createdAt:new Date().toISOString(),totals:{total:order.total},payments:[{method:'cash',amount:order.total}],items:[{id:'line',quantity:1,unit_price:order.total}]};
 assert.equal(h.call('checkout_web_order',{invoice}).ok,false);
 invoice.totals.total=updated.total;invoice.payments[0].amount=updated.total;invoice.items[0].unit_price=updated.total;
 const paid=h.call('checkout_web_order',{invoice});assert.equal(paid.ok,true,paid.error);
 assert.equal(h.call('dp_add_order_product',payload).ok,false);
});
