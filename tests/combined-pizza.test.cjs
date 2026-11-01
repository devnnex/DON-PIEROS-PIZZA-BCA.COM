const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
const packaging=require('../packaging.js');
function setup(){
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog'),product=catalog.products.find(p=>p.name==='Pizza combinada');
 const [sizeGroup,flavorGroup]=product.modifiers;
 return {h,catalog,product,sizeGroup,flavorGroup,sizes:catalog.toppings.filter(t=>t.kind===sizeGroup.source),flavors:catalog.toppings.filter(t=>t.kind===flavorGroup.source)};
}
test('combinada primero, Pamplonita segunda, cinco tamanos y todos los sabores de pizza sin bebidas',()=>{
 const {catalog,product,sizes,flavors}=setup(),specials=catalog.products.filter(p=>p.category===product.category);
 assert.equal(specials[0].id,product.id);assert.equal(specials[1].name,'Pizza La Pamplonita');
 assert.equal(sizes.length,5);assert.equal(flavors.length,22);assert.equal(new Set(flavors.map(t=>t.name.toLowerCase())).size,22);
 for(const name of ['La Pamplonita','Don Pieros','Hawaiana','Napolitana','Especial','Peperoni'])assert.ok(flavors.some(t=>t.name===name),name);
 assert.ok(!flavors.some(t=>/gaseosa|cerveza|panzerotti|lasa/i.test(t.name)));
});

test('reordena una instalación anterior una vez y conserva precios, disponibilidad y demás posiciones',()=>{
 const {h,product}=setup(),pamplonita=h.call('dp_admin_catalog').products.find(p=>p.name==='Pizza La Pamplonita');
 h.save('products',{...product,sort_order:10,price:35000,available:false});h.save('products',{...pamplonita,sort_order:5,price:49000});
 const other=h.save('products',{name:'Producto propio',category:'Especiales',price:9000,sort_order:-5,available:true});
 h.props.delete('DP_COMBINED_PIZZA_FIRST_V1');h.props.set('DP_SCHEMA_VERSION','old');h.context.ensureSystemReady_();
 const catalog=h.call('dp_admin_catalog');assert.deepEqual(catalog.products.slice(0,2).map(p=>p.id),[product.id,pamplonita.id]);
 assert.equal(catalog.products[0].price,35000);assert.equal(catalog.products[0].available,false);assert.equal(catalog.products[1].price,49000);
 assert.equal(catalog.products.find(p=>p.id===other.id).sort_order,-5);
 const before=JSON.stringify(h.sheets.get('Menu_Web').rows);h.props.set('DP_SCHEMA_VERSION','old');h.context.ensureSystemReady_();assert.equal(JSON.stringify(h.sheets.get('Menu_Web').rows),before);
});
test('cada tamano cobra una pizza, dos mitades y su caja por unidad; editar conserva ambas mitades',()=>{
 const {h,product,sizeGroup,flavorGroup,sizes,flavors}=setup(),prices=[32000,46000,63000,78000,96000];
 for(let i=0;i<sizes.length;i++){
  const size=sizes[i],unitPrice=prices[i],selectionIds={[sizeGroup.id]:[size.id],[flavorGroup.id]:flavors.slice(0,2).map(t=>t.id)};
  const raw=h.order(product,{items:[{productId:product.id,quantity:2,unitPrice,selectionIds}]});
  const result=h.call('createOrder',{order:raw});assert.equal(result.ok,true,result.error);
  const order=h.call('dp_get_order',{id:result.orderId}).order,item=order.items[0],box=i<3?2000:4000;
  assert.equal(order.total,2*(unitPrice+box));assert.equal(order.packagingFee,2*box);assert.equal(item.selections.length,3);
  const clientBox=packaging.forProduct(product,[size.name]);assert.equal(clientBox.fee,box);assert.equal(clientBox.size,packaging.size(item.packagingSize));
  const edited=h.call('dp_edit_order_product',{id:order.id,version:order.version,lineIndex:0,operationId:crypto.randomUUID(),item:{productId:product.id,name:product.name,quantity:1,unitPrice,selectionIds,notes:'Mitad y mitad'}});
  assert.equal(edited.ok,true,edited.error);assert.deepEqual(edited.order.items[0].selectionIds,selectionIds);assert.equal(edited.order.total,unitPrice+box);
  const local=h.call('createOrder',{order:{...raw,requestId:crypto.randomUUID(),fulfillment:'dinein'}});assert.equal(local.total,unitPrice*2);assert.equal(local.packagingFee,0);
 }
});
test('exige tamano y exactamente dos sabores diferentes y valida el precio',()=>{
 const {h,product,sizeGroup,flavorGroup,sizes,flavors}=setup();
 for(const chosen of [[],[flavors[0].id],[flavors[0].id,flavors[0].id],flavors.slice(0,3).map(t=>t.id),[flavors[0].id,sizes[0].id]]){
  const order=h.order(product,{items:[{productId:product.id,quantity:1,unitPrice:32000,selectionIds:{[sizeGroup.id]:[sizes[0].id],[flavorGroup.id]:chosen}}]});
  assert.equal(h.call('createOrder',{order}).ok,false);
 }
 const order=h.order(product,{items:[{productId:product.id,quantity:1,unitPrice:1,selectionIds:{[sizeGroup.id]:[sizes[0].id],[flavorGroup.id]:flavors.slice(0,2).map(t=>t.id)}}]});
 assert.equal(h.call('createOrder',{order}).ok,false);
 delete order.items[0].selectionIds[sizeGroup.id];assert.equal(h.call('createOrder',{order}).ok,false);
});
test('actualiza una hoja anterior una vez, incluye sabores propios y conserva precios y ediciones posteriores',()=>{
 const h=harness();h.props.delete('DP_INITIAL_MENU_LOADED');h.context.dpSeedInitialMenu_(h.book);
 const original=h.call('dp_admin_catalog'),pamplonita=original.products.find(p=>p.name==='Pizza La Pamplonita');
 h.save('products',{...pamplonita,price:49000});h.save('products',{name:'Pizza De la casa QA',category:'Pizzas especiales',price:50000,available:true,modifiers:[]});
 h.props.delete('DP_COMBINED_PIZZA_LOADED');h.props.set('DP_SCHEMA_VERSION','3.12.0-donpieros');h.context.ensureSystemReady_();
 const added=h.call('dp_admin_catalog'),combo=added.products.find(p=>p.name==='Pizza combinada'),flavor=added.toppings.find(t=>t.kind==='Sabor pizza combinada'&&t.name==='De la casa QA');
 assert.ok(flavor);assert.equal(added.products.find(p=>p.id===pamplonita.id).price,49000);assert.equal(added.products.length,53);
 h.save('products',{...combo,price:33000,available:false});h.save('toppings',{...flavor,available:false});
 h.props.set('DP_SCHEMA_VERSION','old');h.context.ensureSystemReady_();h.context.CARGAR_MENU_INICIAL_DON_PIEROS();
 const repeated=h.call('dp_admin_catalog');assert.equal(repeated.products.length,53);assert.equal(repeated.products.find(p=>p.id===combo.id).price,33000);assert.equal(repeated.products.find(p=>p.id===combo.id).available,false);assert.equal(repeated.toppings.find(t=>t.id===flavor.id).available,false);
});

