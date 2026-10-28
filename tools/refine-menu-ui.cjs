const fs=require('node:fs');
let client=fs.readFileSync('pedidos.js','utf8').replaceAll('Para ti','Todo el menú');
client=client.replaceAll('${money(product.price)}','${(product.modifiers || []).some(group => group.options.some(option => option.price > 0)) ? "Desde " : ""}${money(product.price)}');
fs.writeFileSync('pedidos.js',client);
let admin=fs.readFileSync('online-admin.js','utf8').replace('data-catalog="toppings">Adicionales','data-catalog="toppings">Tamaños y opciones').replace("'Precio adicional'","'Valor que se suma al precio base'").replace("'Grupo (ej. Extra, Tamaño, Salsa)'","'Grupo de opciones'");
admin=admin.replace("'text','required maxlength=\"60\"')+field('price'","'text','required maxlength=\"60\" list=\"dp-option-groups\"')+field('price'");
admin=admin.replace("$('#dp-item-fields').innerHTML=fields;","fields+='<datalist id=\"dp-option-groups\">'+[...new Set((catalog.toppings||[]).map(item=>item.kind))].map(kind=>'<option value=\"'+esc(kind)+'\"></option>').join('')+'</datalist>';\n    $('#dp-item-fields').innerHTML=fields;");
admin=admin.replace("group.source||'Extra','text','required')","group.source||'Extra','text','required list=\"dp-option-groups\"')");
fs.writeFileSync('online-admin.js',admin);
