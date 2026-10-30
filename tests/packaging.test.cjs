const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/don-pieros-gas.cjs'),boxes=require('../packaging.js');
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
