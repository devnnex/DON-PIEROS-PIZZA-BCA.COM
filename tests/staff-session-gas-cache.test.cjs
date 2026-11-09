const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../appscript/Code.gs'),'utf8');
test('Apps Script no reutiliza usuarios almacenados después del vencimiento ni entradas antiguas sin fecha',()=>{
 const start=source.indexOf('function validateSupabaseUser_(authToken)'),end=source.indexOf('function validateSupabaseUserWithConfig_',start);
 let now=Date.parse('2026-11-09T06:59:59Z'),reads=0;const cache=new Map(),ttls=[];
 const user={id:'boss',session_expires_at:'2026-11-09T07:00:00Z'};
 class Clock extends Date{static now(){return now;}}
 const context=vm.createContext({Date:Clock,JSON,Math,Error,String,
  CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value,ttl)=>{cache.set(key,value);ttls.push(ttl);},remove:key=>cache.delete(key)})},
  hash_:value=>value,getConfig_:()=>({supabaseUrl:'configured',supabaseAnonKey:'configured'}),
  validateSupabaseUserWithConfig_:()=>{reads++;if(now>=Date.parse(user.session_expires_at))throw Error('Usuario no autorizado.');return user;}
 });
 vm.runInContext(source.slice(start,end),context);
 cache.set('user_token',JSON.stringify({id:'legacy'}));
 assert.equal(context.validateSupabaseUser_('token').id,'boss');assert.equal(reads,1);assert.equal(ttls[0],1);
 assert.equal(context.validateSupabaseUser_('token').id,'boss');assert.equal(reads,1);
 now=Date.parse('2026-11-09T07:00:00Z');
 assert.throws(()=>context.validateSupabaseUser_('token'),/no autorizado/);assert.equal(reads,2);
});
