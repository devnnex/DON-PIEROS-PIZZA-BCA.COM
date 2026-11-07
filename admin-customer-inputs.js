(() => {
  'use strict';
  if(document.body.dataset.page!=='admin')return;
  const fields=[
    '#dw-product-customer','#dw-individual-customer','#dw-product-phone','#dw-individual-phone',
    '#dw-product-address','#dw-product-observations','#dw-line-notes','#dw-order-notes',
    '#dw-product-time','#dw-estimated-time','#dw-time-value','#dw-time-observations',
    '#dw-custom-name','#dw-item-name',
    '#consumptionForm [name="payer_name"]','#consumptionForm [name="item_name"]','#consumptionForm [name="notes"]',
    '#consumptionForm [name="individual_edit_phone"]','#consumptionForm [name="individual_edit_time"]','#consumptionForm [name="individual_edit_observations"]',
    '#dp-order-time-form [name="estimated_time"]','#dp-order-time-form [name="order_observations"]',
    '#incomeEditForm [name="payer"]'
  ].join(',');
  const upper=value=>value.toLocaleUpperCase('es-CO');
  function normalize(field){
    if(!field?.matches?.(fields)||field.disabled||field.readOnly)return false;
    const value=field.value,next=upper(value);if(value===next)return false;
    const start=field.selectionStart,end=field.selectionEnd,direction=field.selectionDirection;
    field.value=next;
    if(start!==null&&end!==null)field.setSelectionRange(upper(value.slice(0,start)).length,upper(value.slice(0,end)).length,direction);
    return true;
  }
  const sync=field=>{if(normalize(field))field.dispatchEvent(new Event('input',{bubbles:true}));};
  // Capture first so existing form handlers persist the uppercase value.
  document.addEventListener('input',event=>{if(!event.isComposing)normalize(event.target);},true);
  document.addEventListener('change',event=>sync(event.target),true);
  document.addEventListener('focusin',event=>sync(event.target),true);
  document.addEventListener('compositionend',event=>sync(event.target),true);
  document.addEventListener('submit',event=>event.target.querySelectorAll(fields).forEach(sync),true);
})();
