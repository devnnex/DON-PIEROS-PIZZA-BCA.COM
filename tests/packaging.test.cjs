const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/don-pieros-gas.cjs'),boxes=require('../packaging.js');

test('domicilio conserva entrega y notas, cobra una caja por unidad y permite cambiar a local',()=>{
 for(const size of Object.keys(boxes.sizes)){
  const notes=boxes.note('Salsa aparte',size,'delivery'),saved=boxes.read(notes);
  assert.equal(saved.fulfillment,'delivery');assert.equal(saved.fee,boxes.fee(size));assert.equal(saved.notes,'Salsa aparte');
  const line=boxes.breakdown({quantity:3,unit_price:20000+saved.fee,notes});
  assert.equal(line.products,60000);assert.equal(line.packagingTotal,3*saved.fee);assert.equal(line.total,60000+3*saved.fee);
  assert.equal(boxes.note(notes,size,'delivery'),notes,'Reeditar no duplica el cobro ni la nota.');
  assert.equal(boxes.note(notes,'','dinein'),'Salsa aparte');
  assert.equal(boxes.read(boxes.note(notes,size,'pickup')).fulfillment,'pickup');
 }
 const fields={packing_mode:{value:'delivery'},packing_size:{value:'maxi'}};
 const form={elements:{namedItem:name=>fields[name]}};
 assert.equal(boxes.draft(form,'Pizza Maxi',20000,'Sin cebolla').unitPrice,24000);
 assert.deepEqual(boxes.draft(form,'Gaseosa',4000,'Sin hielo'),{unitPrice:4000,notes:'Sin hielo\nDomicilio'});
 assert.equal(boxes.read('Sin hielo\nDomicilio').fulfillment,'delivery');
});

