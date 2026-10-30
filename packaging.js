((root,factory)=>{
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document){root.DonPierosPackaging=api;api.mount();}
})(globalThis,()=>{
  'use strict';
  const sizes={mini:'Mini',mediana:'Mediana',maxi:'Maxi',supermaxi:'Super maxi',pizzeta:'Pizzeta'};
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function size(value){const text=normalize(value);return /pizzeta/.test(text)?'pizzeta':/super\s*maxi/.test(text)?'supermaxi':/\bmaxi\b/.test(text)?'maxi':/\bmediana\b/.test(text)?'mediana':/\bmini\b/.test(text)?'mini':'';}
  const fee=value=>['maxi','supermaxi'].includes(value)?4000: sizes[value]?2000:0;
  function forProduct(product,selections=[]){
    if(!/pizza|pizzeta/.test(normalize(product?.name+' '+product?.category)))return {size:'',fee:0};
    const selected=/pizzeta/.test(normalize(product?.category+' '+product?.name))?'pizzeta':size(selections.join(' ')||product?.name);
    return {size:selected,fee:fee(selected)};
  }
  function read(notes){
    const text=String(notes||''),match=text.match(/(?:^|\n)Para llevar · Caja (Mini|Mediana|Maxi|Super maxi|Pizzeta): \$(2\.000|4\.000) c\/u$/);
    if(!match){const pickup=text.match(/(?:^|\n)Recoger en local$/);return {fee:0,size:'',notes:pickup?text.slice(0,pickup.index).trim():text,fulfillment:pickup?'pickup':'dinein'};}
    const selected=size(match[1]);if(fee(selected)!==Number(match[2].replace('.','')))return {fee:0,size:'',notes:text};
    return {fee:fee(selected),size:selected,notes:text.slice(0,match.index).trim(),fulfillment:'pickup'};
  }
  function note(notes,selected,takeaway=!!fee(selected)){return [read(notes).notes,fee(selected)?`Para llevar · Caja ${sizes[selected]}: $${fee(selected)===4000?'4.000':'2.000'} c/u`:takeaway?'Recoger en local':''].filter(Boolean).join('\n');}
  function draft(form,name,price,notes){
    const selected=form.elements.namedItem('packing_mode')?.value==='takeaway'&&/pizza|pizzeta/.test(normalize(name))?form.elements.namedItem('packing_size')?.value:'';
    return {unitPrice:Number(price)+fee(selected),notes:note(notes,selected,form.elements.namedItem('packing_mode')?.value==='takeaway')};
  }
  function restore(form,notes,price){
    const saved=read(notes),mode=form.elements.namedItem('packing_mode'),select=form.elements.namedItem('packing_size');
    if(mode){mode.value=saved.fulfillment==='pickup'?'takeaway':'local';select.value=saved.size||'mini';select.dataset.manual='1';}
    update(form);return {price:Math.max(0,Number(price)-saved.fee),notes:saved.notes};
  }
  function update(form){
    const mode=form.elements.namedItem('packing_mode'),select=form.elements.namedItem('packing_size');if(!mode||!select)return;
    const name=form.item_name.value||form.querySelector('#consumptionProductSearch')?.value||'';
    const pizza=/pizza|pizzeta/.test(normalize(name)),inferred=size(name);
    if(inferred&&select.dataset.manual!=='1')select.value=inferred;
    const takeaway=mode.value==='takeaway';select.closest('label').hidden=!takeaway||!pizza;
    const box=takeaway&&pizza?fee(select.value):0,qty=Number(form.quantity.value)||1;
    form.querySelector('[data-packing-summary]').textContent=box?`${qty} caja${qty===1?'':'s'} ${sizes[select.value]} · $${(box*qty).toLocaleString('es-CO')}`:takeaway?'Este producto no lleva cobro de caja de pizza.':'Sin cobro de caja.';
  }
  function mount(){
    const form=document.querySelector('#consumptionForm');if(!form)return;
    form.querySelector('.consumption-quantity').insertAdjacentHTML('beforebegin',`<div class="dp-packing-controls"><label>Preparación<select name="packing_mode"><option value="local">En el local</option><option value="takeaway">Para llevar</option></select></label><label hidden>Tamaño de caja<select name="packing_size">${Object.entries(sizes).map(([id,label])=>`<option value="${id}">${label} · $${fee(id).toLocaleString('es-CO')}</option>`).join('')}</select></label><small data-packing-summary>Sin cobro de caja.</small></div>`);
    form.addEventListener('input',()=>update(form));form.addEventListener('change',event=>{if(event.target.name==='packing_size')event.target.dataset.manual='1';update(form);});
    form.addEventListener('reset',()=>{delete form.elements.namedItem('packing_size').dataset.manual;queueMicrotask(()=>update(form));});update(form);
  }
  return {sizes,size,fee,forProduct,read,note,draft,restore,update,mount};
});
