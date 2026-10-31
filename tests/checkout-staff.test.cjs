const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('la factura conserva al mesero y registra por separado al usuario que cobra',()=>{
 const start=source.indexOf('    const createdAt =',source.indexOf('  const performPayment =')),end=source.indexOf('    await saveCheckoutIntent(invoice',start);
 const session={id:'table-session',table_id:'table-1',payer_name:'Cliente',assigned_waiter_id:'waiter-id',assigned_waiter:{full_name:'Ana Mesera'},session_items:[{id:'line',item_name:'Pizza',quantity:1,unit_price:20000,status:'served'}]};
 const state={currentUser:{id:'boss-id',full_name:'Jefe de caja',role:'boss'},inventoryMeta:{},activePaymentTotal:20000};
 const context=vm.createContext({state,session,sessionTotals:()=>({subtotal:20000,total:20000}),tipsEnabled:()=>false,integerMoney:Number,sessionReference:()=> '1',sessionLabel:()=> 'Mesa 1',aggregateAccountPayments:(_,payments)=>payments,sessionPayments:()=>[],form:{payment_reference:{value:''}},payment:{method:'transfer',payments:[{method:'transfer',amount:20000}]},currencyInputNumber:()=>0});
 vm.runInContext(source.slice(start,end)+'globalThis.invoice=invoice;',context);
 assert.equal(context.invoice.waiterName,'Ana Mesera');assert.equal(context.invoice.cashierName,'Jefe de caja');assert.equal(context.invoice.cashierRole,'boss');
 const a=source.indexOf('  const thermalReceiptHtml ='),b=source.indexOf('  const printThermalReceipt =',a);
 Object.assign(context,{sessionPaid:()=>0,sessionPayments:()=>[],paymentMethodLabel:()=> 'Transferencia',money:value=>'$'+value,escapeHTML:String,roleLabel:()=> 'Jefe',window:{DonPierosDates:{date:()=> 'Fecha',time:()=> 'Hora'}}});
 vm.runInContext(source.slice(a,b)+'globalThis.receipt=thermalReceiptHtml;',context);
 const before=context.receipt(session),paid=context.receipt(session,context.invoice);
 assert.match(before,/Atendido por:[\s\S]*Ana Mesera/);assert.doesNotMatch(before,/Cobrado por:/);
 assert.match(paid,/Atendido por:[\s\S]*Ana Mesera[\s\S]*Cobrado por:[\s\S]*Jefe de caja/);
});
