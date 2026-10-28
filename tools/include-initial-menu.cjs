const fs=require('node:fs');let code=fs.readFileSync('appscript/Code.gs','utf8').split('\n// BEGIN DON PIEROS INITIAL MENU')[0];
code=code.replace(/version: "3\.[012]\.0-donpieros"/,'version: "3.2.0-donpieros"');
const payment="if (payments.getLastRow() < 2) payments.appendRow(['efectivo','Efectivo','','Paga al recibir tu pedido',true,0,1]);";
if(!code.includes('  dpSeedInitialMenu_(spreadsheet);'))code=code.replace(payment,payment+'\n  dpSeedInitialMenu_(spreadsheet);');
const menu=JSON.parse(fs.readFileSync('menu-inicial.json','utf8'));
code+='\n// BEGIN DON PIEROS INITIAL MENU\nvar DP_INITIAL_MENU = '+JSON.stringify(menu,null,2)+';\n'+fs.readFileSync('tools/menu-seed.gs.txt','utf8');
fs.writeFileSync('appscript/Code.gs',code);console.log('Code.gs 3.2.0: carga automática de '+menu.products.length+' productos y '+menu.toppings.length+' opciones.');
