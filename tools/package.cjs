const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync(root)){
 if(/\.(html|css|js|webmanifest|svg)$/.test(name)||['images','sound','vendor'].includes(name))fs.cpSync(path.join(root,name),path.join(out,name),{recursive:true});
}
console.log('Publicar únicamente dist/. Los SQL, pruebas y Apps Script quedan fuera.');
fs.writeFileSync(path.join(out,'.nojekyll'),'');
