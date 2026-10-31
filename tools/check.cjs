const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js')).concat('appscript/Code.gs')){new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});console.log('Sintaxis: '+file);}
for(const file of ['index.html','admin.html','mesa.html']){
 const text=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of text.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^" ]*)?"/g)){
  if(/^(https?:|data:)/.test(match[1]))continue;
  const asset=path.resolve(root,match[1]);if(!fs.existsSync(asset))throw new Error(file+': falta '+match[1]);
 }
}
for(const file of ['manifest.webmanifest','cliente.webmanifest']){const manifest=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));for(const icon of manifest.icons)if(!fs.existsSync(path.resolve(root,icon.src.split('?')[0])))throw new Error('Falta icono '+icon.src);}
console.log('Referencias HTML e iconos: OK');
const release=JSON.parse(fs.readFileSync(path.join(root,'app-release.json'),'utf8'));
for(const name of ['index.html','admin.html','mesa.html']){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 if(!html.includes(`name="app-version" content="${release.version}"`))throw Error(name+': actualizar app-version junto con app-release.json');
}
console.log('Versión PWA: '+release.version);
