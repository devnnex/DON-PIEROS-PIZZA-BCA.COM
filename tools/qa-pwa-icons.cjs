const fs=require('node:fs'),assert=require('node:assert/strict');const{chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext({serviceWorkers:'block'});
 const page=await context.newPage();
 for(const file of ['index.html','admin.html','mesa.html']){
  await page.goto('http://127.0.0.1:4173/'+file);
  assert.match(await page.locator('link[rel=icon]').getAttribute('href'),/images\/icon-192.png/);assert.match(await page.locator('link[rel=apple-touch-icon]').getAttribute('href'),/images\/icon-512.png/);
 }
 await page.goto('http://127.0.0.1:4173/index.html');
 const results=await page.evaluate(async()=>{
  const pixel=async url=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return{size:image.width,height:image.height,pixel:[...ctx.getImageData(0,0,1,1).data]};};
  const manifests=await Promise.all(['manifest.webmanifest','cliente.webmanifest'].map(async url=>{const data=await(await fetch(url)).json();return Promise.all(data.icons.map(icon=>pixel(icon.src)));}));return manifests.flat();
 });
 for(const result of results){assert.ok([192,512].includes(result.size));assert.equal(result.height,result.size);assert.deepEqual(result.pixel,[0,0,0,255]);}
 const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('  const loadPwaLogo ='),end=source.indexOf('  const replacePwaManifestLink =',start);
 const generated=await page.evaluate(async code=>{
  const make=new Function(code+'; return pwaIconBlob;')(),blob=await make('images/don-pieros-logo.png',192),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return [...ctx.getImageData(0,0,1,1).data];
 },source.slice(start,end));assert.deepEqual(generated,[0,0,0,255]);
 await browser.close();console.log('Favicon y Apple Touch en las tres páginas, manifiestos cliente/admin, iconos 192/512 y generación dinámica: logo con fondo negro opaco OK.');
})().catch(error=>{console.error(error);process.exit(1);});
