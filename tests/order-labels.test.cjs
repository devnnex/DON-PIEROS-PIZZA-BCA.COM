const test=require('node:test'),assert=require('node:assert/strict'),{compact}=require('../order-labels.js');
test('dos sabores se muestran juntos sin repetir instrucciones ni el tamaño y sin modificar datos',()=>{
 const labels=['Elige el tamaño: Pizzeta · 24 × 24 cm','Elige 2 sabores (mitad y mitad): La Pamplonita','Elige 2 sabores (mitad y mitad): Carnes','Para llevar','Para llevar'];
 const before=structuredClone(labels),result=compact(labels);
 assert.deepEqual(result,['Tamaño: Pizzeta · 24 × 24 cm','Sabores (mitad y mitad): La Pamplonita / Carnes','Para llevar']);
 assert.deepEqual(labels,before);assert.deepEqual(compact(result),result);
 assert.deepEqual(compact(['Segunda mitad: Hawaiana','Salsa: BBQ (+$2000)']),['Segunda mitad: Hawaiana','Salsa: BBQ (+$2000)']);
});
