const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
test('impresión habitual: PDF de 58 y 80 mm, vista abierta y diálogo de impresión del PDF',async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/images/don-pieros-logo.png'){
   res.setHeader('Content-Type','image/png');
   return res.end(fs.readFileSync(path.join(root,'images/don-pieros-logo.png')));
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><body></body>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
  page.context().on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  for(const file of ['vendor/jspdf.umd.min.js','thermal-print.js'])await page.addScriptTag({path:path.join(root,file)});
  for(const file of ['order-details.js','order-labels.js','packaging.js'])await page.addScriptTag({path:path.join(root,file)});
  const online=fs.readFileSync(path.join(root,'online-admin.js'),'utf8');
  await page.addScriptTag({content:`
   const esc=String,date=String,sourceLabel=()=> 'Carta en línea',fulfillmentLabel=()=> 'Domicilio';
   const money=value=>'$'+value,orderDetails=()=>DonPierosOrderDetails,notify=message=>{throw Error(message);};
   ${online.slice(online.indexOf('  function kitchenSelection('),online.indexOf('  function selectCatalogKind('))}
  `});
  for(const width of [58,80]){
   const receipt=await page.evaluate(async width=>{
    const popup=open('','_blank');popup.document.write('<!doctype html><html><head><title>Comanda Mesa 9</title><style>body{font:14px monospace}p{margin:5px 0}</style></head><body><h1>Mesa 9</h1><p>1 × Pizza combinada</p><p>Sin cebolla</p><strong>Total: $ 48.000</strong></body></html>');popup.document.close();
    const result=await DonPierosThermal.print(popup,width),viewer=popup.document.querySelector('[data-thermal-pdf-viewer]');
    const bytes=await(await fetch(viewer.src)).arrayBuffer();const pdf=new TextDecoder('latin1').decode(bytes);
    const state={width:result.width,ready:popup.document.body.dataset.thermalPdfReady,closed:popup.closed,pdf,text:popup.document.body.textContent};
    popup.close();return state;
   },width);
   assert.equal(receipt.width,width);assert.equal(receipt.ready,'1');assert.equal(receipt.closed,false,'Preparar la impresión conserva la vista habitual.');
   assert.match(receipt.text,/Sin cebolla/);assert.match(receipt.text,/48\.000/);
   assert.match(receipt.pdf,/\/N \/Print/,'El PDF solicita el diálogo de impresión del navegador.');
   const paper=receipt.pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(paper);
   assert.ok(Math.abs(Number(paper[1])-width*72/25.4)<2,'El recibo respeta el ancho seleccionado.');
   const order=await page.evaluate(async width=>{
    const items=Array.from({length:60},(_,index)=>({
     name:index<2?'Porción hawaiiana':'Producto de prueba '+index,quantity:index===0?2:1,
     unitPrice:15000,packagingUnitFee:index<2?500:0,fulfillment:'delivery',
     selections:index<2?[]:['Sin cebolla'],notes:index<2?'':'Observación de cocina '.repeat(8)
    }));
    const nativePrint=DonPierosThermal.print,nativeAddImage=jspdf.jsPDF.API.addImage;
    const rasterRows=new Set();
    let headings,firstLine,total,body,slices=0,deliveryLabels,mixedLabels;
    try{
     DonPierosThermal.print=(popup,paperWidth)=>{
      const doc=popup.document,lines=[...doc.querySelectorAll('.kitchen-item')];
      headings=lines.map(line=>line.querySelector('h3').textContent);
      firstLine=lines[0].textContent;total=doc.querySelector('.total-amount').textContent;
      body=doc.querySelector('.kitchen-ticket').textContent;
      deliveryLabels=lines.filter(line=>[...line.querySelectorAll('p')].some(p=>p.textContent.trim()==='Domicilio')).length;
      const mixed=document.implementation.createHTMLDocument('');
      mixed.body.innerHTML='<div class="fulfillment">Domicilio</div><article><h3>Pizza</h3></article><article><h3>Bebida</h3></article>';
      DonPierosOrderDetails.prepareComanda(mixed,'article',[{fulfillment:'delivery'},{fulfillment:'pickup'}],'');
      mixedLabels=[...mixed.querySelectorAll('article')].map(line=>line.textContent.includes('Domicilio'));
      [...lines,doc.querySelector('.total')].forEach((line,index)=>{
       const marker=doc.createElement('span');
       marker.style.cssText='position:absolute;left:9px;width:8px;height:8px;background:rgb('+String(30+index*3)+',100,220)';
       line.prepend(marker);
      });
      jspdf.jsPDF.API.addImage=function(canvas,...args){
       slices++;
       const x=Math.round(12*canvas.width/(paperWidth*96/25.4));
       const stripe=canvas.getContext('2d').getImageData(x,0,1,canvas.height).data;
       for(let i=0;i<stripe.length;i+=4){
        const row=(stripe[i]-30)/3;
        if(stripe[i+1]===100&&stripe[i+2]===220&&Number.isInteger(row))rasterRows.add(row);
       }
       return nativeAddImage.call(this,canvas,...args);
      };
      return DonPierosThermal.createPdf(popup,paperWidth).finally(()=>popup.close());
     };
     await printOrder({id:'DP-60',sequence:60,customerName:'Cliente',fulfillment:'delivery',address:'Calle 1',
      neighborhood:'Centro',createdAt:'2026-11-17',items,subtotal:915000,packagingFee:1500,deliveryFee:6000,
      total:922500,paymentMethod:'Efectivo'},width);
    }finally{DonPierosThermal.print=nativePrint;jspdf.jsPDF.API.addImage=nativeAddImage;}
    return {headings,firstLine,total,body,slices,deliveryLabels,mixedLabels,rasterRows:[...rasterRows].sort((a,b)=>a-b)};
   },width);
   assert.equal(order.headings.length,60);
   assert.deepEqual(order.headings.slice(0,2),['2 × Porción hawaiiana','1 × Porción hawaiiana']);
   assert.match(order.firstLine,/\$15000 c\/u\s*Caja: \$500 c\/u/);
   assert.doesNotMatch(order.body,/Precio unitario|ANEXO|Total de la línea/);
   assert.match(order.total,/\$922500/);
   assert.match(order.body,/Cajas:\s*\$1500/);
   assert.match(order.body,/Domicilio:\s*\$6000/);
   assert.equal(order.deliveryLabels,0);
   assert.deepEqual(order.mixedLabels,[true,false]);
   assert.ok(order.slices>1);
   assert.deepEqual(order.rasterRows,Array.from({length:61},(_,index)=>index),'Cada producto y el total llegan a los píxeles del PDF.');
  }
  assert.ok(requests.every(url=>new URL(url).origin===origin),'Preparar un recibo no consulta otros equipos ni servicios.');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
