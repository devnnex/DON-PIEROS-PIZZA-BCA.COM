(() => {
  'use strict';
  if(document.body.dataset.page!=='admin')return;
  const $=selector=>document.querySelector(selector),api=()=>window.DonPierosAdmin;
  const deletions=()=>window.DonPierosDeletions;
  const isRemoved=order=>deletions()?.hidden('waiter-comanda',order.id,order.version);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value)||0);
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const waiter=()=>api()?.getUser()?.role==='waiter';
  const allowed=()=>{const user=api()?.getUser();return user&&(user.role==='boss'||user.role==='waiter'||user.role==='admin'&&(!Array.isArray(user.permissions)||user.permissions.includes('dashboard')||user.permissions.includes('service')));};
  const operations=()=>api()?.getOperations?.()||{tables:[],sessions:[]};
  const tableLabel=table=>table?.table_name||`Mesa ${table?.table_number||''}`;
  const sessionFor=id=>operations().sessions.find(session=>session.table_id===id&&session.status==='open');
  const liveItems=session=>(session?.session_items||[]).filter(item=>item.status!=='cancelled');
  const total=rows=>rows.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0);
  let selectedTable='',tab='menu',category='',query='',draft=null,catalog=null,orders=[],busy=false,loading=null,catalogLoading=null;
  let token='',lastSnapshot='',homeSignature='',managerSignature='',managerOpen='',editingLine='',replacingLine='',activeProduct=null,loadError='',catalogError='';
  let writeRevision=0,reloadWanted=false,serviceReady=false;const localWrites=new Map();
  let printWidth=80;
  try{if(localStorage.getItem('don_pieros_order_paper')==='58')printWidth=58;}catch(_){}
  const root=document.createElement('div');root.id='dp-waiter-app';root.hidden=true;$('#service').append(root);
  const reception=document.createElement('section');reception.id='dp-table-comandas';reception.className='dw-reception';reception.hidden=true;
  ($('#dp-dashboard-orders')||$('#alertsPanel')).after(reception);
  document.body.insertAdjacentHTML('beforeend',`<dialog class="dw-dialog" id="dw-product-dialog" aria-labelledby="dw-product-title"><form id="dw-product-form"><div id="dw-product-body"></div></form></dialog><dialog class="dw-dialog" id="dw-review-dialog" aria-labelledby="dw-review-title"><div id="dw-review-body"></div></dialog><dialog class="dw-dialog dw-kitchen-dialog" id="dw-kitchen-dialog" aria-labelledby="dw-kitchen-title"><div id="dw-kitchen-body"></div></dialog><dialog class="dw-dialog dw-kitchen-dialog" id="dw-catalog-dialog" aria-labelledby="dw-catalog-title"><div id="dw-manager-catalog"></div></dialog>`);
  const errorText=error=>['PGRST202','42883','42P01'].includes(error?.code)?'El servicio de mesas necesita activar la actualización del negocio. Contacta al responsable.':['22P02','23514'].includes(error?.code)?'Revisa las cantidades, opciones y notas del pedido.':window.DonPierosLanguage.message(error,'No pudimos completar la acción. Intenta de nuevo.');
  async function rpc(name,payload={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{return await api().db.rpc(name,payload).abortSignal(controller.signal);}finally{clearTimeout(timer);}
  }
  const draftKey=()=>`dp_waiter_draft_v1:${api()?.getUser()?.id}:${selectedTable}`;
  function persist(){if(!draft||!selectedTable)return;try{localStorage.setItem(draftKey(),JSON.stringify(draft));}catch(_){}}
  function newDraft(){draft={id:crypto.randomUUID(),version:0,session_id:sessionFor(selectedTable)?.id||null,items:[],notes:'',pending:null};persist();renderSelection();}
  function syncDraftSession(){
    if(!draft||!selectedTable||draft.version||draft.pending||busy)return;
    const sessionId=sessionFor(selectedTable)?.id||null;
    if(draft.session_id!==sessionId){draft.session_id=sessionId;persist();}
  }
  function restoreDraft(){try{draft=JSON.parse(localStorage.getItem(draftKey())||'null');}catch(_){draft=null;}if(!draft||!Array.isArray(draft.items))newDraft();else syncDraftSession();}
  function leaveClosedDraft(){
    if(!draft)return;
    const managerMode=!!draft.managerMode,orderId=draft.id;
    localWrites.delete(orderId);orders=orders.filter(order=>order.id!==orderId);
    try{localStorage.removeItem(draftKey());}catch(_){}
    draft=null;activeProduct=null;editingLine='';replacingLine='';
    for(const id of ['dw-product-dialog','dw-review-dialog','dw-catalog-dialog'])$('#'+id).close();
    if(managerOpen===orderId)$('#dw-kitchen-dialog').close();
    if(managerMode)selectedTable='';
    else{newDraft();tab='menu';renderTable();}
    api().notify('La cuenta anterior ya terminó. Puedes tomar una nueva comanda desde la mesa.');
    void api().refreshOperations();
  }
  function footer(){const count=(draft?.items||[]).reduce((sum,item)=>sum+item.quantity,0);return `<button class="dw-review-button" type="button" data-dw-review ${count||draft?.version?'':'disabled'}><span><b>${count} ${count===1?'producto':'productos'}</b><small>${draft?.version?'Revisar cambios':'Revisar pedido'}</small></span><strong>${money(total(draft?.items||[]))} <span aria-hidden="true">→</span></strong></button>`;}
  function renderHome(){
    const {tables,sessions}=operations();
    const signature=JSON.stringify([selectedTable,tables,sessions.map(s=>[s.id,s.table_id,s.status,s.session_items]),orders]);
    if(signature===homeSignature)return;homeSignature=signature;
    if(selectedTable){renderAccount();return;}
    root.innerHTML=`<header class="dw-home-head"><div><span class="eyebrow">Servicio a la mesa</span><h2>Tus mesas</h2><p>Elige una mesa para tomar el pedido o ver su consumo.</p></div><span class="dw-role">${esc(api().getUser().full_name||'Mesero')}</span></header><div class="dw-table-grid">${tables.filter(t=>t.is_active!==false&&!['bar','planter'].includes(t.service_point_kind)).map(table=>{
      const session=sessions.find(s=>s.table_id===table.id&&s.status==='open'),items=liveItems(session),units=items.reduce((sum,item)=>sum+Number(item.quantity),0);
      const pending=orders.some(order=>!isRemoved(order)&&order.table_id===table.id&&!order.accepted_at&&order.items.length);
      return `<button class="dw-table ${items.length||pending?'is-occupied':''}" data-dw-table="${esc(table.id)}" type="button"><span class="dw-table-symbol" aria-hidden="true">▦</span><strong>${esc(tableLabel(table))}</strong><span>${units?`${units} productos · ${money(total(items))}`:pending?'Pedido pendiente de aceptar':'Lista para atender'}</span><small>${units||pending?'Ver pedido y consumo':'Tomar pedido'} <b>→</b></small></button>`;
    }).join('')||'<div class="dw-empty">No hay mesas disponibles. Pide al responsable que las agregue.</div>'}</div>`;
  }
  function renderTable(){
    const table=operations().tables.find(t=>t.id===selectedTable);if(!table)return;
    root.innerHTML=`<header class="dw-table-head"><button type="button" class="dw-back" data-dw-home>← Mesas</button><div><span class="eyebrow">Tomando pedido</span><h2>${esc(tableLabel(table))}</h2></div><button type="button" class="dw-account-shortcut" data-dw-tab="account">Ver consumo</button></header><div class="dw-tabs"><button type="button" data-dw-tab="menu" class="${tab==='menu'?'active':''}">Carta</button><button type="button" data-dw-tab="account" class="${tab==='account'?'active':''}">Consumo de la mesa</button></div><div id="dw-menu-view" ${tab==='menu'?'':'hidden'}><label class="dw-search"><span>Buscar un producto</span><input type="search" id="dw-product-search" placeholder="Pizza, bebida, lasaña…" value="${esc(query)}" autocomplete="off"></label><div class="dw-categories" id="dw-categories"></div><div class="dw-product-grid" id="dw-products"></div></div><div id="dw-account-view" ${tab==='account'?'':'hidden'}></div><div class="dw-order-footer" id="dw-selection"></div>`;
    renderProducts();renderAccount();renderSelection();
  }
  function renderProducts(){
    if(!$('#dw-products'))return;
    if(!catalog){$('#dw-products').innerHTML=`<div class="dw-empty">${esc(catalogError||'Preparando la carta…')}${catalogError?'<button type="button" class="dw-button" data-dw-reload>Cargar carta</button>':''}</div>`;return;}
    const categories=[...new Set(catalog.products.filter(p=>p.available).map(p=>p.category||'Menú'))];
    $('#dw-categories').innerHTML=['',...categories].map(name=>`<button type="button" data-dw-category="${esc(name)}" aria-pressed="${name===category}" class="${name===category?'active':''}">${esc(name||'Todo')}</button>`).join('');
    const rows=catalog.products.filter(p=>p.available&&(!category||p.category===category)&&normalize(p.name+' '+p.description).includes(normalize(query)));
    $('#dw-products').innerHTML=rows.map(p=>`<button type="button" class="dw-product" data-dw-product="${esc(p.id)}"><img src="${esc(window.DonPierosImages.resolve(p))}" alt="" loading="lazy" decoding="async"><div><strong>${esc(p.name)}</strong><small>${esc(p.description||p.category)}</small><span>${p.modifiers?.some(g=>g.usePrice)?'Desde ':''}${money(p.price)} <b aria-hidden="true">＋</b></span></div></button>`).join('')||'<p class="dw-empty">No encontramos ese producto en esta categoría.</p>';
  }
  function renderSelection(){if($('#dw-selection')){$('#dw-selection').innerHTML=footer();$('#dw-selection').hidden=tab==='account'&&!draft?.items.length&&!draft?.version;}}
  function renderAccount(){
    const box=$('#dw-account-view');if(!box)return;
    const session=sessionFor(selectedTable),items=liveItems(session),myOrders=orders.filter(order=>!isRemoved(order)&&order.table_id===selectedTable);
    box.innerHTML=`<div class="dw-account-total"><span>Consumo de la mesa</span><strong>${money(total(items))}</strong><small>${items.reduce((sum,item)=>sum+Number(item.quantity),0)} productos registrados</small></div>${items.length?`<div class="dw-consumption-lines">${items.map(item=>`<article><b>${Number(item.quantity)} ×</b><div><strong>${esc(item.item_name)}</strong>${item.notes?`<p>${esc(item.notes)}</p>`:''}</div><strong>${money(Number(item.quantity)*Number(item.unit_price))}</strong></article>`).join('')}</div>`:'<p class="dw-empty">La mesa aún no tiene consumos.</p>'}<h3>Tus comandas enviadas</h3>${myOrders.map(order=>`<article class="dw-sent-order"><div><strong>${order.items.length?'Pedido enviado':'Pedido retirado'}</strong><small>${esc(window.DonPierosDates.dateTime(order.updated_at))} · ${order.accepted_at?'Agregado al consumo':'Pendiente de aceptar'} · v${order.version}</small></div><p>${esc(order.items.map(item=>`${item.quantity} × ${item.item_name}`).join(', ')||'Todos los productos fueron retirados.')}</p>${order.notes?`<p class="dw-order-notes">${esc(order.notes)}</p>`:''}<button type="button" class="dw-button" data-dw-edit-order="${esc(order.id)}">Editar comanda</button>${order.items.length?` <button class="dw-button dw-remove" type="button" data-dw-remove-order="${esc(order.id)}">Retirar comanda</button>`:''}</article>`).join('')||'<p class="dw-muted">Las comandas que envíes desde esta mesa aparecerán aquí.</p>'}${loadError?`<p class="dw-error">${esc(loadError)}</p>`:''}<button class="dw-button dw-add-more" type="button" data-dw-tab="menu">＋ Agregar productos</button>`;
  }
  async function loadCatalog(){
    if(catalogLoading)return catalogLoading;
    catalogError='';
    catalogLoading=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(window.DON_PIEROS_CONFIG.appsScriptUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'dp_get_catalog'}),signal:controller.signal});
        const data=await response.json();if(!response.ok||!data.ok)throw Error('No pudimos cargar la carta. Intenta de nuevo.');
        catalog=data;
      }catch(error){catalogError='No pudimos cargar la carta. Toca Cargar carta para reintentar.';}
      finally{clearTimeout(timer);catalogLoading=null;renderProducts();}
    })();return catalogLoading;
  }
  async function loadOrders(force=false){
    if(!allowed())return;
    if(loading){if(force)reloadWanted=true;return loading;}
    const currentToken=api().getToken(),readRevision=writeRevision;
    loading=(async()=>{
      try{
        const {data,error}=await rpc('dp_list_waiter_comandas');if(error)throw error;
        if(currentToken!==api().getToken())return;
        if(!Array.isArray(data?.orders))return;
        const becameReady=!serviceReady;serviceReady=true;if(becameReady)sync();
        const next=new Map(data.orders.map(order=>[order.id,order]));
        for(const [id,write] of localWrites){
          const incoming=next.get(id);
          if(write.revision>readRevision||incoming&&(incoming.version<write.order.version||String(incoming.updated_at)<String(write.order.updated_at)))next.set(id,write.order);
          else localWrites.delete(id);
        }
        orders=[...next.values()].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));loadError='';
        if(readRevision===writeRevision&&draft?.version&&!draft.pending&&!busy&&!data.orders.some(order=>order.id===draft.id))leaveClosedDraft();
        syncDraftSession();renderAccount();renderReception();if(waiter())renderHome();
      }catch(error){loadError=errorText(error);renderAccount();}
      finally{loading=null;if(reloadWanted){reloadWanted=false;void loadOrders();}}
    })();return loading;
  }
  function openTable(id){
    if(!waiter()||!serviceReady||!operations().tables.some(t=>t.id===id&&t.is_active!==false))return;
    selectedTable=id;tab=liveItems(sessionFor(id)).length||orders.some(order=>!isRemoved(order)&&order.table_id===id&&order.items.length)?'account':'menu';category='';query='';restoreDraft();
    homeSignature='';renderTable();root.scrollIntoView({block:'start',behavior:'instant'});void loadOrders();if(!catalog)void loadCatalog();
  }
  function showProduct(id,lineId=''){
    if(draft?.pending)return api().notify('Primero confirma el envío pendiente.','error');
    if(!catalog){void loadCatalog().then(()=>{if(catalog)showProduct(id,lineId);else api().notify(catalogError,'error');});return;}
    const product=catalog?.products.find(p=>p.id===id);if(!product)return;
    editingLine=lineId;activeProduct=product;
    const existing=draft.items.find(item=>item.id===lineId),ids=existing?.product_id===id?(existing.options?.selectionIds||{}):{};
    $('#dw-product-body').innerHTML=`<header class="dw-dialog-head"><div><span class="eyebrow">${esc(product.category)}</span><h2 id="dw-product-title">${esc(product.name)}</h2></div><button type="button" class="dw-close" data-dw-close aria-label="Cerrar">×</button></header><div class="dw-product-options">${(product.modifiers||[]).map(group=>{
      const min=group.required?Math.max(1,Number(group.min)||1):0;
      return `<fieldset data-dw-group="${esc(group.id)}" data-min="${min}" data-max="${Number(group.max)||99}"><legend>${esc(group.name)} <small>${min?'Obligatorio':'Opcional'}</small></legend>${catalog.toppings.filter(option=>option.available&&option.kind===group.source).map(option=>`<label><input type="${Number(group.max)===1?'radio':'checkbox'}" name="${esc(group.id)}" value="${esc(option.id)}" ${(ids[group.id]||[]).includes(option.id)?'checked':''}><span>${esc(option.name)}</span><small>${group.usePrice&&Number(option.price)?'+'+money(option.price):'Incluido'}</small></label>`).join('')}</fieldset>`;
    }).join('')}</div><div class="dw-quantity"><span>Cantidad</span><button type="button" data-dw-quantity="-1" aria-label="Disminuir cantidad">−</button><output id="dw-product-quantity">${existing?.quantity||1}</output><button type="button" data-dw-quantity="1" aria-label="Aumentar cantidad">＋</button></div><label class="dw-notes-label">Notas del producto <small>Opcional</small><textarea id="dw-line-notes" maxlength="500" placeholder="Ej.: sin cebolla, salsa aparte…">${esc(existing?.notes||'')}</textarea></label><p id="dw-product-error" class="dw-error" role="alert"></p><button type="submit" class="dw-primary" id="dw-add-product">${existing?'Actualizar producto':'Agregar al pedido'} · <span id="dw-product-price"></span></button>`;
    updateProductOptions();$('#dw-product-dialog').showModal();
  }
  function productSelection(validate=false){
    let unitPrice=Number(activeProduct.price),valid=true;const selectionIds={},labels=[];
    for(const group of activeProduct.modifiers||[]){
      const field=[...$('#dw-product-body').querySelectorAll('[data-dw-group]')].find(f=>f.dataset.dwGroup===group.id);
      const ids=[...field.querySelectorAll('input:checked')].map(input=>input.value);selectionIds[group.id]=ids;
      const complete=ids.length>=Number(field.dataset.min)&&ids.length<=Number(field.dataset.max);
      field.classList.toggle('is-complete',complete&&ids.length>0);if(validate)field.classList.toggle('is-invalid',!complete);
      if(complete)field.classList.remove('is-invalid');if(!complete)valid=false;
      for(const id of ids){const option=catalog.toppings.find(t=>t.id===id);if(group.usePrice)unitPrice+=Number(option.price)||0;
        labels.push(group.name.replace(/^elige\s+(?:el\s+)?tamaño/i,'Tamaño')+': '+option.name);}
    }
    return {valid,unitPrice,options:{selectionIds,labels}};
  }
  function updateProductOptions(){if(!activeProduct)return;const price=productSelection().unitPrice*Number($('#dw-product-quantity').value);$('#dw-product-price').textContent=money(price);}
  function addProduct(event){
    event.preventDefault();const selection=productSelection(true);
    if(!selection.valid){$('#dw-product-error').textContent='Elige las opciones obligatorias para continuar.';$('#dw-product-body .is-invalid')?.scrollIntoView({block:'center',behavior:'smooth'});return;}
    const line={id:editingLine||crypto.randomUUID(),product_id:activeProduct.id,name:activeProduct.name,quantity:Number($('#dw-product-quantity').value),unit_price:selection.unitPrice,options:selection.options,notes:$('#dw-line-notes').value.trim()};
    if([...(line.options.labels||[]),line.notes].join(' · ').length>500){$('#dw-product-error').textContent='Acorta un poco las notas de este producto.';return;}
    if(editingLine)draft.items=draft.items.map(item=>item.id===editingLine?line:item);else draft.items.push(line);
    persist();$('#dw-product-dialog').close();renderSelection();if($('#dw-review-dialog').open)renderReview();
    if(replacingLine||draft.managerMode&&$('#dw-catalog-dialog').open){replacingLine='';$('#dw-replace-banner')?.remove();$('#dw-catalog-dialog').close();review();}
    api().notify(editingLine?'Producto actualizado.':'Producto agregado al pedido.');
  }
  function review(){if(!draft)return;renderReview();if(!$('#dw-review-dialog').open)$('#dw-review-dialog').showModal();}
  function renderReview(){
    const locked=busy||!!draft.pending;
    $('#dw-review-body').innerHTML=`<header class="dw-dialog-head"><div><span class="eyebrow">${esc(tableLabel(operations().tables.find(t=>t.id===selectedTable)))}</span><h2 id="dw-review-title">${draft.version?'Editar comanda':'Revisar pedido'}</h2></div><button type="button" class="dw-close" data-dw-close aria-label="Cerrar">×</button></header>${draft.version?'<p class="dw-edit-notice">Los cambios actualizarán la misma comanda. No se enviará otra solicitud.</p>':''}<div class="dw-review-lines">${draft.items.map(item=>`<article><div><strong>${item.quantity} × ${esc(item.name)}</strong>${item.options.labels.map(label=>`<p>${esc(label)}</p>`).join('')}${item.notes?`<p class="dw-order-notes">${esc(item.notes)}</p>`:''}<small>${money(item.unit_price*item.quantity)}</small></div><div class="dw-line-actions"><button type="button" data-dw-edit-line="${esc(item.id)}" ${locked?'disabled':''}>Editar</button><button type="button" data-dw-replace-line="${esc(item.id)}" ${locked?'disabled':''}>Cambiar</button><button type="button" data-dw-remove-line="${esc(item.id)}" ${locked?'disabled':''}>Quitar</button></div></article>`).join('')||'<p class="dw-empty">Se retirarán todos los productos de esta comanda.</p>'}</div><label class="dw-notes-label">Notas para cocina <small>Opcional</small><textarea id="dw-order-notes" maxlength="500" placeholder="Indicaciones generales para este pedido…" ${locked?'disabled':''}>${esc(draft.notes)}</textarea></label><div class="dw-review-total"><span>Total de esta comanda</span><strong>${money(total(draft.items))}</strong></div><p id="dw-send-error" class="dw-error" role="alert">${draft.pending&&!busy?'Hay un envío pendiente de confirmar. Reintenta para comprobarlo sin duplicarlo.':''}</p><button class="dw-primary" type="button" id="dw-send-order" ${busy?'disabled':''}>${busy?'Guardando…':draft.pending?'Confirmar envío pendiente':draft.version?'Guardar cambios':'Enviar comanda'}</button>`;
    const add=document.createElement('button');add.type='button';add.className='dw-button dw-add-more';add.setAttribute('data-dw-add-extra','');add.textContent='＋ Agregar otro producto';add.disabled=locked;
    $('#dw-review-body .dw-review-lines').after(add);
    $('#dw-review-body [data-dw-close]').disabled=busy;
  }
  function rememberResult(data){
    const previous=orders.find(order=>order.id===data.comanda.id)||{};
    const order={...previous,...data.comanda,table:operations().tables.find(t=>t.id===data.comanda.table_id)||previous.table,
      waiter_name:previous.waiter_name||api().getUser().full_name,request_status:data.request?.status,
      items:(data.comanda.items||[]).map(item=>({id:item.id,web_product_id:item.product_id,item_name:item.name,quantity:item.quantity,unit_price:item.unit_price,waiter_options:item.options,waiter_line_notes:item.notes}))};
    localWrites.set(order.id,{revision:++writeRevision,order});orders=[order,...orders.filter(row=>row.id!==order.id)];managerSignature='';
  }
  async function sendOrder(){
    if(busy||!draft||(!draft.items.length&&!draft.version))return;
    const sendingDraft=draft,currentToken=api().getToken();
    syncDraftSession();
    if(!draft.pending){draft.notes=$('#dw-order-notes').value.trim();draft.pending={p_operation_id:crypto.randomUUID(),p_comanda_id:draft.id,p_table_id:selectedTable,p_session_id:draft.session_id,p_expected_version:draft.version,p_items:clone(draft.items),p_notes:draft.notes};persist();}
    busy=true;renderReview();
    try{
      const {data,error}=await rpc('dp_save_waiter_comanda',draft.pending);if(error)throw error;if(!data?.comanda)throw Error('No pudimos confirmar el envío.');
      if(currentToken!==api().getToken()||draft!==sendingDraft)return;
      const wasEdit=draft.version>0;
      const managerMode=!!draft.managerMode,orderId=draft.id;
      if(!data.closed)rememberResult(data);
      else{
        orders=orders.filter(order=>order.session_id!==data.session?.id);
        for(const [id,write] of localWrites)if(write.order.session_id===data.session?.id)localWrites.delete(id);
        void api().refreshOperations();
      }
      if(!data.closed)api().applyWaiterResult(data);
      try{localStorage.removeItem(draftKey());}catch(_){}
      busy=false;$('#dw-review-dialog').close();
      if(managerMode){draft=null;await loadOrders();showKitchen(orderId);}
      else{newDraft();tab='account';renderTable();void loadOrders();}
      api().notify(data.closed?'El pedido ya estaba guardado y la cuenta se cerró.':wasEdit?'Comanda actualizada.':'Comanda enviada al equipo.');
    }catch(error){
      if(currentToken!==api().getToken()||draft!==sendingDraft)return;
      busy=false;
      if(draft.version&&error?.code==='P0001'&&/cuenta ya se cerró/i.test(error.message||'')){leaveClosedDraft();return;}
      if(['P0001','PGRST202','42883','42P01','22P02','23514'].includes(error?.code)){draft.pending=null;persist();}
      renderReview();$('#dw-send-error').textContent=errorText(error);void loadOrders();void api().refreshOperations();
    }
  }
  function editOrder(id){
    const order=orders.find(row=>row.id===id);if(!order||!allowed())return;
    if(draft?.pending){review();return;}
    if(draft?.items.length&&draft.id!==id){api().notify('Envía o termina tu selección actual antes de editar otra comanda.','error');review();return;}
    selectedTable=order.table_id;
    draft={id:order.id,version:order.version,session_id:order.session_id,notes:order.notes,items:order.items.map(item=>({id:item.id,product_id:item.web_product_id,name:item.item_name,quantity:Number(item.quantity),unit_price:Number(item.unit_price),options:item.waiter_options||{selectionIds:{},labels:[]},notes:item.waiter_line_notes||''})),pending:null,managerMode:!waiter()};
    $('#dw-kitchen-dialog').close();if(!catalog)void loadCatalog();
    persist();renderSelection();review();
  }
  function renderReception(){
    if(waiter()||!allowed()){reception.hidden=true;return;}reception.hidden=false;
    const visible=orders.filter(order=>order.items.length&&!isRemoved(order));
    const signature=JSON.stringify(visible);if(signature===managerSignature)return;managerSignature=signature;
    reception.innerHTML=`<div class="section-head"><h3>Comandas de mesas <span class="dp-count">${visible.length}</span></h3></div>${visible.length?visible.map(order=>`<button type="button" class="dw-received-card" data-dw-open-comanda="${esc(order.id)}"><span><strong>${esc(tableLabel(order.table))}</strong><small>${esc(order.waiter_name)} · ${esc(window.DonPierosDates.dateTime(order.updated_at))}</small></span><b>${order.items.length?money(order.items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0)):'Retirada'}</b><p>${esc(order.items.map(item=>`${item.quantity} × ${item.item_name}`).join(', '))}</p><span class="dw-received-status">${!order.items.length?'Retirada':!order.accepted_at?'Pendiente de aceptar':order.version>1?'Aceptada · Actualizada':'Aceptada'} <em>Ver comanda →</em></span></button>`).join(''):'<p class="dw-muted">Los pedidos tomados por meseros aparecerán aquí.</p>'}`;
    if(managerOpen&&$('#dw-kitchen-dialog').open)showKitchen(managerOpen);
  }
  function showKitchen(id){
    const order=orders.find(row=>row.id===id);if(!order||isRemoved(order))return;managerOpen=id;
    $('#dw-kitchen-body').innerHTML=`<header class="dw-dialog-head"><div><span class="eyebrow">Comanda de mesero · v${order.version}</span><h2 id="dw-kitchen-title">${esc(tableLabel(order.table))}</h2><p>${esc(order.waiter_name)} · ${esc(window.DonPierosDates.dateTime(order.updated_at))}</p></div><button class="dw-close" type="button" data-dw-close aria-label="Cerrar">×</button></header><div class="dw-review-lines">${order.items.map(item=>`<article><b class="dw-kitchen-qty">${item.quantity} ×</b><div><strong>${esc(item.item_name)}</strong>${(item.waiter_options?.labels||[]).map(label=>`<p>${esc(label)}</p>`).join('')}${item.waiter_line_notes?`<p class="dw-order-notes">${esc(item.waiter_line_notes)}</p>`:''}</div></article>`).join('')||'<p class="dw-empty">El mesero retiró los productos de esta comanda.</p>'}</div>${order.notes?`<div class="dw-kitchen-notes"><strong>Indicaciones para cocina</strong><p>${esc(order.notes)}</p></div>`:''}<div class="dw-review-total"><span>Total de la comanda</span><strong>${money(order.items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0))}</strong></div><p class="dw-muted">Esta vista se actualiza cuando el mesero guarda una corrección.</p>`;
    $('#dw-kitchen-body').insertAdjacentHTML('beforeend',`<p class="dw-edit-notice">${order.accepted_at?'Aceptada: los productos ya están en el consumo de la mesa.':'Pendiente de aceptar: estos productos todavía no se han agregado al consumo.'}</p><div class="dw-kitchen-actions">${!order.accepted_at&&order.items.length?`<button class="dw-primary" type="button" data-dw-accept-order="${esc(order.id)}">Agregar a la mesa</button>`:''}<label class="dw-paper">Papel<select id="dw-print-width"><option value="80">80 mm</option><option value="58">58 mm</option></select></label><button class="dw-button dw-print" type="button" data-dw-print-order="${esc(order.id)}">&#9636; Imprimir comanda</button><button class="dw-button" type="button" data-dw-edit-order="${esc(order.id)}">Editar comanda</button>${order.items.length?`<button class="dw-button dw-remove" type="button" data-dw-remove-order="${esc(order.id)}">Retirar comanda</button>`:''}</div><p id="dw-kitchen-error" class="dw-error" role="alert"></p>`);
    $('#dw-print-width').value=String(printWidth);
    window.DonPierosReception?.dismiss('request:'+id);
    if(!$('#dw-kitchen-dialog').open)$('#dw-kitchen-dialog').showModal();
  }
  async function acceptOrder(id,button){
    const order=orders.find(row=>row.id===id);if(!order||isRemoved(order))return;button.disabled=true;
    try{
      const {data,error}=await rpc('dp_accept_waiter_comanda',{p_comanda_id:id,p_expected_version:order.version});if(error)throw error;
      rememberResult(data);api().applyWaiterResult(data);showKitchen(id);void loadOrders();api().notify('Comanda aceptada. Consumo agregado a la mesa.');
    }catch(error){$('#dw-kitchen-error').textContent=errorText(error);if(button.isConnected)button.disabled=false;void loadOrders();}
  }
  async function openRequest(id){
    if(!orders.some(order=>order.id===id))await loadOrders(true);
    const order=orders.find(row=>row.id===id);if(!order){if(loadError)throw Error(loadError);return false;}
    if(!order.items.length||isRemoved(order)){window.DonPierosReception?.dismiss('request:'+id);return true;}
    showKitchen(id);return true;
  }
  async function removeOrder(id){
    const order=orders.find(row=>row.id===id);if(!order||!allowed()||isRemoved(order))return;
    const token=api().getToken();
    if(!await window.DonPierosDialogs.confirm({key:'remove-comanda:'+id,title:'¿Retirar esta comanda?',message:'Sus productos se quitarán también del consumo de la mesa si ya fueron agregados.',accept:'Retirar comanda',danger:true}))return;
    if(token!==api().getToken()||!allowed()||isRemoved(order))return;
    try{
      deletions().enqueue('waiter-comanda',id,{p_operation_id:crypto.randomUUID(),p_comanda_id:id,p_table_id:order.table_id,p_session_id:order.session_id,p_expected_version:order.version,p_items:[],p_notes:order.notes||''});
      api().previewWaiterRemoval?.(id);$('#dw-kitchen-dialog').close();
      window.DonPierosReception?.dismiss('request:'+id);managerSignature='';homeSignature='';renderReception();renderAccount();if(waiter())renderHome();
      api().notify('Comanda retirada. Se está sincronizando.');
    }catch(error){
      api().notify('No pudimos guardar la solicitud de retiro. '+errorText(error),'error');
    }
  }
  function printKitchen(id){
    const order=orders.find(row=>row.id===id);if(!order||!allowed())return;
    printWidth=$('#dw-print-width')?.value==='58'?58:80;
    try{localStorage.setItem('don_pieros_order_paper',String(printWidth));}catch(_){}
    const popup=window.open('','_blank','width=480,height=720');
    if(!popup){api().notify('Permite las ventanas emergentes para imprimir la comanda.','error');return;}
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ${esc(tableLabel(order.table))}</title><style>@page{size:${printWidth}mm auto;margin:0}*{box-sizing:border-box;color:#000!important;font-weight:900!important}body{width:${printWidth-6}mm;margin:0;font:16px/1.45 monospace;color:#000;background:#fff}h1{text-align:center;font-size:22px;margin:8px 0}header,footer{text-align:center}article{display:flex;gap:8px;padding:10px 0;border-top:1px dashed #000}article>b{font-size:22px}article div{flex:1}article strong{font-size:19px}p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}.notes{border:2px solid #000;padding:8px;margin:12px 0}footer{border-top:1px dashed #000;padding:12px 0}${window.DonPierosThermal.sizeStyle}</style></head><body><header><b>DON PIEROS PIZZA</b><h1>${esc(tableLabel(order.table))}</h1><p>Comanda de mesero · v${Number(order.version)}</p><p>${esc(order.waiter_name)}<br>${esc(window.DonPierosDates.dateTime(order.updated_at))}</p></header>${order.items.map(item=>`<article><b>${Number(item.quantity)} ×</b><div><strong>${esc(item.item_name)}</strong>${(item.waiter_options?.labels||[]).map(label=>{const option=window.DonPierosThermal.sizeOption(label);return `<p class="${option.isSize?'size-option':''}">${option.html}</p>`;}).join('')}${item.waiter_line_notes?`<p><b>${esc(item.waiter_line_notes)}</b></p>`:''}</div></article>`).join('')}${order.notes?`<section class="notes"><b>Indicaciones para cocina</b><p>${esc(order.notes)}</p></section>`:''}<footer>Total: ${esc(money(total(order.items)))}</footer></body></html>`);
    popup.document.close();void window.DonPierosThermal.print(popup,printWidth).catch(error=>api()?.notify('No se pudo preparar la impresión. '+String(error.message||error),'error'));
  }
  async function beginCatalogChoice(replacement=''){
    replacingLine=replacement;$('#dw-review-dialog').close();category='';query='';
    if(draft.managerMode){
      $('#dw-manager-catalog').innerHTML=`<header class="dw-dialog-head"><h2 id="dw-catalog-title">${replacement?'Cambiar producto':'Agregar producto'}</h2><button type="button" class="dw-close" data-dw-close aria-label="Cerrar">×</button></header><label class="dw-search">Buscar producto<input type="search" id="dw-manager-search" placeholder="Pizza, bebida, lasaña…"></label><div id="dw-manager-categories" class="dw-categories"></div><div id="dw-manager-products" class="dw-product-grid"></div>`;
      $('#dw-catalog-dialog').showModal();if(!catalog)await loadCatalog();renderManagerProducts();
    }else{
      tab='menu';renderTable();if(replacement)$('#dw-menu-view').insertAdjacentHTML('afterbegin','<p class="dw-edit-notice" id="dw-replace-banner">Elige el producto que reemplazará al anterior. <button type="button" class="dw-button" data-dw-cancel-replace>Cancelar</button></p>');
      root.scrollIntoView({block:'start',behavior:'instant'});
    }
  }
  function renderManagerProducts(){
    if(!$('#dw-manager-products'))return;
    if(!catalog){$('#dw-manager-products').innerHTML='<p class="dw-error">'+esc(catalogError||'Preparando la carta…')+'</p>';return;}
    const categories=[...new Set(catalog.products.filter(p=>p.available).map(p=>p.category))];
    $('#dw-manager-categories').innerHTML=['',...categories].map(name=>`<button type="button" class="${name===category?'active':''}" data-dw-manager-category="${esc(name)}">${esc(name||'Todo')}</button>`).join('');
    $('#dw-manager-products').innerHTML=catalog.products.filter(p=>p.available&&(!category||p.category===category)&&normalize(p.name).includes(normalize(query))).map(p=>`<button class="dw-product" type="button" data-dw-product="${esc(p.id)}"><img src="${esc(window.DonPierosImages.resolve(p))}" alt="" loading="lazy"><div><strong>${esc(p.name)}</strong><span>${money(p.price)} <b>＋</b></span></div></button>`).join('');
  }
  function sync(){
    if(!allowed()){root.hidden=true;reception.hidden=true;document.body.classList.remove('dw-waiter-mode');return;}
    syncDraftSession();
    const isWaiter=waiter();document.body.classList.toggle('dw-waiter-mode',isWaiter&&serviceReady);root.hidden=!isWaiter||!serviceReady;
    if(isWaiter)renderHome();
    const data=operations();
    const snapshot=JSON.stringify([data.sessions.map(s=>[s.id,s.status,s.session_items]),(data.requests||[]).map(r=>[r.id,r.status,r.message,r.updated_at])]);
    if(snapshot!==lastSnapshot){lastSnapshot=snapshot;void loadOrders(true);}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(busy&&target.closest('#dp-waiter-app,.dw-dialog'))return;
    if(target.dataset.dwTable){openTable(target.dataset.dwTable);return;}
    if(target.hasAttribute('data-dw-home')){selectedTable='';replacingLine='';homeSignature='';renderHome();root.scrollIntoView({block:'start',behavior:'instant'});}
    if(target.hasAttribute('data-dw-tab')){tab=target.dataset.dwTab;$('#dw-menu-view').hidden=tab!=='menu';$('#dw-account-view').hidden=tab!=='account';root.querySelectorAll('[data-dw-tab]').forEach(b=>b.classList.toggle('active',b.dataset.dwTab===tab));renderSelection();if(tab==='account')void loadOrders();}
    if(target.hasAttribute('data-dw-category')){category=target.dataset.dwCategory;renderProducts();}
    if(target.hasAttribute('data-dw-manager-category')){category=target.dataset.dwManagerCategory;renderManagerProducts();}
    if(target.dataset.dwProduct)showProduct(target.dataset.dwProduct,replacingLine);
    if(target.hasAttribute('data-dw-quantity')){const output=$('#dw-product-quantity');output.value=Math.min(99,Math.max(1,Number(output.value)+Number(target.dataset.dwQuantity)));updateProductOptions();}
    if(target.hasAttribute('data-dw-review'))review();
    if(target.dataset.dwEditLine){const line=draft.items.find(item=>item.id===target.dataset.dwEditLine);if(line)showProduct(line.product_id,line.id);}
    if(target.dataset.dwReplaceLine&&!draft.pending&&!busy)void beginCatalogChoice(target.dataset.dwReplaceLine);
    if(target.hasAttribute('data-dw-add-extra')&&!draft.pending&&!busy)void beginCatalogChoice();
    if(target.hasAttribute('data-dw-cancel-replace')){replacingLine='';$('#dw-replace-banner')?.remove();review();}
    if(target.dataset.dwRemoveLine&&!draft.pending&&!busy){draft.items=draft.items.filter(item=>item.id!==target.dataset.dwRemoveLine);persist();renderReview();renderSelection();}
    if(target.id==='dw-send-order')void sendOrder();
    if(target.dataset.dwEditOrder)editOrder(target.dataset.dwEditOrder);
    if(target.dataset.dwOpenComanda)showKitchen(target.dataset.dwOpenComanda);
    if(target.dataset.dwAcceptOrder)void acceptOrder(target.dataset.dwAcceptOrder,target);
    if(target.dataset.dwPrintOrder)printKitchen(target.dataset.dwPrintOrder);
    if(target.dataset.dwRemoveOrder)void removeOrder(target.dataset.dwRemoveOrder);
    if(target.hasAttribute('data-dw-close'))target.closest('dialog')?.close();
    if(target.hasAttribute('data-dw-reload'))void loadCatalog();
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='dw-product-search'){query=event.target.value;renderProducts();}
    if(event.target.id==='dw-manager-search'){query=event.target.value;renderManagerProducts();}
    if(event.target.id==='dw-order-notes'&&draft&&!draft.pending){draft.notes=event.target.value;persist();}
  });
  $('#dw-product-form').onsubmit=addProduct;
  $('#dw-product-form').addEventListener('change',updateProductOptions);
  for(const dialog of document.querySelectorAll('.dw-dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy)dialog.close();});
  $('#dw-review-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('#dw-review-dialog').addEventListener('close',()=>{if(draft?.managerMode&&!draft.pending&&!busy&&!$('#dw-product-dialog').open&&!$('#dw-catalog-dialog').open){draft=null;selectedTable='';}});
  $('#dw-catalog-dialog').addEventListener('close',()=>{if(draft?.managerMode&&!$('#dw-review-dialog').open&&!$('#dw-product-dialog').open){replacingLine='';review();}});
  function tick(){
    if(!allowed()||document.hidden)return;
    const next=api().getToken();if(next!==token){token=next;busy=false;serviceReady=false;orders=[];localWrites.clear();selectedTable='';draft=null;lastSnapshot='';homeSignature='';managerSignature='';catalog=null;sync();if(waiter())void loadCatalog();}
    sync();void loadOrders();
  }
  const editComanda=async(id,removeId='')=>{await loadOrders();editOrder(id);if(removeId&&draft?.id===id&&!draft.pending){draft.items=draft.items.filter(item=>item.id!==removeId);persist();renderReview();renderSelection();}};
  deletions()?.register('waiter-comanda',async(payload,update)=>{
    const currentToken=api().getToken();
    const {data,error}=await rpc('dp_save_waiter_comanda',payload);
    if(error||!data?.comanda||data.comanda.items?.length){
      const result=await rpc('dp_list_waiter_comandas');if(result.error||!Array.isArray(result.data?.orders))throw error||Error('Retiro pendiente.');
      const current=result.data.orders.find(order=>order.id===payload.p_comanda_id);
      if(!current||!current.items.length)return {version:current?.version||payload.p_expected_version+1};
      if(current.version!==payload.p_expected_version)update({p_operation_id:crypto.randomUUID(),p_expected_version:current.version});
      throw error||Error('Retiro pendiente.');
    }
    if(currentToken===api().getToken()){rememberResult(data);api().applyWaiterResult(data);}
    return {version:data.comanda.version};
  });
  window.addEventListener('donpieros-deletions-change',event=>{
    if(event.detail.kind!=='waiter-comanda')return;
    window.DonPierosReception?.dismiss('request:'+event.detail.id);
    managerSignature='';homeSignature='';renderReception();renderAccount();if(waiter())renderHome();
    if(event.detail.state==='done'){void loadOrders(true);void api().refreshOperations();}
  });
  window.DonPierosWaiter={openTable,sync,editComanda,openRequest,isReady:()=>serviceReady};setInterval(tick,3000);window.addEventListener('donpieros-session-change',tick);window.addEventListener('focus',tick);tick();
})();
