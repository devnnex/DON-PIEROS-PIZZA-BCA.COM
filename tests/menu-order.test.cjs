const test=require('node:test'),assert=require('node:assert/strict');
test('categorías y Todos mantienen los pares de pizzas/pizzetas y las bebidas al final sin alterar productos',()=>{
 const menu=require('../menu-order.js');
 const categories=['Bebidas','Porciones','Pizzetas sencillas','Pizzas sencillas','Lasañas','Pizzetas','Pizzetas especiales','Pizzas especiales','Postres'];
 const products=categories.map((category,i)=>({id:String(i),category}));
 products.push({id:'segunda-pizza',category:'Pizzas especiales'},{id:'segunda-bebida',category:'Bebidas'});
 const before=JSON.stringify(products),sorted=menu.products(products);
 assert.deepEqual(menu.categories(products),['Pizzas especiales','Pizzas sencillas','Pizzetas especiales','Pizzetas','Pizzetas sencillas','Porciones','Lasañas','Postres','Bebidas']);
 assert.deepEqual(sorted.map(p=>p.id),['7','segunda-pizza','3','6','5','2','1','4','8','0','segunda-bebida']);
 assert.equal(JSON.stringify(products),before);
 assert.deepEqual(menu.products(products.filter(p=>p.category==='Pizzas especiales')).map(p=>p.id),['7','segunda-pizza']);
 assert.deepEqual(menu.categories([{category:'Postres'},{category:'BÉBIDAS frías'},{category:'Otros'}]),['Postres','Otros','BÉBIDAS frías']);
});

test('la carta del mesero ordena bebidas en Todos y al filtrar la categoría',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../waiter-orders.js'),'utf8');
 const start=source.indexOf('  function renderProducts(){'),end=source.indexOf('  function renderSelection()',start);
 const nodes={'#dw-products':{innerHTML:''},'#dw-categories':{innerHTML:''}};
 const context=vm.createContext({$:id=>nodes[id],window:{DonPierosMenuOrder:require('../menu-order.js'),DonPierosImages:{resolve:()=>''}},
  catalog:{products:[{id:'z',name:'Zumo',category:'Bebidas',available:true},{id:'pizza',name:'Pizza',category:'Pizzas especiales',available:true},{id:'a',name:'Agua',category:'Bebidas',available:true}]},
  category:'',query:'',customChoice:()=>'',esc:String,money:String,normalize:value=>String(value).toLowerCase()});
 vm.runInContext(source.slice(start,end)+';globalThis.render=renderProducts;',context);
 const ids=()=>Array.from(nodes['#dw-products'].innerHTML.matchAll(/data-dw-product="([^"]+)"/g),match=>match[1]);
 context.render();assert.deepEqual(ids(),['pizza','a','z']);
 context.category='Bebidas';context.render();assert.deepEqual(ids(),['a','z']);
});

test('las bebidas se ordenan alfabéticamente en español sin alterar las otras categorías',()=>{
 const menu=require('../menu-order.js'),rows=[
  {id:'z',category:'Bebidas',name:'Zumo'},
  {id:'pizza-z',category:'Pizzas especiales',name:'Zeta'},
  {id:'c2',category:'Bebidas',name:'Coca-Cola 2 L'},
  {id:'agua',category:'Bebidas',name:'ÁGUA'},
  {id:'pizza-a',category:'Pizzas especiales',name:'Albahaca'},
  {id:'b',category:'Bebidas',name:'bretaña'},
  {id:'c1',category:'Bebidas',name:'Coca-Cola 1 L'},
  {id:'gas-z',category:'Gaseosas',name:'Zeta'},
  {id:'gas-a',category:'Gaseosas',name:'Agua'}
 ];
 const before=JSON.stringify(rows);
 assert.deepEqual(menu.products(rows).map(row=>row.id),['pizza-z','pizza-a','agua','b','c1','c2','z','gas-a','gas-z']);
 assert.deepEqual(menu.products(rows.filter(row=>row.category==='Bebidas')).map(row=>row.id),['agua','b','c1','c2','z']);
 assert.equal(JSON.stringify(rows),before);
});
