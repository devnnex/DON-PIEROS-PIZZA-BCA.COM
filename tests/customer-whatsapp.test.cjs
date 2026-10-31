const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('cada pedido abre uno de los dos contactos con mensaje completo y conserva destinatario al reintentar',()=>{
 const source=fs.readFileSync('pedidos.js','utf8'),context=vm.createContext({window:{},localStorage:{getItem:()=>''},money:value=>'$'+value});
 vm.runInContext(fs.readFileSync('config.js','utf8'),context);
 const a=source.indexOf('  function orderWhatsAppUrl('),b=source.indexOf('  function notifyOrderCreated(',a);
 vm.runInContext('const WHATSAPP_NUMBERS=window.DON_PIEROS_CONFIG.whatsappNumbers;'+source.slice(a,b),context);
 const order={requestId:'a',customerName:'Cliente prueba',phone:'3137183666',fulfillment:'pickup',subtotal:25000,deliveryFee:0,paymentMethod:'Efectivo',items:[{quantity:1,name:'Pizza prueba',unitPrice:25000,selections:[]}]};
 const first=new URL(context.orderWhatsAppUrl(order,'DP-1')),second=new URL(context.orderWhatsAppUrl({...order,requestId:'b'},'DP-2'));
 assert.deepEqual(new Set([first.searchParams.get('phone'),second.searchParams.get('phone')]),new Set(['573138367511','573185536604']));
 assert.equal(context.orderWhatsAppUrl({...order},'DP-1'),first.href);
 for(const text of ['Cliente prueba','Pizza prueba','3137183666','DP-1'])assert.ok(first.searchParams.get('text').includes(text));
});
