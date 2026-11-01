const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');

function setup(){
 const h=harness(),p=h.product(),receipt=h.call('createOrder',{order:h.order(p)});
 const order=h.call('dp_get_order',{id:receipt.orderId}).order;
 const products=h.sheets.get('Menu_Web'),history=h.sheets.get('Ordenes_Web');
 for(let i=0;i<2000;i++){
  const productRow=products.rows[1].slice();productRow[0]='other-product-'+i;products.rows.push(productRow);
  const orderRow=history.rows[1].slice();orderRow[0]='DP-history-'+i;history.rows.push(orderRow);
 }
 const payload={id:order.id,version:order.version,lineIndex:0,operationId:crypto.randomUUID(),item:{productId:p.id,name:'Nombre corregido',quantity:2,unitPrice:28000,manualUnitPrice:28000,selectionIds:{},notes:'Nota corregida'}};
 return {h,p,order,payload};
}

test('editar entre miles de registros abre una vez el libro y solo lee las filas afectadas',()=>{
 const {h,payload}=setup();let opens=0,broadcasts=0;
 const originalOpen=h.context.SpreadsheetApp.openById;
 h.context.SpreadsheetApp.openById=id=>{opens++;return originalOpen(id);};
 h.context.UrlFetchApp={fetch:()=>{broadcasts++;return {};}};
 h.context.dpExecutionSpreadsheet_=null;h.reads.length=0;
 const result=h.context.apiRequest(JSON.stringify({action:'dp_edit_order_product',payload,authToken:'boss',clientSignals:true}));
 assert.equal(result.ok,true,result.error);assert.equal(result.order.total,56000);assert.equal(opens,1);
 assert.equal(broadcasts,0,'El panel enviara el aviso despues del resultado, fuera del guardado.');
 assert.equal(h.reads.filter(read=>read.sheet==='Ordenes_Web').length,1);
 assert.equal(h.reads.filter(read=>read.sheet==='Menu_Web').length,1);
 assert.ok(h.reads.every(read=>read.rows===1),'Ninguna lectura descarga todo el historial o catalogo.');
 assert.ok(!h.reads.some(read=>['Adicionales_Web','Pagos_Web','Barrios_Web','Inventario'].includes(read.sheet)));
 assert.equal(h.call('dp_edit_order_product',payload).duplicate,true,'Conserva la confirmacion idempotente.');
 assert.equal(broadcasts,1,'Los clientes anteriores mantienen el aviso desde Apps Script.');
});

test('la ruta rapida verifica precios, disponibilidad y posiciones actuales de filas',()=>{
 const {h,p,payload}=setup();
 assert.equal(h.call('dp_edit_order_product',payload).ok,true);
 const products=h.sheets.get('Menu_Web');
 products.rows.splice(1,0,products.rows[2].slice()); // Invalidates the cached product row.
 const index=products.rows.findIndex(row=>row[0]===p.id);products.rows[index][9]=false;
 const fresh={...payload,version:2,operationId:crypto.randomUUID()};
 assert.equal(h.call('dp_edit_order_product',fresh).ok,false,'Un precio manual no elude la disponibilidad actual.');
 products.rows[index][9]=true;products.rows[index][3]=31000;
 const item={...payload.item,unitPrice:25000};delete item.manualUnitPrice;
 assert.equal(h.call('dp_edit_order_product',{...fresh,item}).ok,false,'No usa el precio anterior de una cache.');
 item.unitPrice=31000;const saved=h.call('dp_edit_order_product',{...fresh,item});
 assert.equal(saved.ok,true,saved.error);assert.equal(saved.order.items[0].unitPrice,31000);
 const history=h.sheets.get('Ordenes_Web');history.rows.splice(1,0,history.rows[2].slice());
 const status=h.call('dp_update_order',{id:payload.id,version:saved.order.version,status:'lista'});
 assert.equal(status.ok,true,status.error);assert.equal(status.order.id,payload.id);
 assert.notEqual(history.rows[1][5],'lista','No modifica la fila equivocada tras mover un pedido.');
});
