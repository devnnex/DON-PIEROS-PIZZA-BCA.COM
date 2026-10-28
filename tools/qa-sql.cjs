const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});await db.waitReady;
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema realtime;create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
  create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
  create publication supabase_realtime;
  create schema extensions;create extension pgcrypto with schema extensions;`);
  for(const name of ['01_BASE.sql','02_ACTUALIZACIONES_NAPOLES.sql','03_DON_PIEROS.sql']){
   let sql=fs.readFileSync(path.join(root,'supabase/install',name),'utf8');
   await db.exec(sql);console.log(name+': OK');
  }
  assert.equal((await db.query('select count(*)::int as n from app_users')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from service_requests')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from menu_items')).rows[0].n,0);
  assert.equal((await db.query('select dp_setup_status() as ready')).rows[0].ready,true);
  const pinPatch=fs.readFileSync(path.join(root,'supabase/install/04_PIN_4_A_12.sql'),'utf8');
  await db.exec(pinPatch);await db.exec(pinPatch);
  for(const pin of ['123','1234567890123','12a4','',null]){
    await assert.rejects(db.query('select dp_create_boss($1,$2,$3)',['QA Admin','qaadmin',pin]),/PIN de 4 a 12/);
  }
  for(const pin of ['0012','123456','123456789012']){
    await db.exec('begin');
    await db.query('select dp_create_boss($1,$2,$3)',['QA Admin','qaadmin',pin]);
    const result=(await db.query('select login($1,$2) as session',['qaadmin',pin])).rows[0].session;
    assert.ok(result.token);assert.equal(result.user.role,'boss');await db.exec('rollback');
  }
  await db.query('select dp_create_boss($1,$2,$3)',['QA Admin','qaadmin','0012']);
  assert.equal((await db.query('select role from app_users')).rows[0].role,'boss');
  await assert.rejects(db.query('select dp_create_boss($1,$2,$3)',['Other Admin','other','654321']));
  const login=(await db.query('select login($1,$2) as session',['qaadmin','0012'])).rows[0].session;
  assert.ok(login.token);assert.equal(login.user.role,'boss');
  for(const [index,pin] of ['0042','123456','123456789012'].entries()){
    const role=['boss','admin','waiter'][index],username='qauser'+index;
    await db.query('select save_user($1,gen_random_uuid(),$2,$3,$4,$5,true,$6::jsonb)',[login.token,'Usuario prueba',username,pin,role,role==='admin'?'["dashboard"]':'[]']);
    const result=(await db.query('select login($1,$2) as session',[username,pin])).rows[0].session;
    assert.ok(result.token);assert.equal(result.user.role,role);
  }
  console.log('PIN: primer Jefe y roles Jefe/Administrador/Mesero, 4/6/12 números, ceros iniciales y rechazo de entradas inválidas: OK.');
  const bootstrap=(await db.query('select get_bootstrap_data($1,$2) as data',[login.token,''])).rows[0].data;
  assert.equal(bootstrap.business.business_name,'Don Pieros Pizza');
  await db.exec("set role anon");
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('product-images','guest.jpg')"),/row-level security/);
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':login.token})]);
  await db.query("insert into storage.objects(bucket_id,name) values('product-images','boss.jpg')");
  await db.query("delete from storage.objects where bucket_id='product-images' and name='boss.jpg'");
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n,0);
  console.log('Base vacía, primer Jefe único, bcrypt, login, bootstrap y políticas de imágenes: OK. Solo servicios de Supabase simulados.');
  const waiterPatch=fs.readFileSync(path.join(root,'supabase/install/05_PEDIDOS_MESERO.sql'),'utf8');
  await db.exec(waiterPatch);await db.exec(waiterPatch);
  const waiter=(await db.query('select login($1,$2) as session',['qauser2','123456789012'])).rows[0].session;
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':waiter.token})]);
  const table=(await db.query("insert into restaurant_tables(table_number,table_name,qr_code) values(1,'Mesa 1','mesa-1') returning id")).rows[0];
  const account=(await db.query("insert into table_sessions(table_id,assigned_waiter_id) values($1,$2) returning id",[table.id,waiter.user.id])).rows[0];
  const line=(await db.query("insert into session_items(session_id,table_id,item_name,quantity,unit_price,status,created_by_user_id) values($1,$2,'Pizza',2,25000,'served',$3) returning id",[account.id,table.id,waiter.user.id])).rows[0];
  await db.exec('set role anon');
  const notify=()=>db.query('select dp_notify_waiter_order($1,$2,$3::uuid[]) as result',[line.id,account.id,[line.id]]);
  const notice=(await notify()).rows[0].result;
  assert.equal(notice.request.session_id,account.id);assert.match(notice.request.message,/^2 × Pizza/);
  assert.equal(notice.request.request_source,'waiter');assert.equal(notice.request.requested_by_user_id,waiter.user.id);assert.equal(notice.request.requested_by_name,'Usuario prueba');
  assert.equal((await notify()).rows[0].result.duplicate,true);
  await assert.rejects(db.query('select dp_notify_waiter_order(gen_random_uuid(),$1,$2::uuid[])',[account.id,[line.id,line.id]]),/productos guardados/);
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':login.token})]);
  await assert.rejects(notify(),/corresponde a un mesero/);
  await db.exec('reset role');
  await db.query("update table_sessions set status='closed' where id=$1",[account.id]);
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':waiter.token})]);
  const skipped=(await db.query('select dp_notify_waiter_order(gen_random_uuid(),$1,$2::uuid[]) as result',[account.id,[line.id]])).rows[0].result;
  assert.equal(skipped.skipped,true);assert.equal((await notify()).rows[0].result.duplicate,true);
  assert.equal((await db.query('select count(*)::int as n from table_sessions')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from session_items')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from service_requests')).rows[0].n,1);
  console.log('Mesero: identidad verificada, reintentos únicos, permisos, sin duplicar consumos ni reabrir cuentas cerradas: OK.');
  const qrOptions=fs.readFileSync(path.join(root,'supabase/install/06_OPCIONES_QR.sql'),'utf8');await db.exec(qrOptions);await db.exec(qrOptions);
  let options=(await db.query('select client_waiter_enabled,client_bill_enabled,client_menu_enabled,client_chat_enabled from business_settings where is_primary=true')).rows[0];
  assert.ok(Object.values(options).every(value=>value===true));
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-app-token':login.token})]);await db.exec('set role anon');
  await db.exec('update business_settings set client_waiter_enabled=false,client_bill_enabled=false,client_menu_enabled=false,client_chat_enabled=false where is_primary=true');await db.exec('reset role');
  options=(await db.query('select get_bootstrap_data($1,$2) as data',[null,'mesa-1'])).rows[0].data.business;
  for(const field of ['client_waiter_enabled','client_bill_enabled','client_menu_enabled','client_chat_enabled'])assert.equal(options[field],false);
  await db.exec(qrOptions);assert.equal((await db.query('select client_chat_enabled from business_settings where is_primary=true')).rows[0].client_chat_enabled,false);
  console.log('Opciones QR: valores iniciales, permisos del Jefe, lectura por clientes y conservación al repetir actualización: OK.');
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);if(e.query)console.error(e.query.slice(0,800));process.exitCode=1;});
