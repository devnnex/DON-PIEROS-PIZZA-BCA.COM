const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const packaging=require('../packaging.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','invoice-layout');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const renderSource=`
 const DEFAULT_CURRENCY='COP';
 const state={business:{business_name:'Don Pieros Pizza'},currentUser:{full_name:'Don Pieros'},tipSettings:{percentage:10}};
 const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sessionTotals=session=>session.totals;
 const sessionPayments=session=>session.payments||[];
 const sessionPaid=session=>sessionPayments(session).reduce((sum,row)=>sum+row.amount,0);
 const tipsEnabled=()=>false;
 const tableLabel=table=>table?.name||'MESA9';
 const roleLabel=role=>role==='boss'?'Jefe':'Administrador';
 const paymentMethodLabel=method=>({cash:'Efectivo',transfer:'Transferencia',breb:'Bre-B',card:'Tarjeta'}[method]||method);
 const prettyDateTime=value=>DonPierosDates.dateTime(value);
 ${extract('  const money =','  const currencyInputNumber =')}
 ${extract('  const sessionLabel =','  const tableCode =')}
 ${extract('  const thermalReceiptHtml =','  const printThermalReceipt =')}
 window.renderInvoiceQA=thermalReceiptHtml;
`;
const issuedAt='2026-10-31T01:27:00.000Z';
const make=(id,items,extra={})=>{
 const subtotal=items.reduce((sum,row)=>sum+row.quantity*row.unit_price,0);
 const session={id:'c8fe9468-0000-0000-0000-000000000000',table_id:'mesa9',restaurant_tables:{name:'MESA9'},payer_name:'Consumidor final',session_items:items,totals:{subtotal,total:subtotal}};
 const invoice={number:'FACT-C8FE9468',createdAt:issuedAt,items,totals:session.totals,waiterName:'Don Pieros',cashierName:'Don Pieros',cashierRole:'boss',payments:[{method:'cash',amount:subtotal}],...extra};
 return {id,session,invoice};
};
const cases=[
 make('foto',[{item_name:'Porción especial',quantity:1,unit_price:17000}]),
 make('productos-cantidades-grandes',[
  {item_name:'Pizza Don Pieros Super maxi con camarón, champiñón, pollo y tocineta',quantity:9999,unit_price:96000,notes:'Primera mitad sin cebolla; segunda mitad sin pimentón.'},
  {item_name:'Lasaña especial',quantity:250,unit_price:22000},
  {item_name:'Gaseosa 1,5 litros',quantity:99,unit_price:9000},
  {item_name:'Pizzeta pollo y champiñones',quantity:99,unit_price:32000}
 ]),
 make('datos-largos-cajas-pagos',[
  {item_name:'Pizza Don Pieros',quantity:99,unit_price:100000,notes:packaging.note('Sin cebolla','supermaxi')},
  {item_name:'Porción hawaiana',quantity:99,unit_price:15000}
 ],{waiterName:'María Fernanda Rodríguez de la recepción',cashierName:'Juan Sebastián Martínez de la caja principal',reference:'TRANSFERENCIA-1234567890123456789012345678901234567890',payments:[{method:'transfer',amount:11300000},{method:'cash',amount:85000}],cashReceived:100000,changeDue:15000,prepayments:[{created_at:issuedAt,payment_method:'card',amount:50000}],remainingPaid:11335000}),
 make('totales-grandes-descuentos',[{item_name:'Pizza especial para evento',quantity:999999,unit_price:96000}],{tipAmount:10000000,tipPercentage:10,totals:{subtotal:95999904000,discount:100000,tax:200000,serviceFee:300000,total:96010304000}}),
 make('pedido-en-linea',[{item_name:'Panzerotti carnes',quantity:99,unit_price:22000}],{fulfillment:'delivery'})
];
cases[2].session.payer_name='Asociación de vecinos del barrio La Presentación';
cases[4].session.web_order_id='DP-20261030-123456789';
cases.push({...cases[1],id:'precuenta',invoice:null});

