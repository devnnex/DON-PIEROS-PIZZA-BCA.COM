const fs=require('node:fs'),assert=require('node:assert/strict');const{chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext({serviceWorkers:'block'});
 const page=await context.newPage();
 for(const file of ['index.html','admin.html','mesa.html']){
  await page.goto('http://127.0.0.1:4173/'+file);
  assert.match(await page.locator('link[rel=icon]').getAttribute('href'),file==='admin.html'?/images\/admin-icon-192.png/:/images\/icon-192.png/);assert.match(await page.locator('link[rel=apple-touch-icon]').getAttribute('href'),file==='admin.html'?/images\/admin-icon-512.png/:/images\/icon-512.png/);
 }
 await page.goto('http://127.0.0.1:4173/index.html');
 const results=await page.evaluate(async()=>{
  const pixel=async url=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return{size:image.width,height:image.height,pixel:[...ctx.getImageData(0,0,1,1).data]};};
  const admin=await(await fetch('manifest.webmanifest')).json(),client=await(await fetch('cliente.webmanifest')).json();
  if(admin.id===client.id||admin.start_url===client.start_url)throw Error('Las aplicaciones deben tener identidades distintas.');
  if(!admin.icons.every(icon=>icon.src.includes('admin-icon'))||client.icons.some(icon=>icon.src.includes('admin-icon')))throw Error('Cada aplicación usa su icono correspondiente.');
  return Promise.all([...admin.icons,...client.icons].map(icon=>pixel(icon.src)));
 });
 for(const result of results){assert.ok([192,512].includes(result.size));assert.equal(result.height,result.size);assert.deepEqual(result.pixel,[0,0,0,255]);}
 const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('  const loadPwaLogo ='),end=source.indexOf('  const replacePwaManifestLink =',start);
 const generated=await page.evaluate(async code=>{
  const make=new Function(code+'; return pwaIconBlob;')();
  const sample=async admin=>{const blob=await make('images/don-pieros-logo.png',192,admin),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return{corner:[...ctx.getImageData(0,0,1,1).data],badge:[...ctx.getImageData(45,140,1,1).data],ring:[...ctx.getImageData(96,14,1,1).data]};};
  return {admin:await sample(true),client:await sample(false)};
 },source.slice(start,end));assert.deepEqual(generated.client.corner,[0,0,0,255]);assert.deepEqual(generated.admin.corner,[0,0,0,255]);assert.deepEqual(generated.admin.badge,[255,218,89,255]);assert.notDeepEqual(generated.admin.ring,generated.client.ring);
 await browser.close();console.log('PWA Admin: identidad propia, logo con aro rojo y distintivo ADMIN amarillo, 192/512 y generación dinámica; cliente conserva icono negro original: OK.');
})().catch(error=>{console.error(error);process.exit(1);});
