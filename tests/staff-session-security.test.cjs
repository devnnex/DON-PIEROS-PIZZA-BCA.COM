const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
test('Supabase: corte diario, PIN nulo, bloqueo, roles, revocación y mantenimiento',async()=>{
 const db=new PGlite({extensions:{pgcrypto}}); await db.waitReady;
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema realtime;create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;create publication supabase_realtime;
   create schema extensions;create extension pgcrypto with schema extensions;`);
  const dir=path.join(__dirname,'../supabase/install');
  for(const name of fs.readdirSync(dir).filter(f=>/^0[1-8]_.*\.sql$/.test(f)).sort())await db.exec(fs.readFileSync(path.join(dir,name),'utf8'));
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109120000_staff_daily_session_security.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  const scalar=async(query,args=[])=>(await db.query(query,args)).rows[0].data;
  for(const [start,end] of [['2026-11-09T06:59:59Z','2026-11-09T07:00:00.000Z'],['2026-11-09T07:00:00Z','2026-11-10T07:00:00.000Z'],['2027-01-01T04:00:00Z','2027-01-01T07:00:00.000Z']]){
   assert.equal(new Date(await scalar('select staff_session_deadline($1) data',[start])).toISOString(),end);
  }
  await db.query("select dp_create_boss('Jefe QA','jefeqatest','1234')");
  const boss=await scalar("select login('jefeqatest','1234') data");
  assert.ok(boss.token);assert.equal(boss.user.is_maintenance,false);
  assert.equal(boss.user.session_expires_at,boss.expires_at);
  assert.ok(new Date(boss.expires_at)<=new Date(await scalar('select staff_session_deadline() data')));
  for(const role of ['admin','waiter']){
   await db.query("select save_user($1,gen_random_uuid(),$2,$3,'0012',$4,true,$5::jsonb)",[boss.token,role,'qa'+role,role,role==='admin'?'["dashboard"]':'[]']);
   const login=await scalar("select login($1,'0012') data",['qa'+role]);
   assert.equal(login.user.role,role);
   if(role==='waiter'){
    await assert.rejects(db.query('select list_users($1)',[login.token]),/Jefe|permiso/i);
    await db.query('update auth_sessions set created_at=staff_session_deadline()-interval \'1 day 1 second\',expires_at=now()+interval \'1 hour\' where user_id=$1',[login.user.id]);
    assert.equal(await scalar('select (app_user_for_token($1)).id data',[login.token]),null);
    await assert.rejects(db.query('select get_current_user($1)',[login.token]),/sesi|usuario/i);
   }
  }
  for(const pin of [null,'','12a4','123','1234567890123'])assert.equal(await scalar('select login($1,$2) data',['jefeqatest',pin]),null);
  await db.exec('delete from login_attempts');
  for(let i=0;i<8;i++)assert.equal(await scalar("select login('jefeqatest','9999') data"),null);
  assert.equal(await scalar("select login('jefeqatest','1234') data"),null,'PIN correcto bloqueado tras ocho fallos');
  await db.exec("update login_attempts set blocked_until=now()-interval '1 second'");
  assert.ok((await scalar("select login('jefeqatest','1234') data")).token);
  await db.query("select dp_provision_maintenance('soporteqa','123456789012')");
  assert.equal((await scalar("select login('soporteqa','123456789012') data")).user.is_maintenance,true);
  await db.query('update app_users set is_active=false where id=$1',[boss.user.id]);
  await assert.rejects(db.query('select get_current_user($1)',[boss.token]),/sesi|usuario/i);
 } finally {await db.close();}
});
