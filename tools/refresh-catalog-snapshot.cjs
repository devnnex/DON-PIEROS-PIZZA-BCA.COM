// Solo consulta el catálogo público. Ejecutar al publicar cambios de carta.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context={window:{},localStorage:{getItem:()=>''}};
vm.runInNewContext(fs.readFileSync(path.join(root,'config.js'),'utf8'),context);
(async()=>{
 const source=context.window.DON_PIEROS_CONFIG.appsScriptUrl;
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(source))throw Error('Conexión de catálogo inválida.');
 const response=await fetch(source,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'dp_get_catalog'}),signal:AbortSignal.timeout(25000)});
 const catalog=await response.json();
 if(!response.ok||!catalog.ok||!Array.isArray(catalog.products)||!catalog.products.length||!['toppings','payments','neighborhoods'].every(key=>Array.isArray(catalog[key])))throw Error('No se reemplazó la copia: catálogo público inválido.');
 const snapshot={schemaVersion:1,source,generatedAt:new Date().toISOString(),catalog};
 fs.writeFileSync(path.join(root,'catalog-snapshot.js'),'// Copia pública para visualización inmediata; los pedidos se verifican en el servidor.\nwindow.DonPierosCatalogSnapshot = '+JSON.stringify(snapshot).replace(/</g,'\\u003c')+';\n');
 console.log('Copia pública actualizada: '+catalog.products.length+' productos.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
