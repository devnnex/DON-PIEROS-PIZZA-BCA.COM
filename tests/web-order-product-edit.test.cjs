const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
function setup(){
 const h=harness(),first=h.product();
 const mini=h.save('toppings',{name:'Mini',kind:'Tamaño pizza QA',price:0,available:true});
 const maxi=h.save('toppings',{name:'Maxi',kind:mini.kind,price:10000,available:true});
 const product=h.save('products',{name:'Pizza extra',category:'Pizzas',price:20000,available:true,modifiers:[{id:'size',name:'Elige el tamaño',source:mini.kind,required:true,min:1,max:1,usePrice:true}]});
 const receipt=h.call('createOrder',{order:h.order(first)}),original=h.call('dp_get_order',{id:receipt.orderId}).order;
 const added=h.call('dp_add_order_product',{id:original.id,version:original.version,operationId:crypto.randomUUID(),item:{productId:product.id,quantity:2,unitPrice:20000,selectionIds:{size:[mini.id]},notes:'Nota inicial'}});
 assert.equal(added.ok,true,added.error);
 const order=added.order,payload={id:order.id,version:order.version,operationId:crypto.randomUUID(),lineIndex:1,item:{productId:product.id,quantity:3,unitPrice:30000,selectionIds:{size:[maxi.id]},notes:'Sin cebolla'}};
 return {h,order,payload,mini,maxi};
}
test('edita el producto agregado con cantidad, tamaño, notas y total; conserva las demas lineas y reintenta sin duplicar',()=>{
 const {h,order,payload,maxi}=setup(),inventory=JSON.stringify(h.sheets.get('Inventario').rows),result=h.call('dp_edit_order_product',payload);
 assert.equal(result.ok,true,result.error);const updated=result.order;
 assert.equal(updated.items.length,2);assert.deepEqual(updated.items[0],order.items[0]);assert.equal(updated.items[1].quantity,3);
 assert.equal(updated.items[1].packagingSize,'Maxi');assert.equal(updated.items[1].packagingUnitFee,4000);assert.equal(updated.items[1].notes,'Sin cebolla');
 assert.deepEqual(updated.items[1].selectionIds,{size:[maxi.id]});assert.equal(updated.items[1].additionId,order.items[1].additionId);
 assert.equal(updated.subtotal,115000);assert.equal(updated.packagingFee,12000);assert.equal(updated.total,127000);
 for(const field of ['createdAt','status','customerName','phone','queuePosition','deliveryFee','deliveryFeePending','notes'])assert.deepEqual(updated[field],order[field]);
 const retry=h.call('dp_edit_order_product',payload);assert.equal(retry.duplicate,true);assert.equal(retry.order.version,updated.version);assert.equal(retry.order.items.length,2);
 assert.equal(h.call('dp_edit_order_product',{...payload,item:{...payload.item,quantity:4}}).ok,false);
 assert.equal(h.call('dp_edit_order_product',{...payload,operationId:crypto.randomUUID()}).ok,false);
 assert.equal(h.sheets.get('Ventas').rows.length,1);assert.equal(JSON.stringify(h.sheets.get('Inventario').rows),inventory);
});
test('tambien edita una linea original y respeta precio manual, permisos, indices y opciones obligatorias',()=>{
 const {h,order,payload}=setup();
 for(const token of ['waiter','limited',''])assert.equal(h.call('dp_edit_order_product',payload,token).ok,false);
 for(const patch of [{lineIndex:-1},{lineIndex:90},{lineIndex:0.5},{item:{...payload.item,quantity:0}},{item:{...payload.item,quantity:100}},{item:{...payload.item,selectionIds:{}}},{item:{...payload.item,productId:order.items[0].productId}},{item:{...payload.item,unitPrice:1}}])assert.equal(h.call('dp_edit_order_product',{...payload,...patch}).ok,false);
 const result=h.call('dp_edit_order_product',{...payload,lineIndex:0,item:{productId:order.items[0].productId,quantity:4,unitPrice:26000,manualUnitPrice:26000,selectionIds:{},notes:'Nueva nota'}});
 assert.equal(result.ok,true,result.error);assert.equal(result.order.items[0].quantity,4);assert.equal(result.order.items[0].unitPrice,26000);assert.deepEqual(result.order.items[1],order.items[1]);
});
test('no edita pedidos cerrados y rechaza cobros preparados con el total anterior',()=>{
 for(const status of ['cobrada','eliminada','cancelada','despachada']){
  const {h,order,payload}=setup();h.sheets.get('Ordenes_Web').rows.find(row=>row[0]===order.id)[5]=status;assert.equal(h.call('dp_edit_order_product',payload).ok,false);
 }
 const {h,order,payload}=setup(),result=h.call('dp_edit_order_product',payload),id='walk-in-web-'+order.id;
 const invoice={id,sessionId:id,webOrderId:order.id,saleChannel:'walk_in',checkoutId:crypto.randomUUID(),createdAt:new Date().toISOString(),totals:{total:order.total},payments:[{method:'cash',amount:order.total}],items:[{id:'line',quantity:1,unit_price:order.total}]};
 assert.equal(h.call('checkout_web_order',{invoice}).ok,false);
 invoice.totals.total=result.order.total;invoice.payments[0].amount=result.order.total;invoice.items[0].unit_price=result.order.total;
 const paid=h.call('checkout_web_order',{invoice});assert.equal(paid.ok,true,paid.error);
});
