const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
test('nuevas imágenes ocupan menos, conservan proporción y transparencia; archivos inválidos conservan el original',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage();await page.evaluate(()=>window.DON_PIEROS_CONFIG={supabaseUrl:'fixture',appsScriptUrl:'fixture'});
  await page.addScriptTag({path:path.resolve(__dirname,'../performance.js')});
  const result=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=3000;canvas.height=1800;
   const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,3000,1800);gradient.addColorStop(0,'#bd002e');gradient.addColorStop(1,'#ffce57');
   ctx.fillStyle=gradient;ctx.fillRect(50,50,2900,1700);ctx.font='bold 180px Arial';ctx.fillStyle='#111';ctx.fillText('DON PIEROS PIZZA',100,800);
   const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const compressed=await DonPierosPerformance.compressImage(original,1200),image=await createImageBitmap(compressed);
   const output=document.createElement('canvas');output.width=image.width;output.height=image.height;output.getContext('2d').drawImage(image,0,0);
   const invalid=new Blob(['invalid'],{type:'image/png'}),fallback=await DonPierosPerformance.compressImage(invalid,1200);
   return {original:original.size,size:compressed.size,width:image.width,height:image.height,alpha:output.getContext('2d').getImageData(0,0,1,1).data[3],fallback:fallback===invalid};
  });
  assert.ok(result.size<result.original);assert.equal(result.width,1200);assert.equal(result.height,720);assert.equal(result.alpha,0);assert.equal(result.fallback,true);
 }finally{await browser.close();}
});
