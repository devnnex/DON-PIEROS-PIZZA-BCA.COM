const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
test('modales propios: confirmar/cancelar, foco, teclado, cola, texto y copia manual en las tres interfaces',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const native=[],errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{native.push(dialog.type());void dialog.dismiss();});
  for(const [name,base,width] of [['admin','style.css',1440],['index','styles.css',390],['mesa','style.css',390]]){
   await page.setViewportSize({width,height:850});await page.goto('about:blank');
   await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body><dialog id="underlying"><button id="origin">Eliminar</button></dialog></body>');
   await page.addStyleTag({path:path.join(root,base)});await page.addStyleTag({path:path.join(root,'system-dialogs.css')});
   await page.addScriptTag({path:path.join(root,'system-dialogs.js')});
   await page.evaluate(()=>{document.querySelector('#underlying').showModal();document.querySelector('#origin').focus();window.answer='pending';void DonPierosDialogs.confirm({title:'¿Eliminar <img src=x>?',message:'Primera línea\nSegunda línea',danger:true}).then(value=>window.answer=value);});
   await page.locator('.dp-system-dialog[open]').waitFor();
   assert.equal(await page.locator('.dp-system-dialog img').count(),0,'El texto nunca se interpreta como HTML.');
   assert.equal(await page.locator('#dp-system-title').textContent(),'¿Eliminar <img src=x>?');
   assert.equal(await page.evaluate(()=>document.activeElement.className),'dp-system-cancel');
   await page.keyboard.press('Enter');await page.waitForFunction(()=>window.answer===false);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'origin');
   const startConfirm=async()=>page.evaluate(()=>{window.answer='pending';void DonPierosDialogs.confirm({title:'Retirar pedido',accept:'Eliminar'}).then(value=>window.answer=value);});
   await startConfirm();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.answer===false);
   await startConfirm();await page.mouse.click(4,4);await page.waitForFunction(()=>window.answer===false);
   await startConfirm();await page.locator('.dp-system-accept').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.answer===true);
   assert.equal(await page.locator('#underlying').evaluate(node=>node.open),true);
   await page.evaluate(()=>{window.answer='pending';void DonPierosDialogs.prompt({title:'Nombre del pedido',required:true}).then(value=>window.answer=value);});
   await page.locator('.dp-system-accept').click();assert.equal(await page.locator('.dp-system-dialog').evaluate(node=>node.open),true);
   await page.locator('.dp-system-field input').fill('Mesa 2 · Andrés');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.answer==='Mesa 2 · Andrés');
   await page.evaluate(()=>{window.answers=[];const first=DonPierosDialogs.confirm({title:'Primero',key:'same'});window.same=first===DonPierosDialogs.confirm({title:'No reemplazar',key:'same'});void first.then(value=>answers.push(value));void DonPierosDialogs.alert({title:'Segundo',message:'Cambio guardado'}).then(()=>answers.push('closed'));});
   assert.equal(await page.evaluate(()=>window.same),true);assert.equal(await page.locator('#dp-system-title').textContent(),'Primero');
   await page.locator('.dp-system-accept').click();await page.waitForFunction(()=>document.querySelector('#dp-system-title').textContent==='Segundo');
   assert.equal(await page.locator('.dp-system-cancel').isVisible(),false);await page.locator('.dp-system-accept').click();await page.waitForFunction(()=>answers.length===2);assert.deepEqual(await page.evaluate(()=>answers),[true,'closed']);
   const pedidos=fs.readFileSync(path.join(root,'pedidos.js'),'utf8'),from=pedidos.indexOf('  async function copyText('),to=pedidos.indexOf('  const delivery =',from);
   await page.addScriptTag({content:pedidos.slice(from,to)+';window.copyFixture=copyText;'});
   for(const clipboard of ['missing','blocked']){
    await page.evaluate(mode=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='missing'?undefined:{writeText:async()=>{throw Error('Permission denied');}}});window.answer='pending';void copyFixture('Cuenta para copiar: 123456789').then(value=>window.answer=value);},clipboard);
    await page.locator('.dp-system-field textarea').waitFor();
    assert.equal(await page.locator('.dp-system-field textarea').inputValue(),'Cuenta para copiar: 123456789');
    assert.equal(await page.locator('.dp-system-field textarea').evaluate(node=>node.readOnly&&node.selectionStart===0&&node.selectionEnd===node.value.length),true);
    const box=await page.locator('.dp-system-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,`${name}: modal dentro de la pantalla`);
    await page.locator('.dp-system-accept').click();await page.waitForFunction(()=>window.answer===false);
   }
   await page.evaluate(()=>{window.answers=[];void DonPierosDialogs.prompt({title:'Entrada pendiente'}).then(value=>answers.push(value));void DonPierosDialogs.confirm({title:'Confirmación pendiente'}).then(value=>answers.push(value));window.dispatchEvent(new Event('donpieros-session-change'));});
   await page.waitForFunction(()=>answers.length===2);assert.deepEqual(await page.evaluate(()=>answers),[false,null]);
   assert.equal(await page.locator('.dp-system-dialog').evaluate(node=>node.open),false);
  }
  assert.deepEqual(native,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('el código de la aplicación ya no llama alert, confirm ni prompt del navegador',()=>{
 const native=/(?:^|[^\w$.])(?:(?:window|globalThis|self)\s*\.\s*)?(?:alert|confirm|prompt)\s*\(/m;
 for(const file of fs.readdirSync(root).filter(file=>/\.(?:js|html)$/.test(file)))assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),native,file);
 for(const file of ['admin.html','index.html','mesa.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');assert.match(html,/system-dialogs\.js/);assert.match(html,/system-dialogs\.css/);
 }
});
