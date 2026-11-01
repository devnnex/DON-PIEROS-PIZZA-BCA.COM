const test=require('node:test'),assert=require('node:assert/strict'),{completeTableItems}=require('../order-details.js');
test('la comanda completa incluye consumos anteriores y nuevas comandas pendientes una sola vez',()=>{
 const session={id:'session',table_id:'table',status:'open',session_items:[
  {id:'old',item_name:'Pizza anterior',quantity:2,status:'served',waiter_comanda_id:'accepted'},
  {id:'manual',item_name:'Bebida',quantity:1,status:'served',notes:'Sin hielo'},
  {id:'cancelled',item_name:'Retirada',quantity:9,status:'cancelled'}
 ]};
 const orders=[
  {id:'accepted',session_id:'session',table_id:'table',accepted_at:'2026-10-31',items:[{id:'old',quantity:2}]},
  {id:'new',session_id:'session',table_id:'table',items:[{id:'extra',item_name:'Pizza extra',quantity:3,waiter_line_notes:'Sin cebolla'}]},
  {id:'other',session_id:'other-session',table_id:'table',items:[{id:'other',quantity:5}]},
  {id:'other-table',session_id:'session',table_id:'different-table',items:[{id:'different',quantity:5}]},
  {id:'removed',session_id:'session',table_id:'table',items:[]}
 ];
 const items=completeTableItems(session,orders);
 assert.deepEqual(items.map(item=>item.id),['old','manual','extra']);
 assert.equal(items.reduce((sum,item)=>sum+item.quantity,0),6);
 assert.equal(items[0].pending,false);assert.equal(items[2].pending,true);assert.equal(items[2].waiter_line_notes,'Sin cebolla');
 assert.equal(session.session_items.length,3,'Imprimir no modifica el consumo.');
});
test('aceptar entre las lecturas no duplica productos y reutilizar una mesa no mezcla cuentas',()=>{
 const pending={id:'order',session_id:'first',table_id:'table',accepted_at:null,items:[{id:'line',quantity:2}]};
 const accepted={id:'first',table_id:'table',status:'open',session_items:[{id:'line',quantity:2,waiter_comanda_id:'order',status:'served'}]};
 assert.equal(completeTableItems(accepted,[pending]).length,1);
 assert.deepEqual(completeTableItems({...accepted,status:'closed'},[pending]),[]);
 assert.deepEqual(completeTableItems({id:'second',table_id:'table',status:'open',session_items:[]},[pending]),[]);
 assert.deepEqual(completeTableItems(null,[pending]),[]);
});
