const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
test('una comanda aceptada conserva su consumo frente a retiros, permite corregir y desaparece al cobrar',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});await db.waitReady;
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema realtime;create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;create publication supabase_realtime;
   create schema extensions;create extension pgcrypto with schema extensions;`);
  const root=path.resolve(__dirname,'..');
  for(const file of fs.readdirSync(path.join(root,'supabase/install')).filter(name=>/^0[1-8]_.*\.sql$/.test(name)).sort())await db.exec(fs.readFileSync(path.join(root,'supabase/install',file),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261104120000_comanda_edits_after_table_move.sql'),'utf8').replace(/^\uFEFF/,''));
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261109150000_protect_accepted_comandas.sql'),'utf8');await db.exec(migration);await db.exec(migration);
  const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].data;
  await db.query("select dp_create_boss('Jefe','jefeqa','1234')");const boss=await scalar("select login('jefeqa','1234') data");
  await db.query("select save_user($1,gen_random_uuid(),'Mesero','meseroqa','0012','waiter',true,'[]')",[boss.token]);
  const waiter=await scalar("select login('meseroqa','0012') data");
  const table=crypto.randomUUID(),id=crypto.randomUUID(),line={id:crypto.randomUUID(),product_id:crypto.randomUUID(),name:'Pizza',quantity:1,unit_price:20000,options:{},notes:''};
  await db.query("insert into restaurant_tables(id,table_number,qr_code) values($1,901,'qa-comanda-protection')",[table]);
  const auth=token=>db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':token})]);
  const save=(version,items,sessionId)=>scalar('select dp_save_waiter_comanda($1,$2,$3,$4,$5,$6::jsonb,\'\') data',[crypto.randomUUID(),id,table,sessionId,version,JSON.stringify(items)]);
  await auth(waiter.token);const sent=await save(0,[line],null);
  await auth(boss.token);await scalar('select dp_accept_waiter_comanda($1,1) data',[id]);
  for(const token of [boss.token,waiter.token]){await auth(token);await assert.rejects(save(1,[],sent.session.id),/ya fue agregada/);}
  await assert.rejects(db.query('delete from waiter_comandas where id=$1',[id]),/ya fue agregada/);
  await assert.rejects(db.query('update waiter_comandas set accepted_at=null where id=$1',[id]),/ya fue agregada/);
  assert.equal((await db.query("select sum(quantity*unit_price)::int total from session_items where session_id=$1 and status<>'cancelled'",[sent.session.id])).rows[0].total,20000);
  const edited=await save(1,[{...line,quantity:2}],sent.session.id);assert.equal(edited.comanda.version,2);
  assert.equal((await scalar('select dp_list_waiter_comandas() data')).orders.length,1);
  await auth(boss.token);
  await db.query("update table_sessions set status='closed',closed_at=now() where id=$1",[sent.session.id]);
  assert.equal((await scalar('select dp_list_waiter_comandas() data')).orders.length,0);
  await db.query('delete from table_sessions where id=$1',[sent.session.id]);
  assert.equal((await db.query('select count(*)::int total from waiter_comandas where id=$1',[id])).rows[0].total,0);
 }finally{await db.close();}
});