test('el desglose impreso separa las cajas incluidas en ventas individuales y mesas y las cajas adicionales de pedidos web',()=>{
 const note=boxes.note('Sin cebolla','maxi');
 const individual=boxes.breakdown({quantity:2,unit_price:82000,notes:note});
 const web=boxes.breakdown({quantity:2,unitPrice:78000,packagingUnitFee:4000,packagingSize:'Maxi',notes:'Sin cebolla'});
 for(const line of [individual,web,boxes.breakdown({quantity:2,unit_price:82000,waiter_line_notes:note})]){
  assert.equal(line.unitPrice,78000);assert.equal(line.products,156000);assert.equal(line.packagingTotal,8000);assert.equal(line.total,164000);assert.equal(line.packagingSize,'Maxi');assert.equal(line.notes,'Sin cebolla');
 }
 const complete=boxes.breakdown({quantity:2,unit_price:82000,waiter_line_notes:'Sin cebolla',packagingUnitFee:4000,packagingSize:'Maxi'});
 assert.equal(complete.products,156000);assert.equal(complete.packagingTotal,8000);assert.equal(complete.total,164000);
 assert.equal(boxes.breakdown({quantity:2,unit_price:78000,notes:''}).packagingTotal,0);
});
test('cajas por tamaño: servidor calcula cantidad, conserva recibo y no cobra en mesa',()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog');
 const pizza=catalog.products.find(p=>p.name==='Pizza Don Pieros'),sizeGroup=pizza.modifiers[0];
 for(const option of catalog.toppings.filter(t=>t.kind===sizeGroup.source))for(const fulfillment of ['pickup','delivery','dinein']){
  const fee=/Maxi/i.test(option.name)?4000:2000;
  const order=h.order(pizza,{fulfillment,address:'Calle 10 numero 20',neighborhood:'Barrio nuevo',packagingFee:0,
   items:[{productId:pizza.id,quantity:3,unitPrice:pizza.price+option.price,packagingUnitFee:0,selectionIds:{[sizeGroup.id]:[option.id]}}]});
  const result=h.call('createOrder',{order});assert.equal(result.ok,true,result.error);
  assert.equal(result.packagingFee,fulfillment==='dinein'?0:fee*3);
  assert.equal(result.total,result.subtotal+result.packagingFee);
  const saved=h.call('dp_get_order',{id:result.orderId}).order;
  assert.equal(saved.fulfillment,fulfillment);assert.equal(saved.packagingFee,result.packagingFee);
  assert.equal(h.call('createOrder',{order}).total,result.total,'El reintento no duplica cajas');
  assert.equal(boxes.forProduct(pizza,[option.name]).fee,fee,'La vista coincide con el servidor');
 }
 const pizzeta=catalog.products.find(p=>p.category==='Pizzetas');
 assert.equal(h.call('createOrder',{order:h.order(pizzeta)}).packagingFee,2000);
 assert.equal(h.call('createOrder',{order:h.order(pizzeta,{fulfillment:'dinein'})}).packagingFee,0);
 const drink=catalog.products.find(p=>p.category==='Bebidas');assert.equal(h.call('createOrder',{order:h.order(drink)}).packagingFee,0);
});
test('editar consumo conserva precio base, notas y una sola caja por unidad',()=>{
 const fields={packing_mode:{value:'takeaway'},packing_size:{value:'maxi'}};
 const form={elements:{namedItem:name=>fields[name]},item_name:{value:'Pizza Don Pieros'},querySelector:()=>null};
 const a=boxes.draft(form,'Pizza Don Pieros',78000,'Sin cebolla');assert.equal(a.unitPrice,82000);
 assert.equal(boxes.read(a.notes).fee,4000);assert.equal(boxes.read(a.notes).notes,'Sin cebolla');
 const b=boxes.draft(form,'Pizza Don Pieros',a.unitPrice-boxes.read(a.notes).fee,a.notes);
 assert.deepEqual(b,a);fields.packing_mode.value='local';
 assert.deepEqual(boxes.draft(form,'Pizza Don Pieros',78000,a.notes),{unitPrice:78000,notes:'Sin cebolla'});
 assert.deepEqual(boxes.draft({...form,elements:{namedItem:name=>({value:name==='packing_mode'?'takeaway':'mini'})}},'Gaseosa',4000,''),{unitPrice:4000,notes:'Recoger en local'});
});
test('el historial devuelve la caja de la venta para reimprimir en otro equipo',()=>{
 const h=harness(),note=boxes.note('Sin cebolla','maxi');
 h.context.Utilities.formatDate=()=> '2026-10-30';
 h.sheets.get('Ventas').rows.push(['sale','F-1','session','','Mesa 1','2026-10-30T20:00:00Z','Ana','Mesero',164000,0,0,0,164000,'cash','','Panel','']);
 h.sheets.get('Detalle_Ventas').rows.push(['sale','F-1','line','product','Pizza Don Pieros',2,82000,164000,0,0,164000,note]);
 const report=h.call('get_income_report',{filters:{dateFrom:'2026-10-30',dateTo:'2026-10-30'}});assert.equal(report.ok,true,report.error);
 assert.equal(report.records[0].items[0].notes,note);assert.equal(report.records[0].items[0].unitPrice,82000);
 assert.equal(report.totals.income,164000);assert.equal(boxes.read(report.records[0].items[0].notes).fee,4000);
});

