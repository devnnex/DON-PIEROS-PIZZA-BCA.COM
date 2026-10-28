const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
(async()=>{
 const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const code=source.slice(source.indexOf('  const loadPwaLogo ='),source.indexOf('  const replacePwaManifestLink ='));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/images/don-pieros-logo.png');
  for(const size of [192,512]){
   const data=await page.evaluate(async({code,size})=>{
    const make=new Function(code+';return pwaIconBlob;')();
    const blob=await make('http://127.0.0.1:4173/images/don-pieros-logo.png',size,true);
    return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
   },{code,size});
   fs.writeFileSync(path.join(root,`images/admin-icon-${size}.png`),Buffer.from(data,'base64'));
  }
  console.log('Iconos ADMIN 192/512: logo, marco rojo y distintivo amarillo.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
