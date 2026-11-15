const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
test('impresión habitual: PDF de 58 y 80 mm, vista abierta y diálogo de impresión del PDF',async()=>{
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><body></body>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
  page.context().on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  for(const file of ['vendor/jspdf.umd.min.js','thermal-print.js'])await page.addScriptTag({path:path.join(root,file)});
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
  }
  assert.ok(requests.every(url=>new URL(url).origin===origin),'Preparar un recibo no consulta otros equipos ni servicios.');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
