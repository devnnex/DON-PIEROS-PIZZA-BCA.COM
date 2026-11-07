((root,factory)=>{
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document)root.DonPierosMenuOrder=api;
})(globalThis,()=>{
  'use strict';
  const key=value=>String(value||'Menú').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const isBeverage=category=>/\b(?:bebidas?|gaseosas?)\b/.test(key(category));
  const alphabet=new Intl.Collator('es',{sensitivity:'base',numeric:true});
  const pizzaOrder=['pizzas especiales','pizzas sencillas','pizzetas especiales','pizzetas','pizzetas sencillas'];
  function categories(rows){
    const names=[...new Set(rows.map(row=>row.category||'Menú'))];
    const rank=name=>isBeverage(name)?Number.MAX_SAFE_INTEGER:pizzaOrder.includes(key(name))?pizzaOrder.indexOf(key(name)):pizzaOrder.length+names.indexOf(name);
    return names.sort((a,b)=>rank(a)-rank(b));
  }
  function products(rows){
    const order=new Map(categories(rows).map((name,index)=>[name,index]));
    return rows.slice().sort((a,b)=>order.get(a.category||'Menú')-order.get(b.category||'Menú')
      ||(isBeverage(a.category)?alphabet.compare(String(a.name||'').trim(),String(b.name||'').trim()):0));
  }
  return {categories,products};
});
