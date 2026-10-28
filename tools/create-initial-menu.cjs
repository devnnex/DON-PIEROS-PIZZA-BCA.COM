const fs=require('node:fs'),crypto=require('node:crypto');
const uuid=key=>{const h=crypto.createHash('sha256').update('don-pieros-menu-v1:'+key).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
const products=[],toppings=[];
const measures={'Mini':'27 × 27 cm','Mediana':'37 × 37 cm','Maxi':'45 × 45 cm','Super maxi':'54 × 54 cm'};
const sizes=(kind,prices)=>prices.map(([name,price],sort_order)=>{const value={id:uuid(kind+name),name:name+' · '+measures[name],kind,price,available:true,sort_order,version:1};toppings.push(value);return value;});
sizes('Tamaño pizza especial',[['Mini',0],['Mediana',17000],['Maxi',32000],['Super maxi',50000]]);
sizes('Tamaño pizza sencilla',[['Mini',0],['Mediana',13000],['Maxi',32000],['Super maxi',45000]]);
const modifier=source=>[{id:uuid(source),name:'Elige el tamaño',source,required:true,min:1,max:1,usePrice:true}];
const add=(category,name,price,description='',modifiers=[])=>products.push({id:uuid(category+':'+name),name,category,price,image_url:'',image_path:'',description,badge:modifiers.length?'4 tamaños':'',featured:true,available:true,sort_order:products.length,modifiers,version:1});
const special=[
 ['La Pamplonita','Champiñón, pollo, atún, cebolla, maicitos y piña.'],
 ['Don Pieros','Salami, cábano, jamón, tocineta, camarón, pollo, champiñón, pimentón y cebolla.'],
 ['Carnes','Salami, cábano, jamón, pollo, tocineta y chorizo.'],
 ['Frutas','Manzana, durazno, ciruela, brevas y piña.'],
 ['Campesina','Pollo, champiñón, maicitos, tomate, cebolla y pimentón.'],
 ['Vegetales','Champiñón, pimentón, tomate, cebolla, alcaparra, aceitunas, orégano y sal de ajo.'],
 ['Mexicana','Salami, cábano, carne molida, pimentón, cebolla, jalapeño, orégano y sal de ajo.'],
 ['Caprichosa','Tocineta, bocadillo y maicitos.'],
 ['Pollo-champiñón','Pollo y champiñón.'],
 ['Loca','Salami, cábano, jamón, piña, durazno y ciruela.'],
 ['El Cacique','Cábano, cebolla, pimentón, piña, atún, pollo y tomate.']
];
special.forEach(([name,description])=>add('Pizzas especiales','Pizza '+name,46000,description,modifier('Tamaño pizza especial')));
const simple=['Ciruelas y tocineta','Hawaiana','Jamón con pollo','Durazno con peperoni','Salami con peperoni','Chorizo con maicitos','Napolitana'];
simple.forEach((name,sort_order)=>toppings.push({id:uuid('Sabor pizza sencilla'+name),name,kind:'Sabor pizza sencilla',price:0,available:true,sort_order,version:1}));
simple.forEach(name=>add('Pizzas sencillas','Pizza '+name,43000,'Primera mitad: '+name+'. Elige el sabor de la segunda mitad; puede ser el mismo.',[...modifier('Tamaño pizza sencilla'),{id:uuid('segunda-mitad'),name:'Sabor de la segunda mitad',source:'Sabor pizza sencilla',required:true,min:1,max:1,usePrice:false}]));
[['Lasaña marinera',21000],['Lasaña mixta',20000],['Lasaña especial',22000],['Boloñesa',20000],['Panzerotti hawaiano',20000],['Panzerotti carnes',22000],['Panzerotti especial',22000]].forEach(([name,price])=>add('Lasañas y panzerotti',name,price));
[['Hawaiana',15000],['Mexicana',16000],['Especial',17000],['Verduras',16000],['Campesina',16000],['Carnes',17000],['Caprichosa',16000],['Loca',17000],['Peperoni',16000],['Pollo champiñones',16000]].forEach(([name,price])=>add('Porciones','Porción '+name.toLowerCase(),price));
[['Hawaiana',28000],['Mexicana',30000],['Especial',32000],['Verduras',30000],['Campesina',30000],['Carnes',32000],['Caprichosa',30000],['Loca',32000],['Peperoni',30000]].forEach(([name,price])=>{add('Pizzetas','Pizzeta '+name.toLowerCase(),price,'Pizzeta de 24 × 24 cm.');products[products.length-1].badge='24 × 24 cm';});
[['Club Colombia',6000],['Cerveza Águila lata',5000],['Jugos naturales',8000],['Limonadas',8000],['Naranjadas',8000],['Gaseosas',4000],['Gaseosa 1,5 litros',9000]].forEach(([name,price])=>add('Bebidas',name,price));
fs.writeFileSync('menu-inicial.json',JSON.stringify({source:'Carta proporcionada por el negocio',products,toppings},null,2));
console.log(products.length+' productos y '+toppings.length+' opciones preparados.');
