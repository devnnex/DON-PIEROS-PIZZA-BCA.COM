const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
function setup(extra={}){
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),product=catalog.products.find(p=>p.name==='Pizza Don Pieros'),group=product.modifiers[0],size=catalog.toppings.find(t=>t.kind===group.source&&t.name.startsWith('Mediana'));
 const receipt=h.call('createOrder',{order:h.order(product,{...extra,items:[{productId:product.id,quantity:2,unitPrice:product.price+size.price,selectionIds:{[group.id]:[size.id]}}]})});
 const id='walk-in-web-'+receipt.orderId,invoice={id,sessionId:id,saleChannel:'walk_in',webOrderId:receipt.orderId,checkoutId:crypto.randomUUID(),createdAt:'2026-10-30T20:00:00Z',number:'QA-1',payerName:'Cliente',waiterName:'Pedido web',cashierName:'Jefe',cashierId:'boss-id',cashierRole:'boss',fulfillment:'pickup',tipAmount:0,
  totals:{subtotal:receipt.total,total:receipt.total},payments:[{method:'cash',amount:receipt.total}],items:[{id:'line',item_name:product.name,quantity:2,unit_price:receipt.total/2}]};
 return {h,invoice,receipt};
}

test('cobro web sin inventario evita leer movimientos e inventario y conserva el recibo financiero recuperable',()=>{
 const {h,invoice}=setup();let inventoryWrites=0;
 const write=h.context.writeInventoryRows_;h.context.writeInventoryRows_=(...args)=>{inventoryWrites++;return write(...args);};
 h.reads.length=0;const result=h.call('checkout_web_order',{invoice});assert.equal(result.ok,true,result.error);
 assert.equal(inventoryWrites,0);assert.equal('items' in result,false,'No devuelve un inventario vacío como si fuera una instantánea.');
 assert.ok(!h.reads.some(read=>['Inventario','Movimientos_Inventario'].includes(read.sheet)));
 const retry=h.call('checkout_web_order',{invoice});assert.equal(retry.duplicate,true);assert.equal(inventoryWrites,0);
 assert.equal(h.sheets.get('Ventas').rows.length,2);assert.equal(h.sheets.get('Pagos').rows.length,2);
});

test('la ruta web con artículos de inventario sigue descontando una sola vez',()=>{
 const {h,invoice}=setup(),id=crypto.randomUUID();
 assert.equal(h.call('upsert_inventory',{item:{productId:id,name:'Bebida QA',stock:12,salePrice:1000,costPrice:500}}).ok,true);
 invoice.items[0].menu_item_id=id;h.reads.length=0;
 const result=h.call('checkout_web_order',{invoice});assert.equal(result.ok,true,result.error);
 assert.equal(result.items.find(item=>item.productId===id).stock,10);
 assert.equal(h.call('checkout_web_order',{invoice}).items.find(item=>item.productId===id).stock,10);
 assert.ok(!h.reads.some(read=>read.sheet==='Movimientos_Inventario'),'Una venta individual no concilia consumos de mesas.');
});
test('cobrar pedido crea una venta individual y lo retira de recepción, reintento sin duplicar',()=>{
 const {h,invoice,receipt}=setup(),result=h.call('checkout_web_order',{invoice});assert.equal(result.ok,true,result.error);
 assert.equal(h.call('dp_get_orders',{status:'all'}).orders.length,0);
 assert.equal(h.call('dp_get_order',{id:receipt.orderId}).order.status,'cobrada');
 const rows=h.sheets.get('Ventas').rows;assert.equal(rows.length,2);assert.equal(rows[1][17],'Jefe');assert.equal(rows[1][7],'Pedido web');assert.equal(rows[1][19],receipt.orderId);
 assert.equal(h.call('checkout_web_order',{invoice}).duplicate,true);assert.equal(rows.length,2);
 const second=h.call('checkout_web_order',{invoice:{...invoice,checkoutId:crypto.randomUUID()}});assert.equal(second.ok,false);assert.equal(second.alreadyPaid,true);assert.equal(rows.length,2);
});
test('un importe equivocado o un mesero no puede cobrar ni retirar la orden',()=>{
 const {h,invoice}=setup();assert.equal(h.call('checkout_web_order',{invoice},'waiter').ok,false);
 const bad=structuredClone(invoice);bad.totals.total=1;bad.payments[0].amount=1;
 assert.equal(h.call('checkout_web_order',{invoice:bad}).ok,false);assert.equal(h.sheets.get('Ventas').rows.length,1);assert.equal(h.call('dp_get_orders').orders.length,1);
});
test('una respuesta perdida después del registro se recupera con la misma operación',()=>{
 const {h,invoice}=setup();const mark=h.context.dpFinishWebSale_;let once=true;
 h.context.dpFinishWebSale_=value=>{if(once){once=false;throw Error('Corte de conexión');}return mark(value);};
 assert.equal(h.call('checkout_web_order',{invoice}).ok,false);
 assert.equal(h.call('checkout_web_order',{invoice}).ok,true);assert.equal(h.sheets.get('Ventas').rows.length,2);assert.equal(h.call('dp_get_orders').orders.length,0);
});
test('cobra productos y cajas, mantiene el domicilio Por confirmar y admite propina',()=>{
 const {h,invoice,receipt}=setup({fulfillment:'delivery',address:'Calle 10 numero 20',neighborhood:'Barrio nuevo'});
 const bad=structuredClone(invoice);bad.webDeliveryFee=5000;bad.items.push({id:'delivery',item_name:'Domicilio',quantity:1,unit_price:5000});bad.totals.total+=5000;bad.payments[0].amount+=5000;
 assert.equal(h.call('checkout_web_order',{invoice:bad}).ok,false);
 invoice.webDeliveryFee=0;invoice.fulfillment='delivery';
 invoice.tipAmount=1000;invoice.totals.total+=1000;invoice.payments[0].amount=invoice.totals.total;
 const result=h.call('checkout_web_order',{invoice});assert.equal(result.ok,true,result.error);
 const order=h.call('dp_get_order',{id:receipt.orderId}).order;assert.equal(order.deliveryFeePending,true);assert.equal(order.deliveryFee,0);assert.equal(order.total,receipt.total);
 assert.equal(h.sheets.get('Ventas').rows[1][23],true);
 h.context.Utilities.formatDate=()=> '2026-10-30';
 const report=h.call('get_income_report',{filters:{dateFrom:'2026-10-30',dateTo:'2026-10-30'}});assert.equal(report.ok,true,report.error);assert.equal(report.records[0].deliveryFeePending,true);
});
