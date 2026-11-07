const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {harness}=require('./helpers/don-pieros-gas.cjs');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const section=(from,to)=>source.slice(source.indexOf('  const '+from+' ='),source.indexOf('  const '+to+' =',source.indexOf('  const '+from+' =')+1));

test('el buscador de ventas individuales combina cliente/teléfono, ignora acentos y conserva el contador y el filtro',()=>{
 const grid={innerHTML:'',querySelectorAll:()=>[]},search={value:'jose'},count={textContent:''};
 const state={sessions:[{id:'a',payer_name:'José Pérez',customer_phone:'3001234567',opened_at:'1'},
  {id:'b',payer_name:'Ana Díaz',customer_phone:'3117654321',opened_at:'2'}].map(row=>({...row,local_only:true,sale_channel:'walk_in',session_items:[{unit_price:100,quantity:1}]}))};
 const context=vm.createContext({state,window:{},$:id=>({'#individualSalesGrid':grid,'#individualSalesSearch':search,'#individualSalesCount':count})[id],
  normalizeText:value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
  isLocalWalkInSession:()=>true,sessionHasConsumption:()=>true,sessionReference:row=>row.id,sessionTotal:()=>100,money:String,escapeHTML:String,prettyDateTime:String});
 vm.runInContext(section('individualSaleTitle','renderServiceTables')+';globalThis.render=renderIndividualSales;',context);
 context.render();assert.match(grid.innerHTML,/José Pérez/);assert.doesNotMatch(grid.innerHTML,/Ana Díaz/);assert.equal(count.textContent,'2');
 search.value='ana 311';context.render();assert.match(grid.innerHTML,/Ana Díaz/);assert.doesNotMatch(grid.innerHTML,/José Pérez/);
 search.value='nadie';context.render();assert.match(grid.innerHTML,/No hay ventas individuales/);
 state.sessions.push({...state.sessions[0],id:'c',payer_name:'Otro cliente'});context.render();assert.equal(search.value,'nadie');assert.equal(count.textContent,'3');
 search.value='';context.render();assert.match(grid.innerHTML,/José Pérez/);assert.match(grid.innerHTML,/Ana Díaz/);assert.match(grid.innerHTML,/Otro cliente/);
});

test('el teléfono de una venta individual se comparte y se conserva en el historial y al corregir la venta',()=>{
 const h=harness(),id=randomUUID(),phone='3001234567';
 h.context.Utilities.formatDate=(value,_zone,format)=>format==='yyyy-MM-dd'?new Date(value).toISOString().slice(0,10):'20261106';
 const session={id,sale_channel:'walk_in',status:'open',payer_name:'Laura',customer_phone:phone,session_items:[{id:randomUUID(),item_name:'Postre',quantity:1,unit_price:5000,status:'served'}]};
 assert.equal(h.call('dp_save_individual_sale',{p_id:id,p_operation_id:randomUUID(),p_version:0,p_action:'save',p_session:session}).ok,true);
 assert.equal(h.call('dp_get_orders',{includeIndividuals:true}).individualSales[0].session.customer_phone,phone);
 const invoice={id,sessionId:id,number:'F-1',saleChannel:'walk_in',customerPhone:phone,payerName:'Laura',createdAt:'2026-11-06T18:00:00Z',table:'Venta individual',totals:{subtotal:5000,total:5000},payments:[{method:'cash',amount:5000}],paymentMethod:'cash',items:session.session_items};
 const saved=h.call('record_sale',{invoice});assert.equal(saved.ok,true,saved.error);
 const read=()=>h.call('get_income_report',{filters:{dateFrom:'2026-11-06',dateTo:'2026-11-06',paymentMethod:'all',saleType:'all'}}).records.find(row=>row.saleId===id);
 assert.equal(read().customerPhone,phone);
 const edited={...invoice,payerName:'Laura Pérez'};delete edited.customerPhone;
 const result=h.call('edit_sale',{invoice:edited,operationId:randomUUID()});assert.equal(result.ok,true,result.error);
 assert.equal(read().customerPhone,phone,'Una corrección antigua sin campo teléfono no lo borra.');
});

test('factura y reimpresión conservan el teléfono del cliente',async()=>{
 const state={business:{business_name:'Don Pieros'},currentUser:{full_name:'Caja'},invoiceHistory:[],incomeReport:{records:[{saleId:'sale',sessionId:'account',customerPhone:'3001234567',payer:'Laura',table:'Venta individual',items:[],payments:[],total:5000,subtotal:5000}]}},printed=[];
 const context=vm.createContext({state,window:{open:()=>null},normalizeText:String,toast(){},
  printThermalReceipt:(session,invoice)=>printed.push(invoice),dbQuiet:async()=>null});
 vm.runInContext(section('printIncomeReceipt','bindPaymentConfirmShortcut')+';globalThis.print=printIncomeReceipt;',context);
 state.sb={rpc:()=>null};await context.print('sale');assert.equal(printed[0].customerPhone,'3001234567');
});

test('enviar desde el catálogo exige teléfono aunque se haya cerrado el modal del producto',()=>{
 const session={id:'sale',payer_name:'Laura',customer_phone:'',session_items:[{id:'line',status:'served'}]},state={sessions:[session],optimisticSessionStates:new Map()};let edits=0,focused=0,saves=0;
 const form={individual_edit_phone:{focus(){focused++;}}};
 const context=vm.createContext({state,checkoutSubmissionBusy:false,isLocalWalkInSession:()=>true,sessionHasConsumption:()=>true,toast(){},
  $:selector=>selector==='#consumptionForm'?form:{close(){}},editConsumption(){edits++;},persistWalkInDrafts(){saves++;return true;},renderAdminLive(){},renderIndividualSales(){}});
 vm.runInContext(section('holdIndividualSale','printIndividualSale')+';globalThis.hold=holdIndividualSale;',context);
 assert.equal(context.hold('sale'),false);assert.equal(edits,1);assert.equal(focused,1);assert.equal(saves,0);
});

test('actualizar Apps Script agrega teléfono al final sin cambiar las ventas anteriores',()=>{
 const h=harness(),sheet=h.sheets.get('Ventas'),old=Array.from({length:24},(_,i)=>i===0?'venta-anterior':'dato-'+i);
 sheet.rows[0]=sheet.rows[0].slice(0,24);sheet.rows.push([...old]);h.props.set('DP_SCHEMA_VERSION','3.19.0-donpieros');
 h.context.ensureSystemReady_();
 assert.deepEqual(sheet.rows[1],old);assert.equal(sheet.rows[0].length,25);assert.equal(sheet.rows[0][24],'telefono_cliente');
});
