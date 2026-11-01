// Generates a private SQL activation file; never bundles credentials in the app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.resolve(__dirname,'../artifacts');fs.mkdirSync(dir,{recursive:true});
const file=path.join(dir,'ACTIVAR_SOPORTE_PRIVADO.sql');
if(fs.existsSync(file))throw Error('El archivo privado ya existe. Consérvalo para no cambiar el PIN por accidente.');
const pin=String(crypto.randomInt(100000000000,1000000000000));
fs.writeFileSync(file,`-- PRIVADO. Ejecuta primero supabase/install/08_ACCESO_MANTENIMIENTO.sql.\n-- Usuario: soporte_temporal\n-- PIN: ${pin}\n-- Sin vencimiento. Puedes eliminar tu propia cuenta desde Usuarios.\nselect public.dp_provision_maintenance('soporte_temporal','${pin}');\n`,{mode:0o600});
console.log('Activación y credenciales privadas: '+file);