test('porciones, lasañas, panzerottis y pizzetas cobran por unidad en carta y meseros; en local no cobran',()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog');
 const products=catalog.products.filter(product=>/Porciones|Lasañas|Pizzetas/.test(product.category));assert.ok(products.length>20);
 for(const product of products)for(const fulfillment of ['pickup','delivery','dinein']){
  const expected=product.category==='Porciones'?500:product.category==='Pizzetas'?2000:1500;
  const box=boxes.forProduct(product);assert.equal(box.fee,expected,product.name);
  const quantity=2,line={productId:product.id,quantity,unitPrice:product.price,selectionIds:{},notes:'Salsa aparte',fulfillment};
  const order=h.order(product,{fulfillment,address:'Carrera 10 #20-30',neighborhood:'Barrio nuevo',items:[line]});
  for(const action of ['createOrder','dp_create_staff_order']){
   const raw=action==='createOrder'?order:{requestId:require('node:crypto').randomUUID(),customerName:'Laura',items:[line],notes:''};
   const result=h.call(action,{order:raw},action==='createOrder'?'boss':'waiter');assert.equal(result.ok,true,product.name+': '+result.error);
   const fee=fulfillment==='dinein'?0:expected;
   assert.equal(result.packagingFee,quantity*fee,product.name);assert.equal(result.total,quantity*(product.price+fee));
   const saved=h.call('dp_get_order',{id:result.orderId}).order.items[0];assert.equal(saved.packagingUnitFee,fee);
   assert.equal(h.call(action,{order:raw},action==='createOrder'?'boss':'waiter').total,result.total,'El reintento no repite empaques.');
  }
 }
});

test('caja manual, notas y reimpresión conservan tarifas nuevas al editar y cambiar entrega',()=>{
 for(const [name,kind,expected] of [['Porción de pizza Maxi','porcion',500],['Lasaña marinera','lasana',1500],['Boloñesa','lasana',1500],['Panzerotti especial','panzerotti',1500],['Panceroti de pollo','panzerotti',1500],['Pizzeta hawaiana','pizzeta',2000]]){
  assert.equal(boxes.forProduct({name}).size,kind);
  const fields={packing_mode:{value:'delivery'},packing_size:{value:'maxi'}};
  const form={elements:{namedItem:name=>fields[name]}};
  const draft=boxes.draft(form,name,20000,'Salsa aparte');assert.equal(draft.unitPrice,20000+expected);
  const packing=boxes.read(draft.notes);assert.equal(packing.size,kind);assert.equal(packing.fee,expected);assert.equal(packing.fulfillment,'delivery');
  assert.equal(boxes.note(draft.notes,kind,'pickup').split('Caja').length,2,'La edición no duplica el empaque.');
  const printed=boxes.breakdown({quantity:3,unit_price:draft.unitPrice,notes:draft.notes});assert.equal(printed.products,60000);assert.equal(printed.packagingTotal,3*expected);
  fields.packing_mode.value='local';assert.deepEqual(boxes.draft(form,name,20000,draft.notes),{unitPrice:20000,notes:'Salsa aparte'});
  assert.equal(boxes.note(draft.notes,kind,'dinein'),'Salsa aparte');
 }
 assert.deepEqual(boxes.choices({name:'Porción hawaiana'}),['porcion']);assert.deepEqual(boxes.choices({name:'Gaseosa'}),[]);
});

test('el editor de precios web conserva el empaque correcto y rechaza cajas de otra familia',()=>{
 const h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog');
 for(const name of ['Porción hawaiana','Lasaña marinera','Panzerotti hawaiano','Pizzeta hawaiana']){
  const product=catalog.products.find(product=>product.name===name),box=boxes.forProduct(product);
  const receipt=h.call('createOrder',{order:h.order(product,{items:[{productId:product.id,quantity:2,unitPrice:product.price,selectionIds:{}}]})});
  let order=h.call('dp_get_order',{id:receipt.orderId}).order;
  const result=h.call('dp_edit_order',{id:order.id,version:order.version,lines:[{productId:product.id,unitPrice:product.price+1000,packagingSize:boxes.sizes[box.size]}]});
  assert.equal(result.ok,true,result.error);assert.equal(result.order.packagingFee,2*box.fee);assert.equal(result.order.total,2*(product.price+1000+box.fee));
  assert.equal(h.call('dp_edit_order',{id:order.id,version:result.order.version,lines:[{productId:product.id,unitPrice:product.price,packagingSize:'Super maxi'}]}).ok,false);
 }
});
