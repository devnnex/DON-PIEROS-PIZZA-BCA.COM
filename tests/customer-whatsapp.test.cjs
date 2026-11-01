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

test('WhatsApp usa cajas y precios confirmados por el servidor para recoger, domicilio y consumo local',()=>{
 const {harness}=require('./helpers/don-pieros-gas.cjs'),h=harness({seedMenu:true}),catalog=h.call('dp_get_catalog');
 const product=catalog.products.find(p=>p.name==='Pizza combinada'),[sizes,flavors]=product.modifiers;
 const choices=catalog.toppings.filter(t=>t.kind===flavors.source).slice(0,2).map(t=>t.id);
 const source=fs.readFileSync('pedidos.js','utf8'),context=vm.createContext({window:{},money:value=>'$'+value});
 vm.runInContext(fs.readFileSync('config.js','utf8'),context);
 vm.runInContext('const WHATSAPP_NUMBERS=window.DON_PIEROS_CONFIG.whatsappNumbers;'+source.slice(source.indexOf('  function orderWhatsAppUrl('),source.indexOf('  function notifyOrderCreated(')),context);
 for(const size of catalog.toppings.filter(t=>t.kind===sizes.source))for(const fulfillment of ['pickup','delivery','dinein']){
  const neighborhood=h.save('neighborhoods',{name:'Barrio QA',delivery_fee:6000,available:true});
  const raw=h.order(product,{fulfillment,address:'Calle 10 numero 20',neighborhoodId:neighborhood.id,neighborhood:neighborhood.name,
    deliveryFee:fulfillment==='delivery'?6000:0,items:[{productId:product.id,quantity:2,unitPrice:product.price+size.price,selectionIds:{[sizes.id]:[size.id],[flavors.id]:choices}}]});
  const result=h.call('createOrder',{order:raw});assert.equal(result.ok,true,result.error);
  const text=new URL(context.orderWhatsAppUrl({...raw,items:result.orderItems,subtotal:result.subtotal,packagingFee:result.packagingFee,deliveryFee:result.deliveryFee,paymentMethod:'Efectivo'},result.orderId,result.total)).searchParams.get('text');
  const fee=fulfillment==='dinein'?0:/Maxi/i.test(size.name)?4000:2000;
  assert.equal(result.total,result.subtotal+2*fee+(fulfillment==='delivery'?6000:0));assert.ok(text.includes('*TOTAL: $'+result.total+'*'));
  assert.equal(/Caja\(s\):/.test(text),!!fee);if(fee){assert.ok(text.includes('2 × $'+fee+' = $'+(2*fee)));assert.ok(text.includes('Caja(s): $'+(2*fee)));}
  else assert.doesNotMatch(text,/Caja /);
 }
});
