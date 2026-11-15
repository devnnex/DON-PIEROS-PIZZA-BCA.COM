const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
test('receptor Windows: origen, secreto y registro persistente evitan duplicados sin usar impresora', {skip:process.platform!=='win32'},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dp-print-test-')),root=path.join(temp,'DonPierosPrint');fs.mkdirSync(root);
 const settings={id:'22222222-2222-4222-8222-222222222222',secret:'s'.repeat(43),printer:'POS Simulada',engine:path.join(root,'FakePrint.exe'),label:'PC Test'};
 fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify(settings));
 const compile=path.join(temp,'compile.ps1');
 fs.writeFileSync(compile,`Add-Type -TypeDefinition 'using System;using System.IO;public class FakePrint {public static int Main(string[] args){File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"spooled.txt"),"one\\n");return 0;}}' -OutputAssembly '${settings.engine.replace(/'/g,"''")}' -OutputType ConsoleApplication`);
 const built=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',compile],{encoding:'utf8'});
 assert.equal(built.status,0,built.stderr);
 const wrapper=path.join(temp,'run.ps1');
 fs.writeFileSync(wrapper,`function Get-CimInstance { [pscustomobject]@{Name='POS Simulada';WorkOffline=$false;PrinterStatus=3} }
& '${path.join(__dirname,'../impresion/RECEPTOR.ps1').replace(/'/g,"''")}'`);
 const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',wrapper],{env:{...process.env,LOCALAPPDATA:temp},stdio:'pipe'});let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.on('data',b=>stderr+=b);
 const request=(route,body,origin='https://devnnex.github.io')=>fetch('http://127.0.0.1:8767'+route,{method:body?'POST':'GET',headers:{Origin:origin,'X-Don-Pieros-Print':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(3000)});
 try{
  let status;
  for(let i=0;i<40;i++){try{status=await(await request('/status')).json();break;}catch(_){await new Promise(r=>setTimeout(r,100));}}
  assert.equal(status?.id,settings.id,stderr);assert.equal(status.ready,true);
  assert.equal((await request('/status',null,'https://example.com')).status,403);
  const id='33333333-3333-4333-8333-333333333333',job={id,secret:settings.secret,pdf:Buffer.from('%PDF-1.4\nSimulated receipt').toString('base64')};
  const printed=await(await request('/print',job)).json();assert.equal(printed.status,'spooled');
  assert.equal((await(await request('/print',job)).json()).status,'spooled');
  assert.equal(fs.readFileSync(path.join(root,'spooled.txt'),'utf8'),'one\n');
  assert.equal(fs.existsSync(path.join(root,'jobs',id+'.pdf')),false,'El PDF temporal se elimina.');
  const unknown='44444444-4444-4444-8444-444444444444';
  fs.writeFileSync(path.join(root,'jobs',unknown+'.json'),JSON.stringify({status:'reserved',error:'',at:new Date().toISOString()}));
  assert.equal((await(await request('/print',{...job,id:unknown})).json()).status,'unknown','Una reserva interrumpida no se reimprime.');
  assert.equal(fs.readFileSync(path.join(root,'spooled.txt'),'utf8'),'one\n');
  await assert.rejects(request('/print',{...job,id:'55555555-5555-4555-8555-555555555555',secret:'bad'}));
  assert.equal(fs.readFileSync(path.join(root,'spooled.txt'),'utf8'),'one\n');
 }finally{
  child.kill();await new Promise(resolve=>child.once('exit',resolve));
  // Only this mkdtemp-created fixture directory; no installed receiver is touched.
  assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('dp-print-test-'));
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
