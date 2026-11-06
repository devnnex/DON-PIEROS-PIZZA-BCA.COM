const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8'),packaging=require('../packaging.js');
test('pedido web conserva dirección y barrio al pasar a caja, pre-cuenta y factura guardada',()=>{
 const address='Calle 10 # 20-30\nTorre B, apartamento 402 <portería>',order={id:'DP-1',status:'nueva',customerName:'Laura',address,neighborhood:'Centro & Parque',fulfillment:'delivery',deliveryFee:4000,items:[{name:'Pizza',quantity:1,unitPrice:20000,selections:[]}]};
 const state={invoiceHistory:[],sessions:[],items:[],optimisticSessionStates:new Map(),business:{business_name:'Don Pieros'},currentUser:{full_name:'Caja'}};
 const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({state,checkoutSubmissionBusy:false,isManager:()=>true,normalizeText:String,openPaymentDialog:()=>{},persistWalkInDrafts:()=>{},window:{DonPierosPackaging:packaging,DonPierosOrderLabels:{compact:items=>items},DonPierosDates:{date:()=> 'Fecha',time:()=> 'Hora'}},URL,location:{href:'http://local/admin.html'},sessionReference:()=> '1',sessionLabel:()=> 'Venta individual',sessionTotals:()=>({subtotal:24000,total:24000}),tipsEnabled:()=>false,escapeHTML,money:String,sessionPaid:()=>0,roleLabel:String});
 const start=source.indexOf('  const openWebOrderCheckout ='),end=source.indexOf('  // Los avisos públicos',start);
 vm.runInContext(source.slice(start,end)+'openWebOrderCheckout('+JSON.stringify(order)+');',context);
 const session=state.sessions[0];assert.equal(session.delivery_address,address);assert.equal(session.neighborhood,order.neighborhood);
 assert.equal(session.session_items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0),24000);
 const a=source.indexOf('  const thermalReceiptHtml ='),b=source.indexOf('  const printThermalReceipt =',a);
 vm.runInContext(source.slice(a,b)+'globalThis.receipt=thermalReceiptHtml;',context);
 const before=context.receipt(session);assert.ok(before.includes(escapeHTML(address)));assert.ok(before.includes(escapeHTML(order.neighborhood)));assert.ok(!before.includes('<portería>'));
 const invoice={number:'DP-1',createdAt:new Date().toISOString(),totals:{subtotal:24000,total:24000},items:session.session_items,deliveryAddress:address,neighborhood:order.neighborhood,fulfillment:'delivery',payments:[]};
 const paid=context.receipt({payer_name:'Laura',session_items:[]},invoice);assert.ok(paid.includes(escapeHTML(address)));assert.ok(paid.includes(escapeHTML(order.neighborhood)));
});
