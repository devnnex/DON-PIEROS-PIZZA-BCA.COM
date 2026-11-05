((root,factory)=>{
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document){root.DonPierosPackaging=api;api.mount();}
})(globalThis,()=>{
  'use strict';
  const sizes={mini:'Mini',mediana:'Mediana',maxi:'Maxi',supermaxi:'Super maxi',pizzeta:'Pizzeta',porcion:'Porción',lasana:'Lasaña',panzerotti:'Panzerotti'};
  const fees={mini:2000,mediana:2000,maxi:4000,supermaxi:4000,pizzeta:2000,porcion:500,lasana:1500,panzerotti:1500};
  const fixed=new Set(['pizzeta','porcion','lasana','panzerotti']);
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function size(value){const text=normalize(value);return /porcion/.test(text)?'porcion':/panzer|pancer|panzar/.test(text)?'panzerotti':/lasan|lasagn|bolones/.test(text)?'lasana':/pizzeta/.test(text)?'pizzeta':/super\s*maxi/.test(text)?'supermaxi':/\bmaxi\b/.test(text)?'maxi':/\bmediana\b/.test(text)?'mediana':/\bmini\b/.test(text)?'mini':'';}
  const fee=value=>fees[value]||0;
  function forProduct(product,selections=[]){
    const name=normalize(product?.name),category=normalize(product?.category),type=size(name);
    const selected=fixed.has(type)?type:/porcion/.test(category)?'porcion':/lasan|lasagn|panzer|pancer|panzar/.test(category)?'lasana':/pizzeta/.test(category)?'pizzeta':/pizza/.test(name+' '+category)?size(selections.join(' ')||name):'';
    return {size:selected,fee:fee(selected)};
  }
  function choices(product){const box=forProduct(product);return fixed.has(box.size)?[box.size]:/pizza/.test(normalize(product?.name+' '+product?.category))?['mini','mediana','maxi','supermaxi','pizzeta']:[];}
  function read(notes){
    const text=String(notes||''),match=text.match(/(?:^|\n)(Para llevar|Domicilio) · Caja (Mini|Mediana|Maxi|Super maxi|Pizzeta|Porción|Lasaña|Panzerotti): \$(500|1\.500|2\.000|4\.000) c\/u$/);
    if(!match){const delivery=text.match(/(?:^|\n)(Recoger en local|Domicilio)$/);return {fee:0,size:'',notes:delivery?text.slice(0,delivery.index).trim():text,fulfillment:delivery?delivery[1]==='Domicilio'?'delivery':'pickup':'dinein'};}
    const selected=size(match[2]);if(fee(selected)!==Number(match[3].replace('.','')))return {fee:0,size:'',notes:text};
    return {fee:fee(selected),size:selected,notes:text.slice(0,match.index).trim(),fulfillment:match[1]==='Domicilio'?'delivery':'pickup'};
  }
  function note(notes,selected,takeaway=!!fee(selected)){const delivery=takeaway==='delivery',charge=takeaway&&takeaway!=='dinein'&&fee(selected);return [read(notes).notes,charge?`${delivery?'Domicilio':'Para llevar'} · Caja ${sizes[selected]}: $${fee(selected).toLocaleString('es-CO')} c/u`:delivery?'Domicilio':takeaway&&takeaway!=='dinein'?'Recoger en local':''].filter(Boolean).join('\n');}
  function breakdown(line={}){
    const saved=read(line.waiter_line_notes??line.notes),quantity=Number(line.quantity)||0;
    const packagingUnitFee=Number(line.packagingUnitFee??saved.fee)||0;
    const included=line.unit_price!=null,raw=Number(included?line.unit_price:line.unitPrice)||0;
    const unitPrice=Math.max(0,raw-(included?packagingUnitFee:0)),products=quantity*unitPrice,packagingTotal=quantity*packagingUnitFee;
    return {quantity,unitPrice,products,packagingUnitFee,packagingSize:line.packagingSize||sizes[saved.size]||'',packagingTotal,total:products+packagingTotal,notes:saved.notes,fulfillment:saved.fulfillment};
  }
  function draft(form,name,price,notes){
    const mode=form.elements.namedItem('packing_mode')?.value,takeaway=['takeaway','delivery'].includes(mode);
    const inferred=forProduct({name}).size;
    const selected=takeaway?(fixed.has(inferred)?inferred:/pizza/.test(normalize(name))?form.elements.namedItem('packing_size')?.value:''):'';
    return {unitPrice:Number(price)+fee(selected),notes:note(notes,selected,mode==='delivery'?'delivery':takeaway)};
  }
  function restore(form,notes,price){
    const saved=read(notes),mode=form.elements.namedItem('packing_mode'),select=form.elements.namedItem('packing_size');
    if(mode){mode.value=saved.fulfillment==='delivery'?'delivery':saved.fulfillment==='pickup'?'takeaway':'local';select.value=saved.size||'mini';select.dataset.manual='1';}
    update(form);return {price:Math.max(0,Number(price)-saved.fee),notes:saved.notes};
  }
  function update(form){
    const mode=form.elements.namedItem('packing_mode'),select=form.elements.namedItem('packing_size');if(!mode||!select)return;
    const name=form.item_name.value||form.querySelector('#consumptionProductSearch')?.value||'';
    const inferred=forProduct({name}).size,pizza=/pizza/.test(normalize(name))&&!fixed.has(inferred);
    if(inferred&&(fixed.has(inferred)||select.dataset.manual!=='1'))select.value=inferred;
    for(const option of select.options||[])option.hidden=pizza&&['porcion','lasana','panzerotti'].includes(option.value);
    const takeaway=['takeaway','delivery'].includes(mode.value);select.closest('label').hidden=!takeaway||!pizza;
    const selected=fixed.has(inferred)?inferred:pizza?select.value:'',box=takeaway?fee(selected):0,qty=Number(form.quantity.value)||1;
    const summary=form.querySelector('[data-packing-summary]');if(summary)summary.textContent=box?`${qty} caja${qty===1?'':'s'} ${sizes[selected]} · $${(box*qty).toLocaleString('es-CO')}`:takeaway?'Este producto no lleva cobro de empaque.':'Sin cobro de caja.';
  }
  function mount(){
    const form=document.querySelector('#consumptionForm');if(!form)return;
    form.querySelector('#consumptionOptionalFields').insertAdjacentHTML('beforeend',`<div class="dp-packing-controls"><label>Entrega<select name="packing_mode"><option value="local">En el local</option><option value="takeaway">Para llevar</option><option value="delivery">Domicilio</option></select></label><label hidden>Tamaño de caja<select name="packing_size">${Object.entries(sizes).map(([id,label])=>`<option value="${id}">${label} · $${fee(id).toLocaleString('es-CO')}</option>`).join('')}</select></label><small data-packing-summary>Sin cobro de caja.</small></div>`);
    form.addEventListener('input',()=>update(form));form.addEventListener('change',event=>{if(event.target.name==='packing_size')event.target.dataset.manual='1';update(form);});
    form.addEventListener('reset',()=>{delete form.elements.namedItem('packing_size').dataset.manual;queueMicrotask(()=>update(form));});update(form);
  }
  return {sizes,size,fee,forProduct,choices,read,note,breakdown,draft,restore,update,mount};
});
