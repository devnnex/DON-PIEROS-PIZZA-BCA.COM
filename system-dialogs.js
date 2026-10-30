(() => {
  'use strict';
  const jobs=[],keyed=new Map();
  let active=null;
  const dialog=document.createElement('dialog');
  dialog.className='dp-system-dialog';
  dialog.innerHTML=`<form class="dp-system-card" method="dialog">
    <button class="dp-system-close" type="button" aria-label="Cerrar">×</button>
    <span class="dp-system-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01M10.3 4.8 2.8 18a1.3 1.3 0 0 0 1.1 2h16.2a1.3 1.3 0 0 0 1.1-2L13.7 4.8a2 2 0 0 0-3.4 0Z"/></svg></span>
    <span class="dp-system-eyebrow">Don Pieros Pizza</span>
    <h2 id="dp-system-title"></h2><p id="dp-system-message"></p>
    <label class="dp-system-field" hidden><span></span><input type="text" autocomplete="off"><textarea rows="4" hidden></textarea></label>
    <div class="dp-system-actions"><button class="dp-system-cancel" type="button">Cancelar</button><button class="dp-system-accept" type="submit">Continuar</button></div>
  </form>`;
  dialog.setAttribute('aria-labelledby','dp-system-title');dialog.setAttribute('aria-describedby','dp-system-message');
  document.body.append(dialog);
  const get=selector=>dialog.querySelector(selector),form=get('form'),field=get('.dp-system-field');
  function next(){
    if(active||!jobs.length)return;
    active=jobs.shift();const {type,options}=active;
    dialog.dataset.tone=options.danger?'danger':'default';dialog.dataset.kind=type;
    dialog.setAttribute('role',type==='prompt'?'dialog':'alertdialog');
    get('h2').textContent=options.title||(type==='alert'?'Aviso':type==='prompt'?'Escribe tu respuesta':'¿Continuar?');
    get('p').textContent=options.message||'';get('p').hidden=!options.message;
    get('.dp-system-eyebrow').textContent=options.eyebrow||'Don Pieros Pizza';
    get('.dp-system-cancel').hidden=type==='alert';get('.dp-system-cancel').textContent=options.cancel||'Cancelar';
    get('.dp-system-accept').textContent=options.accept||(type==='alert'?'Entendido':type==='prompt'?'Guardar':'Continuar');
    field.hidden=type!=='prompt';get('.dp-system-field>span').textContent=options.label||'Tu respuesta';
    for(const input of field.querySelectorAll('input,textarea')){
      input.hidden=type!=='prompt'||(input.tagName==='TEXTAREA')!==!!options.multiline;
      input.disabled=input.hidden;input.value=String(options.value??'');input.readOnly=!!options.readOnly;
      input.required=!!options.required;input.placeholder=options.placeholder||'';
      input.maxLength=Number.isInteger(options.maxLength)&&options.maxLength>0?options.maxLength:10000;
      input.setAttribute('aria-labelledby','dp-system-field-label');
    }
    get('.dp-system-field>span').id='dp-system-field-label';
    dialog.returnValue='cancel';dialog.showModal();
    const focus=type==='prompt'?field.querySelector(':not([hidden]):is(input,textarea)'):get(type==='alert'?'.dp-system-accept':'.dp-system-cancel');
    focus?.focus({preventScroll:true});if(type==='prompt'&&options.select)focus?.select();
  }
  function finish(){
    if(!active)return;
    const job=active,accepted=dialog.returnValue==='accept';active=null;
    if(job.key)keyed.delete(job.key);
    const value=job.type==='prompt'?(accepted?field.querySelector('input:not([hidden]),textarea:not([hidden])').value:null):job.type==='confirm'?accepted:undefined;
    if(job.focus?.isConnected)job.focus.focus({preventScroll:true});
    job.resolve(value);queueMicrotask(next);
  }
  function ask(type,settings,value){
    const options=typeof settings==='string'?{message:settings,...(type==='prompt'?{value}: {})}:{...settings};
    const key=options.key;if(key&&keyed.has(key))return keyed.get(key);
    const promise=new Promise(resolve=>jobs.push({type,options,resolve,key,focus:document.activeElement}));
    if(key)keyed.set(key,promise);next();return promise;
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())dialog.close('accept');});
  for(const selector of ['.dp-system-cancel','.dp-system-close'])get(selector).addEventListener('click',()=>dialog.close('cancel'));
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close('cancel');});
  dialog.addEventListener('close',finish);
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close('cancel');
  });
  window.addEventListener('donpieros-session-change',()=>{
    for(const job of jobs.splice(0)){if(job.key)keyed.delete(job.key);job.resolve(job.type==='prompt'?null:job.type==='confirm'?false:undefined);}
    if(dialog.open)dialog.close('cancel');
  });
  window.DonPierosDialogs=Object.freeze({alert:options=>ask('alert',options),confirm:options=>ask('confirm',options),prompt:(options,value)=>ask('prompt',options,value)});
})();
