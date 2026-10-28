const fs=require('node:fs'),assert=require('node:assert/strict');const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/rest/v1/rpc/dp_setup_status',route=>route.fulfill({json:false}));
 await page.goto('http://127.0.0.1:4173/admin.html');await page.locator('#loginForm').waitFor();await page.locator('.admin-login-logo').evaluate(image=>image.decode());
 const styles=await page.locator('#loginForm').evaluate(form=>{const b=form.querySelector('button[type=submit]');return{background:getComputedStyle(form.parentElement,'::before').backgroundImage,opacity:getComputedStyle(form.parentElement,'::before').opacity,text:getComputedStyle(b).color,beam:getComputedStyle(b,'::before').backgroundImage,animation:getComputedStyle(b,'::before').animationName,logo:getComputedStyle(form.querySelector('img')).clipPath};});
 assert.match(styles.background,/don-pieros-logo.png/);assert.equal(styles.opacity,'0.28');assert.equal(styles.text,'rgb(255, 255, 255)');assert.match(styles.beam,/245, 31, 53/);assert.equal(styles.animation,'loginNeonCircuit');assert.equal(styles.logo,'none');
 await page.screenshot({path:'artifacts/login-escritorio.png',fullPage:true});await page.locator('#loginForm button[type=submit]').hover();assert.equal(await page.locator('#loginForm button[type=submit]').evaluate(b=>getComputedStyle(b).color),'rgb(255, 255, 255)');
 await page.setViewportSize({width:390,height:844});await page.mouse.move(0,0);await page.screenshot({path:'artifacts/login-movil.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.unroute('**/rest/v1/rpc/dp_setup_status');await page.route('**/rest/v1/rpc/dp_setup_status',route=>route.fulfill({json:true}));await page.reload();await page.getByRole('heading',{name:'Crear primer Jefe',exact:true}).waitFor();
 const pin=page.locator('#loginForm [name=pin]');assert.equal(await pin.getAttribute('minlength'),'4');assert.equal(await pin.getAttribute('maxlength'),'12');
 for(const value of ['0012','123456','123456789012']){await pin.fill(value);assert.equal(await pin.evaluate(input=>input.checkValidity()),true);}
 for(const value of ['123','12ab']){await pin.fill(value);assert.equal(await pin.evaluate(input=>input.checkValidity()),false);}
 const userPin=page.locator('#userForm [name=pin]');if(await userPin.count()){assert.equal(await userPin.getAttribute('pattern'),'[0-9]{4,12}');}
 assert.deepEqual(errors,[]);await browser.close();console.log('Login: aspecto y PIN de 4/6/12 números para primer Jefe: OK.');
})().catch(error=>{console.error(error);process.exit(1);});
