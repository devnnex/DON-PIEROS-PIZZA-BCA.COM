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
