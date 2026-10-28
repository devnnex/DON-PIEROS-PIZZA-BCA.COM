const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({serviceWorkers:'block'});
 await page.goto('http://127.0.0.1:5500/admin.html');await page.getByRole('heading',{name:'Crear primer Jefe',exact:true}).waitFor({timeout:30000});
 console.log('Admin real: formulario de primer Jefe disponible después de los tres SQL.');
 const catalog=await page.evaluate(async()=>{const response=await fetch(window.DON_PIEROS_CONFIG.appsScriptUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'dp_get_catalog'})});const value=await response.json();return{ok:value.ok,products:value.products?.length,payments:value.payments?.length,neighborhoods:value.neighborhoods?.length};});
 if(!catalog.ok)throw Error('El catálogo real no respondió.');console.log('Apps Script real desde navegador (CORS): '+JSON.stringify(catalog));
 await page.screenshot({path:'artifacts/primer-jefe-real.png',fullPage:true});await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