(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const renderer=await browser.newPage();
  await renderer.addScriptTag({path:path.join(root,'date-format.js')});
  await renderer.addScriptTag({path:path.join(root,'packaging.js')});
  await renderer.addScriptTag({content:renderSource});
  const page=await browser.newPage({viewport:{width:420,height:900},deviceScaleFactor:2});
  let checks=0;
  for(const fixture of cases)for(const width of [80,58]){
   const html=await renderer.evaluate(({session,invoice})=>renderInvoiceQA(session,invoice),fixture);
   await page.setContent(html);await page.addScriptTag({path:path.join(root,'vendor','jspdf.umd.min.js')});await page.addScriptTag({path:path.join(root,'thermal-print.js')});
   const result=await page.evaluate(async width=>{
    const {pdf,height}=await DonPierosThermal.createPdf(window,width);
    const mm=96/25.4,body=document.body.getBoundingClientRect(),safeRight=body.right-8*mm;
    const cells=[...document.querySelectorAll('.meta>*,.totals>*,.item>*')];
    const failures=[];
    for(const cell of cells){
     const rect=cell.getBoundingClientRect();
     if(rect.right>safeRight+.6||cell.scrollWidth>cell.clientWidth+1)failures.push('Celda fuera del margen: '+cell.textContent);
     const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
     while(walker.nextNode()){
      const range=document.createRange();range.selectNodeContents(walker.currentNode);
      for(const line of range.getClientRects())if(line.right>safeRight+.6||line.left<body.left-1)failures.push('Texto cortado: '+walker.currentNode.textContent);
     }
    }
    const rightCells=[...document.querySelectorAll('.meta>strong,.totals>strong,.item>strong')];
    return {height,data:pdf.output('datauristring'),failures,shifts:rightCells.map(cell=>parseFloat(getComputedStyle(cell).left)),leftColumn:parseFloat(getComputedStyle(document.querySelector('.meta>span')).left)||0,values:rightCells.map(cell=>cell.textContent),rightEdge:Math.max(...rightCells.map(cell=>cell.getBoundingClientRect().right))/mm,metaStart:document.querySelector('.meta>strong').getBoundingClientRect().left/mm};
   },width);
   const label=fixture.id+'-'+width+'mm';
   assert.deepEqual(result.failures,[],label);
   assert.ok(result.rightEdge<=width-8-6*25.4/96+.2,label+': valores otros 6 px a la izquierda');
   assert.ok(result.shifts.every(shift=>shift===-6),label+': toda la columna de valores se desplaza 6 px');
   assert.equal(result.leftColumn,0,label+': etiquetas conservan su posición');
   assert.ok(result.metaStart<width/2,label+': los datos comienzan en la mitad izquierda');
   const format=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value);
   const totals=(fixture.invoice||fixture.session).totals;
   assert.ok(result.values.includes(format(totals.total)),label+': total completo');
   for(const item of (fixture.invoice?.items||fixture.session.session_items)){
    const box=packaging.read(item.notes),amount=(item.unit_price-box.fee)*item.quantity;
    assert.ok(result.values.includes(format(amount)),label+': importe completo de '+item.item_name);
   }
   const bytes=Buffer.from(result.data.split(',')[1],'base64'),pdfText=bytes.toString('latin1');
   assert.equal((pdfText.match(/\/Type\s*\/Page\b/g)||[]).length,1,label+': una tira continua');
   const media=pdfText.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(media);
   assert.ok(Math.abs(Number(media[1])-width*72/25.4)<1,label+': ancho real del PDF');
   fs.writeFileSync(path.join(out,label+'.pdf'),bytes);fs.writeFileSync(path.join(out,label+'.html'),html);
   await page.locator('body').screenshot({path:path.join(out,label+'.png')});
   console.log(`OK ${label}: ${result.values.length} valores completos; borde ${result.rightEdge.toFixed(1)} mm; altura ${result.height} mm`);checks++;
  }
  console.log(`OK: ${checks} facturas/precuentas, productos variados, cantidades 1/99/250/9999/999999, cajas, abonos, pagos mixtos y datos largos. PDF y capturas en ${out}`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
