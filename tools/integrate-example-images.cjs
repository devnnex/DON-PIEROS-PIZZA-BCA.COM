const fs=require('node:fs');
let client=fs.readFileSync('pedidos.js','utf8');
client=client.replace("image:fast.imageUrl(row.image_url || './images/don-pieros-logo.png'),","image:window.DonPierosImages.resolve(row),isExampleImage:!window.DonPierosImages.hasOwn(row),");
client=client.replace('<div class="product-image"><img','<div class="product-image"><img');
client=client.replace('loading="lazy">${product.badge ?', 'loading="lazy">${product.isExampleImage ? \'<small class="example-photo-label">Foto de referencia</small>\' : \'\'}${product.badge ?');
client=client.replace('<div class="detail-photo"><img src="${escapeHtml(fast.imageUrl(product.image))}" alt="${escapeHtml(product.name)}"></div>','<div class="detail-photo"><img src="${escapeHtml(fast.imageUrl(product.image))}" alt="${escapeHtml(product.name)}">${product.isExampleImage ? \'<small class="example-photo-label">Foto de referencia</small>\' : \'\'}</div>');
fs.writeFileSync('pedidos.js',client);
let admin=fs.readFileSync('online-admin.js','utf8');
admin=admin.replace("item.image_url||'images/don-pieros-logo.png'","window.DonPierosImages.resolve(item)").replace("item?.image_url||'images/don-pieros-logo.png'","window.DonPierosImages.resolve(item||{})");
admin=admin.replace("$('#dp-image-preview').src='images/don-pieros-logo.png';","$('#dp-image-preview').src=window.DonPierosImages.example({name:$('#dp-item-form').elements.namedItem('name').value,category:$('#dp-item-form').category.value});");
admin=admin.replace('JPG, PNG o WebP · hasta 5 MB.</small>','JPG, PNG o WebP · hasta 5 MB. La foto propia reemplaza la de referencia.</small>');
fs.writeFileSync('online-admin.js',admin);
for(const file of ['index.html','admin.html']){
 let html=fs.readFileSync(file,'utf8');html=html.replace('</head>','<script defer src="product-images.js?v=donpieros-photos-v1"></script>\n</head>');
 html=html.replaceAll('20261027-v3','20261027-v4').replace('online-admin.css?v=3','online-admin.css?v=4').replace('online-admin.js?v=3','online-admin.js?v=4');fs.writeFileSync(file,html);
}
fs.writeFileSync('service-worker.js',fs.readFileSync('service-worker.js','utf8').replace('20261027-v3','20261027-v4'));
