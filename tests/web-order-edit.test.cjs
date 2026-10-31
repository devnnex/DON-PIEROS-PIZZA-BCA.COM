const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
function setup(){
 const h=harness(),p=h.product(),receipt=h.call('createOrder',{order:h.order(p,{items:[{productId:p.id,quantity:2,unitPrice:p.price,selectionIds:{}}]})});
 assert.equal(receipt.ok,true,receipt.error);
 const order=h.call('dp_get_order',{id:receipt.orderId}).order;
 const payload={id:order.id,version:order.version,lines:[{productId:p.id,unitPrice:35000,packagingSize:'Super maxi'}]};
 return {h,p,order,payload};
}
test('editar precios y cajas guarda cantidades, calcula totales y es idempotente al reintentar',()=>{
 const {h,payload}=setup();const result=h.call('dp_edit_order',payload);
 assert.equal(result.ok,true,result.error);assert.equal(result.order.subtotal,70000);assert.equal(result.order.packagingFee,8000);assert.equal(result.order.total,78000);
 assert.equal(result.order.items[0].quantity,2);assert.equal(result.order.items[0].packagingUnitFee,4000);
 const retry=h.call('dp_edit_order',payload);assert.equal(retry.ok,true);assert.equal(retry.duplicate,true);assert.equal(retry.order.version,result.order.version);
 const changed=h.call('dp_edit_order',{...payload,version:result.order.version,lines:[{...payload.lines[0],packagingSize:'Mini'}]});assert.equal(changed.order.total,74000);
 assert.equal(h.call('dp_edit_order',{...payload,lines:[{...payload.lines[0],unitPrice:45000}]}).ok,false,'Una edición antigua no sobrescribe precios nuevos.');
});
test('solo administración edita, rechaza precios inválidos y cajas en bebidas',()=>{
 const {h,p,payload}=setup();for(const token of ['waiter','limited'])assert.equal(h.call('dp_edit_order',payload,token).ok,false);
 for(const price of [-1,0.5,null,'',100000001])assert.equal(h.call('dp_edit_order',{...payload,lines:[{...payload.lines[0],unitPrice:price}]}).ok,false);
 assert.equal(h.call('dp_edit_order',{...payload,lines:[]}).ok,false);
 const drink=h.save('products',{name:'Gaseosa',category:'Bebidas',price:5000,available:true,modifiers:[]});
 const receipt=h.call('createOrder',{order:h.order(drink)}),order=h.call('dp_get_order',{id:receipt.orderId}).order;
 assert.equal(h.call('dp_edit_order',{id:order.id,version:order.version,lines:[{productId:drink.id,unitPrice:5000,packagingSize:'Mini'}]}).ok,false);
 assert.equal(h.call('dp_get_order',{id:payload.id}).order.items[0].unitPrice,p.price);
});
test('el cobro usa el total editado y no permite cambiar un pedido ya cobrado',()=>{
 const {h,order,payload}=setup(),updated=h.call('dp_edit_order',payload).order,id='walk-in-web-'+order.id;
 const invoice={id,sessionId:id,webOrderId:order.id,saleChannel:'walk_in',checkoutId:crypto.randomUUID(),number:'QA-EDIT',createdAt:new Date().toISOString(),tipAmount:0,
  totals:{subtotal:order.total,total:order.total},payments:[{method:'cash',amount:order.total}],items:[{id:'line',item_name:'Pizza prueba',quantity:2,unit_price:order.total/2}]};
 assert.equal(h.call('checkout_web_order',{invoice}).ok,false,'Un cobro abierto con el precio anterior se rechaza.');
 invoice.totals={subtotal:updated.total,total:updated.total};invoice.payments[0].amount=updated.total;invoice.items[0].unit_price=updated.total/2;
 const paid=h.call('checkout_web_order',{invoice});assert.equal(paid.ok,true,paid.error);
 assert.equal(h.call('dp_edit_order',{...payload,version:updated.version}).ok,false);
});
