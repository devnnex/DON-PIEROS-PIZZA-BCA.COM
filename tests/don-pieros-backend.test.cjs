const test=require('node:test'),assert=require('node:assert/strict');const {harness}=require('./helpers/don-pieros-gas.cjs');
test('la primera petición crea la estructura en la hoja nueva sin productos, ventas ni pedidos',()=>{
 const h=harness();const health=JSON.parse(h.context.doGet().value);assert.equal(health.ok,true);assert.equal(health.configured,true);assert.equal(health.spreadsheetId,h.book.getId());
 for(const name of ['Inventario','Ventas','Detalle_Ventas','Ordenes_Web','Menu_Web','Adicionales_Web','Barrios_Web']){assert.ok(h.sheets.has(name));assert.equal(h.sheets.get(name).getLastRow(),1);}
 h.context.ensureSystemReady_();assert.equal(h.sheets.get('Pagos_Web').getLastRow(),2);
});
test('los precios vienen de Sheets, la orden se guarda una vez y la cola cuenta pedidos activos',()=>{
 const h=harness(),p=h.product(),order=h.order(p);const first=h.call('createOrder',{order});assert.equal(first.ok,true);assert.equal(first.total,25000);assert.equal(first.queuePosition,1);
 const retry=h.call('createOrder',{order});assert.equal(retry.orderId,first.orderId);assert.equal(retry.duplicate,true);assert.equal(h.sheets.get('Ordenes_Web').getLastRow(),2);
 const second=h.call('createOrder',{order:h.order(p)});assert.equal(second.queuePosition,2);assert.equal(second.ordersAhead,1);assert.notEqual(first.orderId,second.orderId);
 const forged=h.order(p);forged.items[0].unitPrice=1;assert.equal(h.call('createOrder',{order:forged}).ok,false);assert.equal(h.sheets.get('Ordenes_Web').getLastRow(),3);
 const rows=h.call('dp_get_orders',{status:'active'}).orders;h.call('dp_update_order',{id:rows[1].id,status:'despachada',version:1});
 const third=h.call('createOrder',{order:h.order(p)});assert.equal(third.ordersAhead,1);assert.equal(third.queuePosition,2);
});
test('domicilios y medios de pago se validan contra la hoja',()=>{
 const h=harness(),p=h.product(),n=h.save('neighborhoods',{name:'Centro',delivery_fee:4000,available:true});
 const order=h.order(p,{fulfillment:'delivery',address:'Calle 10 # 2-30',neighborhoodId:n.id,deliveryFee:4000,subtotal:1});
 const result=h.call('createOrder',{order});assert.equal(result.ok,true);assert.equal(result.total,29000);assert.equal(result.subtotal,25000);
 assert.equal(h.call('createOrder',{order:h.order(p,{paymentId:'cuenta-falsa'})}).ok,false);
 assert.equal(h.call('createOrder',{order:h.order(p,{fulfillment:'delivery',address:'Calle 1',neighborhoodId:n.id,deliveryFee:0})}).ok,false);
});
test('los adicionales requieren disponibilidad y se recalculan en el servidor',()=>{
 const h=harness(),extra=h.save('toppings',{name:'Queso',kind:'Extra',price:3000,available:true});
 const p=h.save('products',{name:'Pizza extra',price:20000,available:true,modifiers:[{id:'extras',name:'Extra',source:'Extra',min:1,max:2,required:true,usePrice:true}]});
 const missing=h.order(p);assert.equal(h.call('createOrder',{order:missing}).ok,false);
 const order=h.order(p);order.items[0].selectionIds={extras:[extra.id]};order.items[0].unitPrice=23000;
 const result=h.call('createOrder',{order});assert.equal(result.ok,true);assert.equal(result.total,23000);
 h.save('toppings',{...extra,available:false});assert.equal(h.call('createOrder',{order:h.order(p)}).ok,false);
});
test('pedidos privados, roles, conflictos de versión y revisiones',()=>{
 const h=harness(),p=h.product();assert.equal(h.call('dp_get_orders',{},'').ok,false);assert.equal(h.call('dp_get_orders',{},'limited').ok,false);assert.equal(h.call('dp_admin_catalog',{},'waiter').ok,false);
 h.call('createOrder',{order:h.order(p)});const list=h.call('dp_get_orders',{},'waiter'),row=list.orders[0];assert.equal(list.ok,true);
 const change=h.call('dp_update_order',{id:row.id,status:'atendiendo',version:1},'waiter');assert.equal(change.ok,true);
 assert.notEqual(h.call('dp_order_status',{},'waiter').revision,list.revision);
 assert.equal(h.call('dp_update_order',{id:row.id,status:'despachada',version:1},'waiter').ok,false);
 assert.equal(h.call('dp_update_order',{id:row.id,status:'pagada',version:2}).ok,false);
});
test('los cambios del catálogo conservan versiones, borran caché y evitan fórmulas',()=>{
 const h=harness(),p=h.product();h.call('dp_get_catalog',{},'');assert.ok(h.cache.has('DP_CATALOG'));
 const saved=h.save('products',{...p,name:'=IMPORTXML("x")',price:27000});assert.equal(saved.version,2);assert.equal(h.cache.has('DP_CATALOG'),false);
 assert.ok(h.sheets.get('Menu_Web').rows[1][1].startsWith("'="));
 assert.equal(h.call('dp_save_catalog',{kind:'products',item:p}).ok,false);
 assert.equal(h.call('dp_delete_catalog',{kind:'products',id:p.id,version:1}).ok,false);
 assert.equal(h.call('dp_delete_catalog',{kind:'products',id:p.id,version:2}).ok,true);
});
test('una respuesta perdida después de escribir conserva la orden, publica revisión y no repite el consecutivo',()=>{
 const h=harness(),p=h.product(),order=h.order(p);let first=true;
 h.context.SpreadsheetApp.flush=()=>{if(first){first=false;throw Error('Respuesta perdida después de escribir');}};
 const result=h.call('createOrder',{order});assert.equal(result.ok,false);assert.equal(h.sheets.get('Ordenes_Web').getLastRow(),2);assert.notEqual(h.call('dp_order_status').revision,'0');
 const retry=h.call('createOrder',{order});assert.equal(retry.ok,true);assert.equal(retry.duplicate,true);assert.equal(retry.sequence,1);
 assert.equal(h.call('createOrder',{order:h.order(p)}).sequence,2);assert.equal(h.sheets.get('Ordenes_Web').getLastRow(),3);
});
test('la paginación y el turno no descargan el detalle de todas las órdenes históricas',()=>{
 const h=harness(),p=h.product();h.call('createOrder',{order:h.order(p)});const sheet=h.sheets.get('Ordenes_Web'),template=sheet.rows[1];
 for(let i=2;i<=2000;i++){const row=template.slice();row[0]='DP-history-'+i;row[1]='history-'+i;row[2]=i;row[5]='despachada';sheet.rows.push(row);}
 h.reads.length=0;const page=h.call('dp_get_orders',{status:'all',offset:60,limit:60});assert.equal(page.orders.length,60);assert.equal(page.total,2000);
 assert.ok(h.reads.filter(read=>read.sheet==='Ordenes_Web'&&read.cols>6).every(read=>read.rows<=60));
 h.reads.length=0;const created=h.call('createOrder',{order:h.order(p)});assert.equal(created.sequence,2001);assert.equal(created.ordersAhead,1);
 assert.ok(h.reads.filter(read=>read.sheet==='Ordenes_Web').every(read=>read.cols<=6));
});
test('la carta inicial contiene los 51 productos, tamaños y dos mitades repetibles sin duplicarse ni sobrescribir ediciones',()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_admin_catalog');assert.equal(catalog.products.length,51);assert.equal(catalog.toppings.length,15);
 assert.equal(catalog.products.find(p=>p.name==='Gaseosa 1,5 litros').price,9000);
 const p=catalog.products.find(p=>p.name==='Pizza Hawaiana'&&p.category==='Pizzas sencillas'),size=catalog.toppings.find(t=>t.kind==='Tamaño pizza sencilla'&&t.name==='Mediana · 37 × 37 cm'),second=catalog.toppings.find(t=>t.kind==='Sabor pizza sencilla'&&t.name==='Hawaiana');
 const order=h.order(p);order.items[0].unitPrice=56000;order.items[0].selectionIds={[p.modifiers[0].id]:[size.id],[p.modifiers[1].id]:[second.id]};
 assert.equal(h.call('createOrder',{order}).total,56000);
 h.save('products',{...p,price:44000,available:false});h.context.CARGAR_MENU_INICIAL_DON_PIEROS();
 const refreshed=h.call('dp_admin_catalog');assert.equal(refreshed.products.length,51);assert.equal(refreshed.products.find(row=>row.id===p.id).price,44000);assert.equal(refreshed.products.find(row=>row.id===p.id).available,false);
});
