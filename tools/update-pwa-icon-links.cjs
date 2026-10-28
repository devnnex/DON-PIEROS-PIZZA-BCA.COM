const fs=require('node:fs');
for(const file of ['index.html','admin.html','mesa.html']){
 let text=fs.readFileSync(file,'utf8');
 text=text.replace(/<link rel="icon"[^>]*>/,'<link rel="icon" href="./images/icon-192.png?v=black-logo-v2" id="appFavicon" type="image/png" sizes="192x192">');
 text=text.replace(/<link rel="apple-touch-icon"[^>]*>/,'<link rel="apple-touch-icon" href="./images/icon-512.png?v=black-logo-v2" id="appleTouchIcon" sizes="512x512">');
 text=text.replaceAll('20261027-v4','20261027-v6').replaceAll('20261027-v5','20261027-v6');
 text=text.replace(/href="(\.\/)?(cliente|manifest)\.webmanifest"/g,'href="$1$2.webmanifest?v=black-logo-v2"');
 fs.writeFileSync(file,text);
}
for(const file of ['manifest.webmanifest','cliente.webmanifest']){
 const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const icon of manifest.icons)icon.src=icon.src.split('?')[0]+'?v=black-logo-v2';
 fs.writeFileSync(file,JSON.stringify(manifest,null,2));
}
const png=fs.readFileSync('images/icon-512.png').toString('base64');
fs.writeFileSync('pwa-icon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Don Pieros Pizza"><rect width="512" height="512" fill="#000"/><image href="data:image/png;base64,'+png+'" width="512" height="512"/></svg>');
