const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/don-pieros-gas.cjs');
test('teléfono de diez dígitos, juntos o separados por espacios; guarda el número limpio',()=>{
 const h=harness(),p=h.product();
 for(const phone of ['3137183666','313 718 3666',' 313  718  3666 ']){
  const result=h.call('createOrder',{order:h.order(p,{phone})});assert.equal(result.ok,true,result.error);
  assert.equal(h.call('dp_get_order',{id:result.orderId}).order.phone,'3137183666');
 }
 const count=h.sheets.get('Ordenes_Web').getLastRow();
 for(const phone of ['313718366','31371836666','+57 3137183666','abc3137183666','313-718-3666','          ']){
  const result=h.call('createOrder',{order:h.order(p,{phone})});assert.equal(result.ok,false,phone);assert.match(result.error,/10 dígitos/);
 }
 assert.equal(h.sheets.get('Ordenes_Web').getLastRow(),count);
});
test('agrega Efectivo, Nequi y Bre-B conservando cuentas, IDs y métodos desactivados al actualizar',()=>{
 const h=harness(),sheet=h.sheets.get('Pagos_Web');
 sheet.rows=[sheet.rows[0],['cash-original','Efectivo','','Pago en caja',true,0,4],['custom-nequi','Mi Nequi','3137183666','Datos existentes',false,1,7]];
 h.props.set('DP_SCHEMA_VERSION','3.6.0-donpieros');h.context.ensureSystemReady_();h.context.dpEnsureSheets_(h.book);
 const catalog=h.call('dp_admin_catalog');assert.equal(catalog.payments.length,3);
 const nequi=catalog.payments.find(p=>p.id==='custom-nequi');assert.equal(nequi.account_value,'3137183666');assert.equal(nequi.available,false);assert.equal(nequi.version,7);
 assert.ok(catalog.payments.some(p=>p.name==='Bre-B'));assert.equal(catalog.payments.filter(p=>p.name==='Efectivo').length,1);
 const p=h.product(),result=h.call('createOrder',{order:h.order(p,{paymentId:'breb'})});assert.equal(result.ok,true,result.error);
});
