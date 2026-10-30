const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../pending-deletions.js'),'utf8');
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function device(storage=new Map()){
 let user='alice',now=Date.now();const events=new Map(),navigator={onLine:true};
 const window={DON_PIEROS_CONFIG:{appsScriptUrl:'business-a',supabaseUrl:'db-a'},DonPierosAdmin:{getUser:()=>({id:user}),getToken:()=> 'session'},addEventListener:(event,fn)=>events.set(event,fn),dispatchEvent:()=>{}};
 const context=vm.createContext({window,document:{body:{dataset:{page:'admin'}}},navigator,Date:class extends Date{static now(){return now;}},CustomEvent:class{},localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setTimeout(){},setInterval(){}});
 vm.runInContext(source,context);
 return {queue:window.DonPierosDeletions,storage,navigator,events,user:value=>user=value,advance:ms=>now+=ms};
}
test('el retiro no caduca ni reaparece tras fallos, reinicio, cambio de sesión o pérdida de conexión',async()=>{
 const first=device();let calls=0;
 first.queue.register('web-order',async()=>{calls++;throw Error('Sin conexión');});
 first.queue.enqueue('web-order','DP-1',{id:'DP-1',version:1});
 for(let i=0;i<3;i++){
  first.queue.tick();await settle();assert.equal(first.queue.hidden('web-order','DP-1'),true);assert.equal(first.queue.list()[0].state,'pending');first.advance(31000);
 }
 assert.equal(calls,3);
 const reloaded=device(first.storage);assert.equal(reloaded.queue.hidden('web-order','DP-1'),true);
 reloaded.user('bob');assert.equal(reloaded.queue.hidden('web-order','DP-1'),false);assert.equal(reloaded.queue.list().length,0);
 reloaded.user('alice');reloaded.advance(86400000*7);assert.equal(reloaded.queue.hidden('web-order','DP-1'),true,'Las operaciones pendientes no caducan.');
 reloaded.queue.register('web-order',async()=>{calls++;return {version:2};});
 reloaded.navigator.onLine=false;reloaded.queue.tick();await settle();assert.equal(calls,3);
 reloaded.navigator.onLine=true;reloaded.queue.tick();await settle();assert.equal(calls,4);assert.equal(reloaded.queue.list()[0].state,'done');assert.equal(reloaded.queue.hidden('web-order','DP-1'),true,'Una lectura atrasada tampoco devuelve el registro confirmado.');
});