test('reintentar la actualizacion despues de escribir no repite opciones ni mueve de nuevo los productos',()=>{
 const h=harness();h.props.delete('DP_INITIAL_MENU_LOADED');h.context.dpSeedInitialMenu_(h.book);
 h.props.delete('DP_COMBINED_PIZZA_LOADED');h.props.set('DP_SCHEMA_VERSION','old');
 const flush=h.context.SpreadsheetApp.flush;h.context.SpreadsheetApp.flush=()=>{throw Error('Respuesta perdida');};
 assert.throws(()=>h.context.ensureSystemReady_(),/Respuesta perdida/);
 const before=JSON.stringify([h.sheets.get('Menu_Web').rows,h.sheets.get('Adicionales_Web').rows]);h.context.SpreadsheetApp.flush=flush;
 h.context.ensureSystemReady_();assert.equal(JSON.stringify([h.sheets.get('Menu_Web').rows,h.sheets.get('Adicionales_Web').rows]),before);
 assert.equal(h.props.get('DP_COMBINED_PIZZA_LOADED'),'1');
});

test('los nombres propios de sabores se guardan como texto',()=>{
 const h=harness();h.save('products',{name:'Pizza =1+1',category:'Pizzas especiales',price:32000,available:true,modifiers:[]});
 h.props.delete('DP_COMBINED_PIZZA_LOADED');h.context.dpSeedCombinedPizza_(h.book);
 const row=h.sheets.get('Adicionales_Web').rows.find(row=>row[2]==='Sabor pizza combinada');assert.equal(row[1],"'=1+1");
});
