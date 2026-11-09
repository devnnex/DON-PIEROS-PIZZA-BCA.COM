const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../performance.js'),'utf8');
function harness(options={}){
 const events=new Map(),values=new Map(),calls=[];let release,now=1000;
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const data={ok:true,products:[],toppings:[],payments:[{name:'Banco',account_value:'0012',available:true}],neighborhoods:[]};
 const context=vm.createContext({console,JSON,Object,Array,Promise,AbortController,setTimeout,clearTimeout,localStorage:storage,sessionStorage:storage,location:{origin:'https://fixture.test'},navigator:{},
  Date:class extends Date{static now(){return now;}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},
  window:{DON_PIEROS_CONFIG:{supabaseUrl:'https://fixture.supabase.co',appsScriptUrl:'https://script.google.com/macros/s/fixture/exec'},addEventListener:(key,fn)=>{if(!events.has(key))events.set(key,[]);events.get(key).push(fn);},dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event);}},
  fetch:async(url,request)=>{calls.push({url,body:JSON.parse(request.body)});if(options.fail)throw Error('Sin conexion');if(release)await new Promise(resolve=>{release.resolve=resolve;});return{ok:true,json:async()=>data};}
 });
 if(options.blockStorage)for(const key of ['localStorage','sessionStorage'])Object.defineProperty(context,key,{get(){throw Error('Storage blocked');}});
 if(options.snapshot)context.window.DonPierosCatalogSnapshot={source:context.window.DON_PIEROS_CONFIG.appsScriptUrl,catalog:data};
 vm.runInContext(source,context);
 return{api:context.window.DonPierosPerformance,calls,data,storage,hold:()=>{release={};},release:()=>{const resolve=release.resolve;release=null;resolve();},advance:ms=>{now+=ms;},invalidate:()=>context.window.dispatchEvent({type:'donpieros-catalog-change'})};
}
test('precarga, pagos y carta comparten una sola lectura en curso y luego la caché',async()=>{
 const h=harness();h.hold();const first=h.api.loadCatalog(),second=h.api.loadCatalog(),third=h.api.loadCatalog();
 assert.equal(first,second);assert.equal(second,third);assert.equal(h.calls.length,1);
 h.release();await Promise.all([first,second,third]);
 await h.api.loadCatalog();assert.equal(h.calls.length,1);
 assert.equal(h.api.readCatalog().payments[0].account_value,'0012');
 assert.equal(h.calls.some(call=>call.url.includes('supabase')),false,'Cero consultas a Supabase');
 assert.equal(h.calls[0].body.action,'dp_get_catalog');
 h.advance(180001);await h.api.loadCatalog();assert.equal(h.calls.length,2);
});
test('los cambios de catálogo invalidan caché; no se publica una respuesta anterior a la edición',async()=>{
 const h=harness();await h.api.loadCatalog();h.invalidate();assert.equal(h.api.readCatalog(),null);
 h.hold();const request=h.api.loadCatalog();h.invalidate();h.release();await request;
 assert.equal(h.calls.length,3,'Una lectura tras la edición reemplaza la iniciada antes de editar');
 assert.ok(h.api.readCatalog());
});
test('se reutiliza el formato de caché de la carta de clientes sin descargar de nuevo',async()=>{
 const h=harness();h.api.write('catalog',[{data:[]},{data:[]},{data:h.data.payments},{data:[]}],h.storage);
 const result=await h.api.loadCatalog();assert.equal(result.payments[0].account_value,'0012');assert.equal(h.calls.length,0);
});
test('la copia incluida sirve para visualizar; no sustituye la verificación de red ni se marca como caché vigente',async()=>{
 const h=harness({snapshot:true});assert.ok(h.api.previewCatalog());assert.equal(h.api.readCatalog(),null);
 await h.api.loadCatalog();assert.equal(h.calls.length,1);assert.ok(h.api.readCatalog());
});
test('una caché antigua se conserva para visualizar pero se consulta el servidor antes de reutilizarla como vigente',async()=>{
 const h=harness();await h.api.loadCatalog();h.advance(180001);
 assert.equal(h.api.readCatalog(),null);assert.ok(h.api.previewCatalog());await h.api.loadCatalog();assert.equal(h.calls.length,2);
});
test('almacenamiento bloqueado no rompe la carga y dos consumidores comparten también el reintento acotado',async()=>{
 const h=harness({blockStorage:true,fail:true,snapshot:true});assert.ok(h.api.previewCatalog());
 const first=h.api.loadCatalog(),second=h.api.loadCatalog();assert.equal(first,second);
 await assert.rejects(first,/Sin conexion/);assert.equal(h.calls.length,2);assert.ok(h.api.previewCatalog());
});
