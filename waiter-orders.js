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
  const details=()=>window.DonPierosOrderDetails;
  const timeEdits=new Map();
  const observationEdits=new Map();
  const waiter=()=>api()?.getUser()?.role==='waiter';
  const allowed=()=>{const user=api()?.getUser();return user&&(user.role==='boss'||user.role==='waiter'||user.role==='admin'&&(!Array.isArray(user.permissions)||user.permissions.includes('dashboard')||user.permissions.includes('service')));};
  const operations=()=>api()?.getOperations?.()||{tables:[],sessions:[]};
  const tableLabel=table=>table?.table_name||`Mesa ${table?.table_number||''}`;
  const sessionFor=id=>operations().sessions.find(session=>session.table_id===id&&session.status==='open');
  const liveItems=session=>(session?.session_items||[]).filter(item=>item.status!=='cancelled');
  const isBeverageItem=item=>{const product=catalog?.products.find(row=>row.id===item.web_product_id||row.id===item.product_id);return /\bbebidas?\b/.test(normalize(product?.category||''));};
  const newKitchenItems=order=>(order?.items||[]).filter(item=>!isBeverageItem(item));
  const hasOtherTableConsumption=order=>liveItems(sessionFor(order?.table_id)).some(item=>item.waiter_comanda_id!==order?.id);
  const total=rows=>rows.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0);
  const customChoice=()=>'<button type="button" class="dw-button dw-add-more dw-custom-choice" data-dw-custom><strong>＋ Otro producto</strong><small>Escribe el nombre y el precio si no está en la carta.</small></button>';
  let selectedTable='',tab='menu',category='',query='',draft=null,catalog=null,orders=[],busy=false,loading=null,catalogLoading=null;
  let token='',lastSnapshot='',homeSignature='',managerSignature='',managerOpen='',editingLine='',replacingLine='',activeProduct=null,loadError='',catalogError='';
  let writeRevision=0,reloadWanted=false,serviceReady=false;const localWrites=new Map();
  let printWidth=80,directLineEdit=false;
  const kitchenPrintItems=new Map();
  let individualPick=null;
  const individualTable='staff-walk-in';
  let lastIndividual=null;
  let webPick=null;
  // Share the public menu cache with the storefront. Refresh in the background.
  const menuCache=()=>window.DonPierosPerformance;
  const validCatalog=data=>Array.isArray(data?.products)&&Array.isArray(data?.toppings);
  const warmCatalogImages=()=>{for(const product of (catalog?.products||[]).filter(product=>product.available).slice(0,6)){const photo=new Image();photo.src=window.DonPierosImages.resolve(product);}};
  const cachedCatalog=menuCache()?.read('catalog',3*60000,localStorage);
  if(validCatalog(cachedCatalog)){catalog=cachedCatalog;warmCatalogImages();}
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
  function persist(){if(!draft||!selectedTable||draft.legacy)return;try{localStorage.setItem(draftKey(),JSON.stringify(draft));}catch(_){}}
  function newDraft(){draft={id:crypto.randomUUID(),version:0,session_id:sessionFor(selectedTable)?.id||null,items:[],notes:'',pending:null,...(selectedTable===individualTable?{individual:true,customerName:''}:{})};persist();renderSelection();}
  function syncDraftSession(){
    if(!draft||!selectedTable||draft.legacy||draft.version||draft.pending||busy)return;
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
    root.querySelector('.dw-home-head').insertAdjacentHTML('afterend',`<button class="dw-button dw-add-more" type="button" data-dw-individual><strong>＋ Venta individual</strong><small> Toma un pedido sin mesa y envía la comanda a caja.</small></button>${lastIndividual?`<p class="dw-edit-notice" role="status">Comanda ${esc(lastIndividual.orderId)} enviada a caja · ${money(lastIndividual.total)}</p>`:''}`);
  }
  function openStaffIndividual(){
    if(!waiter()||!serviceReady||busy)return;
    selectedTable=individualTable;tab='menu';category='';query='';restoreDraft();homeSignature='';renderTable();void loadCatalog();
    root.scrollIntoView({block:'start',behavior:'instant'});
  }
  function renderTable(){
    const table=selectedTable===individualTable?{table_name:'Venta individual'}:operations().tables.find(t=>t.id===selectedTable);if(!table)return;
    root.innerHTML=`<header class="dw-table-head"><button type="button" class="dw-back" data-dw-home>← Mesas</button><div><span class="eyebrow">Tomando pedido</span><h2>${esc(tableLabel(table))}</h2></div><button type="button" class="dw-account-shortcut" data-dw-tab="account">Ver consumo</button></header><div class="dw-tabs"><button type="button" data-dw-tab="menu" class="${tab==='menu'?'active':''}">Carta</button><button type="button" data-dw-tab="account" class="${tab==='account'?'active':''}">Consumo de la mesa</button></div><div id="dw-menu-view" ${tab==='menu'?'':'hidden'}><label class="dw-search"><span>Buscar un producto</span><input type="search" id="dw-product-search" placeholder="Pizza, bebida, lasaña…" value="${esc(query)}" autocomplete="off"></label><div class="dw-categories" id="dw-categories"></div><div class="dw-product-grid" id="dw-products"></div></div><div id="dw-account-view" ${tab==='account'?'':'hidden'}></div><div class="dw-order-footer" id="dw-selection"></div>`;
    renderProducts();renderAccount();renderSelection();
    if(draft?.individual){root.querySelector('.dw-account-shortcut').hidden=true;root.querySelector('.dw-tabs').hidden=true;}
  }
  function renderProducts(){
    if(!$('#dw-products'))return;
    if(!catalog){$('#dw-products').innerHTML=customChoice()+`<div class="dw-empty">${esc(catalogError||'Preparando la carta…')}${catalogError?'<button type="button" class="dw-button" data-dw-reload>Cargar carta</button>':''}</div>`;return;}
    const categories=[...new Set(catalog.products.filter(p=>p.available).map(p=>p.category||'Menú'))];
    $('#dw-categories').innerHTML=['',...categories].map(name=>`<button type="button" data-dw-category="${esc(name)}" aria-pressed="${name===category}" class="${name===category?'active':''}">${esc(name||'Todo')}</button>`).join('');
    const rows=catalog.products.filter(p=>p.available&&(!category||p.category===category)&&normalize(p.name+' '+p.description).includes(normalize(query)));
    $('#dw-products').innerHTML=customChoice()+(rows.map(p=>`<button type="button" class="dw-product" data-dw-product="${esc(p.id)}"><img src="${esc(window.DonPierosImages.resolve(p))}" alt="" loading="lazy" decoding="async"><div><strong>${esc(p.name)}</strong><small>${esc(p.description||p.category)}</small><span>${p.modifiers?.some(g=>g.usePrice)?'Desde ':''}${money(p.price)} <b aria-hidden="true">＋</b></span></div></button>`).join('')||'<p class="dw-empty">No encontramos ese producto en esta categoría.</p>');
  }
  function renderSelection(){if($('#dw-selection')){$('#dw-selection').innerHTML=footer();$('#dw-selection').hidden=!draft?.items.length&&!draft?.version&&!draft?.pending;}}
  function renderAccountRows(){
    const box=$('#dw-account-view');if(!box)return;
    const session=sessionFor(selectedTable),items=liveItems(session),myOrders=orders.filter(order=>!isRemoved(order)&&order.table_id===selectedTable);
    box.innerHTML=`<div class="dw-account-total"><span>Consumo de la mesa</span><strong>${money(total(items))}</strong><small>${items.reduce((sum,item)=>sum+Number(item.quantity),0)} productos registrados</small></div>${items.length?`<div class="dw-consumption-lines">${items.map(item=>`<article><b>${Number(item.quantity)} ×</b><div><strong>${esc(item.item_name)}</strong>${item.notes?`<p>${esc(item.notes)}</p>`:''}</div><strong>${money(Number(item.quantity)*Number(item.unit_price))}</strong></article>`).join('')}</div>`:'<p class="dw-empty">La mesa aún no tiene consumos.</p>'}<h3>Tus comandas enviadas</h3>${myOrders.map(order=>`<article class="dw-sent-order"><div><strong>${order.items.length?'Pedido enviado':'Pedido retirado'}</strong><small>${esc(window.DonPierosDates.dateTime(order.updated_at))} · ${order.accepted_at?'Agregado al consumo':'Pendiente de aceptar'} · v${order.version}</small></div><p>${esc(order.items.map(item=>`${item.quantity} × ${item.item_name}`).join(', ')||'Todos los productos fueron retirados.')}</p>${order.notes?`<p class="dw-order-notes">${esc(order.notes)}</p>`:''}<button type="button" class="dw-button" data-dw-edit-order="${esc(order.id)}">Editar comanda</button>${order.items.length?` <button class="dw-button dw-remove" type="button" data-dw-remove-order="${esc(order.id)}">Retirar comanda</button>`:''}</article>`).join('')||'<p class="dw-muted">Las comandas que envíes desde esta mesa aparecerán aquí.</p>'}${loadError?`<p class="dw-error">${esc(loadError)}</p>`:''}<button class="dw-button dw-add-more" type="button" data-dw-tab="menu">＋ Agregar productos</button>`;
  }
  function renderAccount(){
    renderAccountRows();markConsumedLines();
    const mine=orders.filter(order=>!isRemoved(order)&&order.table_id===selectedTable);
    $('#dw-account-view')?.querySelectorAll('.dw-sent-order').forEach((row,index)=>{const order=mine[index];if(!order)return;const notes=row.querySelector('.dw-order-notes');if(notes){notes.textContent=details().readTime(order.notes).notes;notes.hidden=!notes.textContent;}details().decorate(row,order.items.length?order.notes:"",order.created_at);});
    const form=$('#consumptionForm'),sessionId=form?.session_id.value;
    $('#tableConsumptionPreview .table-order-notes')?.remove();
    if(sessionId){const notes=getSessionObservations(sessionId);if(notes.length){const box=document.createElement('div');box.className='table-order-notes';for(const note of notes){const p=document.createElement('p');p.textContent='Observaciones de comanda: '+note;box.append(p);}$('#tableConsumptionPreview')?.append(box);}}
  }
  function getSessionObservations(sessionId){return orders.filter(order=>order.session_id===sessionId&&order.items.length&&!isRemoved(order)).map(order=>details().readTime(order.notes).notes).filter(Boolean);}
  function markConsumedLines(){
    const session=sessionFor(selectedTable),items=liveItems(session);
    $('#dw-account-view')?.querySelectorAll('.dw-consumption-lines article').forEach((row,index)=>{row.dataset.tableConsumptionEdit=items[index].id;row.dataset.sessionId=session.id;row.title='Doble clic para editar este producto';});
  }
  async function loadCatalog(){
    if(catalogLoading)return catalogLoading;
    catalogError='';
    catalogLoading=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(window.DON_PIEROS_CONFIG.appsScriptUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'dp_get_catalog'}),signal:controller.signal});
        const data=await response.json();if(!response.ok||!data.ok)throw Error('No pudimos cargar la carta. Intenta de nuevo.');
        if(!validCatalog(data))throw Error('Carta inválida.');
        catalog=data;menuCache()?.write('catalog',data,localStorage);warmCatalogImages();
      }catch(error){catalogError='No pudimos cargar la carta. Toca Cargar carta para reintentar.';}
      finally{clearTimeout(timer);catalogLoading=null;renderProducts();renderManagerProducts();}
    })();return catalogLoading;
  }
  async function loadOrders(force=false){
    if(!allowed())return;
    if(busy){if(force)reloadWanted=true;return;}
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
        orders=[...next.values()].sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)||String(a.id).localeCompare(String(b.id)));loadError='';
        if(readRevision===writeRevision&&draft?.version&&!draft.pending&&!busy&&!data.orders.some(order=>order.id===draft.id))leaveClosedDraft();
        syncDraftSession();renderAccount();renderReception();if(waiter())renderHome();
      }catch(error){loadError=errorText(error);renderAccount();}
      finally{loading=null;if(reloadWanted){reloadWanted=false;void loadOrders();}}
    })();return loading;
  }
  function openTable(id){
    if(!waiter()||!serviceReady||!operations().tables.some(t=>t.id===id&&t.is_active!==false))return;
    selectedTable=id;tab=liveItems(sessionFor(id)).length||orders.some(order=>!isRemoved(order)&&order.table_id===id&&order.items.length)?'account':'menu';category='';query='';restoreDraft();
    homeSignature='';renderTable();root.scrollIntoView({block:'start',behavior:'instant'});void loadOrders();void loadCatalog();
  }
  async function startTableOrder(id){
    if(!allowed())return api()?.notify('No tienes permiso para agregar productos a esta mesa.','error');
    if(waiter()){openTable(id);return;}
    if(busy)return api().notify('Espera a que termine el envío actual.','error');
    if(!operations().tables.some(table=>table.id===id&&table.is_active!==false))return api().notify('Esta mesa ya no está disponible.','error');
    if(draft&&(draft.items.length||draft.pending||draft.version)&&selectedTable&&selectedTable!==id){review();return api().notify('Termina la comanda actual antes de cambiar de mesa.','error');}
    selectedTable=id;restoreDraft();draft.managerMode=true;persist();
    if(draft.items.length||draft.pending||draft.version)review();else void beginCatalogChoice();
    void loadCatalog();
  }
  function showProduct(id,lineId=''){
    if(draft?.pending&&!individualPick&&!webPick)return api().notify('Primero confirma el envío pendiente.','error');
    const existing=webPick?.line||(individualPick||webPick?null:draft.items.find(item=>item.id===lineId)),custom=id==='custom'||!!existing?.options?.custom;
    if(webPick&&custom&&!webPick.item?.custom)return;
    if(!catalog&&!custom){void loadCatalog().then(()=>{if(catalog)showProduct(id,lineId);else api().notify(catalogError,'error');});return;}
    const customExisting=existing?.options?.custom?existing:null;
    const product=custom?{id:customExisting?.product_id||crypto.randomUUID(),name:customExisting?.name||'',price:customExisting?.unit_price??0,category:'Otro producto',modifiers:[],custom:true}:catalog?.products.find(p=>p.id===id);if(!product)return;
    editingLine=lineId;activeProduct=product;
    const ids=existing?.product_id===id?(existing.options?.selectionIds||{}):{};
    $('#dw-product-body').innerHTML=`<header class="dw-dialog-head"><div><span class="eyebrow">${esc(product.category)}</span><h2 id="dw-product-title">${custom?'Otro producto':esc(product.name)}</h2></div><button type="button" class="dw-close" data-dw-close aria-label="Cerrar">×</button></header>${custom?`<label class="dw-custom-field">Nombre del producto<input id="dw-custom-name" type="text" maxlength="160" required value="${esc(product.name)}" placeholder="Ej.: Postre del día"></label><label class="dw-custom-field">Precio por unidad<input id="dw-custom-price" type="number" min="0" max="10000000" step="1" inputmode="numeric" required value="${existing?Number(product.price):''}" placeholder="Valor en pesos"></label>`:''}<div class="dw-product-options">${(product.modifiers||[]).map(group=>{
      const min=group.required?Math.max(1,Number(group.min)||1):0;
      return `<fieldset data-dw-group="${esc(group.id)}" data-min="${min}" data-max="${Number(group.max)||99}"><legend>${esc(group.name)} <small>${min?'Obligatorio':'Opcional'}</small></legend>${catalog.toppings.filter(option=>option.available&&option.kind===group.source).map(option=>`<label><input type="${Number(group.max)===1?'radio':'checkbox'}" name="${esc(group.id)}" value="${esc(option.id)}" ${(ids[group.id]||[]).includes(option.id)?'checked':''}><span>${esc(option.name)}</span><small>${group.usePrice&&Number(option.price)?'+'+money(option.price):'Incluido'}</small></label>`).join('')}</fieldset>`;
    }).join('')}</div><div class="dw-quantity"><span>Cantidad</span><button type="button" data-dw-quantity="-1" aria-label="Disminuir cantidad">−</button><output id="dw-product-quantity">${existing?.quantity||1}</output><button type="button" data-dw-quantity="1" aria-label="Aumentar cantidad">＋</button></div><label class="dw-notes-label">Notas del producto <small>Opcional</small><textarea id="dw-line-notes" maxlength="500" placeholder="Ej.: sin cebolla, salsa aparte…">${esc(existing?.notes||'')}</textarea></label><p id="dw-product-error" class="dw-error" role="alert"></p><button type="submit" class="dw-primary" id="dw-add-product">${existing?'Actualizar producto':'Agregar al pedido'} · <span id="dw-product-price"></span></button>`;
    if(existing&&!custom)$('#dw-product-body .dw-product-options').insertAdjacentHTML('beforebegin',`<label class="dw-custom-field">Nombre del producto<input id="dw-item-name" type="text" maxlength="160" required value="${esc(existing.product_id===id?existing.name||product.name:product.name)}"></label>`);
    const savedPacking=window.DonPierosPackaging.read(existing?.notes);
    if(!custom){
      const catalogPrice=productSelection().unitPrice;
      const basePrice=Number(existing?.unit_price)-savedPacking.fee;
      const override=existing?.product_id===id&&(existing.options?.manualUnitPrice!=null||basePrice!==catalogPrice)?basePrice:'';
      $('#dw-product-body .dw-quantity').insertAdjacentHTML('beforebegin',`<label class="dw-custom-field">Precio por unidad <small>Opcional · déjalo vacío para usar el precio de la carta</small><input id="dw-unit-price" type="number" min="0" max="10000000" step="1" inputmode="numeric" value="${override}" placeholder="${esc(money(catalogPrice))}"></label>`);
    }
    const tableDineInDefault=Boolean(selectedTable&&selectedTable!==individualTable&&!individualPick&&!webPick&&!draft?.individual);
    const savedDelivery=existing?.options?.fulfillment||savedPacking.fulfillment||(tableDineInDefault?'dinein':((individualPick||webPick||draft?.individual)?'':''));
    $('#dw-product-body .dw-quantity').insertAdjacentHTML('beforebegin',`<label class="dw-custom-field dw-fulfillment-field">Entrega <small id="dw-fulfillment-status">Obligatorio</small><select id="dw-fulfillment" required aria-required="true" aria-describedby="dw-fulfillment-status dw-packaging-summary"><option value="">Selecciona la entrega</option><option value="dinein" ${savedDelivery==='dinein'?'selected':''}>Para comer en el local</option><option value="pickup" ${savedDelivery==='pickup'?'selected':''}>Para llevar</option><option value="delivery" ${savedDelivery==='delivery'?'selected':''}>Domicilio</option></select><small id="dw-packaging-summary" aria-live="polite"></small></label>`);
    $('#dw-line-notes').value=savedPacking.notes;
    // Stored prices include the box; the editable price always shows the food.
    if(custom&&savedPacking.fee)$('#dw-custom-price').value=String(Math.max(0,Number(existing.unit_price)-savedPacking.fee));
    if(individualPick)$('#dw-product-dialog').dataset.individualPicker='1';
    if(individualPick||draft?.individual&&!webPick){
      const data=individualPick?api().getIndividualDetails(individualPick.sessionId):{customerName:draft.customerName||'',...details().readTime(draft.notes)};
      if(individualPick){if(data.fulfillment&&(!existing||!savedDelivery))$('#dw-fulfillment').value=data.fulfillment;$('#dw-fulfillment').closest('.dw-fulfillment-field').insertAdjacentHTML('afterend',`<label class="dw-custom-field dw-delivery-address" ${$('#dw-fulfillment').value==='delivery'?'':'hidden'}>Dirección de domicilio <small>Obligatoria</small><textarea id="dw-product-address" maxlength="300" rows="2" placeholder="Dirección y datos para encontrar el domicilio">${esc(data.address||'')}</textarea></label>`);}
      $('#dw-product-body .dw-dialog-head').insertAdjacentHTML('afterend',`<fieldset class="dw-comanda-fields"><legend>Datos de la comanda</legend><label class="dw-custom-field">Nombre del cliente <small>Obligatorio</small><input id="dw-product-customer" type="text" required minlength="2" maxlength="120" placeholder="Cliente individual" value="${esc(data.customerName)}"></label><label class="dw-custom-field">Tiempo estimado <input id="dw-product-time" type="text" maxlength="80" placeholder="Ej.: 25 minutos" value="${esc(data.time)}"><small>Puedes asignar o cambiar el tiempo antes del cobro.</small></label><label class="dw-custom-field dw-comanda-observations">Observaciones de la comanda <textarea id="dw-product-observations" maxlength="500" rows="2" placeholder="Indicaciones para este pedido…">${esc(data.notes)}</textarea></label></fieldset>`);
      if(individualPick){
        const add=$('#dw-add-product'),actions=document.createElement('div');actions.className='dw-individual-actions';
        add.before(actions);actions.append(add);add.childNodes[0].textContent='Agregar otro producto · ';
        actions.insertAdjacentHTML('beforeend','<button type="submit" class="dw-send-print" id="dw-send-print">▤ Enviar e imprimir comanda</button>');
      }
    }
    if(webPick){$('#dw-product-dialog').dataset.webPicker='1';if(!existing)$('#dw-fulfillment').value=webPick.fulfillment||'pickup';}
    if($('#dw-fulfillment').value){$('#dw-fulfillment').closest('label').classList.add('is-complete');$('#dw-fulfillment-status').textContent='Seleccionado';}
    updateProductOptions();$('#dw-product-dialog').showModal();$('#dw-product-dialog').scrollTop=0;
  }
  function guideDelivery(){
    const select=$('#dw-fulfillment'),field=select?.closest('.dw-fulfillment-field');if(!select||!field)return;
    select.setAttribute('aria-invalid','true');field.classList.remove('dw-required-flash');void field.offsetWidth;field.classList.add('is-invalid','dw-required-flash');
    select.scrollIntoView({block:'center',behavior:'smooth'});select.focus({preventScroll:true});
    $('#dw-product-error').textContent='Selecciona la entrega: para comer en el local, para llevar o domicilio.';
  }
  const lineDelivery=line=>line.options?.fulfillment||window.DonPierosPackaging.read(line.notes).fulfillment;
  function productSelection(validate=false){
    let unitPrice=Number(activeProduct.price),valid=true;const selectionIds={},labels=[];
    if(activeProduct.custom){const price=$('#dw-custom-price').value;unitPrice=Number(price);valid=!!$('#dw-custom-name').value.trim()&&price!==''&&Number.isSafeInteger(unitPrice)&&unitPrice>=0&&unitPrice<=10000000;}
    for(const group of activeProduct.modifiers||[]){
      const field=[...$('#dw-product-body').querySelectorAll('[data-dw-group]')].find(f=>f.dataset.dwGroup===group.id);
      const ids=[...field.querySelectorAll('input:checked')].map(input=>input.value);selectionIds[group.id]=ids;
      const complete=ids.length>=Number(field.dataset.min)&&ids.length<=Number(field.dataset.max);
      field.classList.toggle('is-complete',complete&&ids.length>0);if(validate)field.classList.toggle('is-invalid',!complete);
      if(complete)field.classList.remove('is-invalid');if(!complete)valid=false;
      for(const id of ids){const option=catalog.toppings.find(t=>t.id===id);if(!option){valid=false;continue;}if(group.usePrice)unitPrice+=Number(option.price)||0;
        labels.push(group.name.replace(/^elige\s+(?:el\s+)?tamaño/i,'Tamaño')+': '+option.name);}
    }
    const catalogUnitPrice=unitPrice,manual=$('#dw-unit-price')?.value.trim()??'';
    if(manual!==''){unitPrice=Number(manual);valid=valid&&Number.isSafeInteger(unitPrice)&&unitPrice>=0&&unitPrice<=10000000;}
    const fulfillment=$('#dw-fulfillment')?.value,takeaway=['pickup','delivery'].includes(fulfillment);
    const box=window.DonPierosPackaging.forProduct(activeProduct.custom?{...activeProduct,name:$('#dw-custom-name').value}:activeProduct,labels);
    const packagingFee=takeaway?box.fee:0;
    if(takeaway)labels.push(fulfillment==='delivery'?'Domicilio':'Para llevar');
    return {valid,unitPrice:unitPrice+packagingFee,catalogUnitPrice,box:takeaway?box:{size:'',fee:0},takeaway,options:{selectionIds,labels,fulfillment:$('#dw-fulfillment')?.value||'',...(activeProduct.custom?{custom:true}:{}),...(manual!==''?{manualUnitPrice:unitPrice}:{})}};
  }
  function updateProductOptions(){if(!activeProduct)return;const selection=productSelection(),quantity=Number($('#dw-product-quantity').value),price=selection.unitPrice*quantity;if($('#dw-unit-price'))$('#dw-unit-price').placeholder=money(selection.catalogUnitPrice);$('#dw-product-price').textContent=money(price);const summary=$('#dw-packaging-summary');if(summary)summary.textContent=!$('#dw-fulfillment')?.value?'Selecciona la entrega para calcular la caja.':selection.box.fee?`Valor Caja ${window.DonPierosPackaging.sizes[selection.box.size]}: $${selection.box.fee.toLocaleString('es-CO')}`:selection.takeaway?'Sin cobro de caja para este producto.':'Sin cobro de caja.';}
  function addProduct(event){
    event.preventDefault();if(busy||!individualPick&&!webPick&&(!draft||draft.pending))return;
    if(!['dinein','pickup','delivery'].includes($('#dw-fulfillment')?.value)){guideDelivery();return;}
    const selection=productSelection(true);
    if($('#dw-item-name')&&!$('#dw-item-name').value.trim()){$('#dw-item-name').setCustomValidity('Escribe el nombre del producto.');$('#dw-item-name').reportValidity();return;}
    if(!selection.valid){$('#dw-product-error').textContent=activeProduct.custom?'Escribe el nombre y un precio válido en pesos.':'Elige las opciones obligatorias para continuar.';$('#dw-product-body .is-invalid')?.scrollIntoView({block:'center',behavior:'smooth'});return;}
    if(individualPick&&$('#dw-fulfillment').value==='delivery'&&!$('#dw-product-address').value.trim()){ $('#dw-product-address').setCustomValidity('Escribe la dirección del domicilio.');$('#dw-product-address').reportValidity();return; }
    const line={id:editingLine||crypto.randomUUID(),product_id:activeProduct.id,name:$('#dw-item-name')?$('#dw-item-name').value.trim():activeProduct.custom?$('#dw-custom-name').value.trim():activeProduct.name,quantity:Number($('#dw-product-quantity').value),unit_price:selection.unitPrice,options:selection.options,notes:window.DonPierosPackaging.note($('#dw-line-notes').value.trim(),selection.box.size,selection.options.fulfillment)};
    if([...(line.options.labels||[]),line.notes].join(' · ').length>500){$('#dw-product-error').textContent='Acorta un poco las notas de este producto.';return;}
    if(webPick){void saveWebProduct(line);return;}
    if(individualPick){
      try{
        const sessionId=individualPick.sessionId;saveIndividualProductDetails(sessionId);api().addIndividualProduct(sessionId,line);
        if(event.submitter?.id==='dw-send-print'){
          // Abrir desde el clic mantiene la impresión habilitada en móviles.
          const popup=window.open('','_blank','width=420,height=720');
          if(!popup){api().notify('Permite ventanas emergentes para imprimir. El producto quedó agregado.','error');$('#dw-product-dialog').close();return;}
          void sendIndividualAndPrint(sessionId,popup,$('#dw-send-print'));
        }else{$('#dw-product-dialog').close();api().notify('Producto agregado al pedido.');}
      }
      catch(error){$('#dw-product-error').textContent=errorText(error);}
      return;
    }
    if(draft.legacy){void saveLegacyLine(line);return;}
    if(editingLine)draft.items=draft.items.map(item=>item.id===editingLine?line:item);else draft.items.push(line);
    if(directLineEdit){directLineEdit=false;persist();$('#dw-product-dialog').close();renderReview();void sendOrder({finishQuietly:true});return;}
    persist();$('#dw-product-dialog').close();renderSelection();if($('#dw-review-dialog').open)renderReview();
    if(replacingLine||draft.managerMode&&$('#dw-catalog-dialog').open){replacingLine='';$('#dw-replace-banner')?.remove();$('#dw-catalog-dialog').close();review();}
    api().notify(editingLine?'Producto actualizado.':'Producto agregado al pedido.');
  }
  function saveIndividualProductDetails(sessionId){
    if(!individualPick||individualPick.sessionId!==sessionId)return;
    const saved=api().getIndividualDetails(sessionId);
    api().updateIndividualDetails(sessionId,{customerName:$('#dw-product-customer')?.value??saved.customerName,address:$('#dw-product-address')?.value??saved.address,fulfillment:$('#dw-fulfillment')?.value??saved.fulfillment,time:$('#dw-product-time')?.value??saved.time,notes:$('#dw-product-observations')?.value??saved.notes});
  }
  function sendIndividualAndPrint(sessionId,popup,button){
    if(!sessionId||busy){popup?.close();return;}
    if(button)button.disabled=true;
    popup.document.body.textContent='Preparando comanda…';busy=true;
    void api().finishIndividualSale(sessionId,popup).then(sent=>{
      if(sent){$('#dw-product-dialog').close();$('#dw-catalog-dialog').close();api().notify('Comanda enviada. Lista para imprimir.');}
    }).catch(error=>{api().notify(errorText(error),'error');if(!popup.closed)popup.close();})
      .finally(()=>{busy=false;if(button?.isConnected)button.disabled=false;});
  }
  async function saveWebProduct(line){
    const pick=webPick,controls=[...$('#dw-product-form').querySelectorAll('button,input,select,textarea')];
    const disabled=controls.map(control=>control.disabled);busy=true;controls.forEach(control=>control.disabled=true);let saved=false;
    try{await pick.onAdd(line);saved=true;}
    catch(error){$('#dw-product-error').textContent=errorText(error);}
    finally{busy=false;controls.forEach((control,index)=>control.disabled=disabled[index]);}
    if(saved&&webPick===pick){$('#dw-product-dialog').close();$('#dw-catalog-dialog').close();}
  }
  function review(){if(!draft||!draft.items.length&&!draft.version&&!draft.pending)return;renderReview();if(!$('#dw-review-dialog').open)$('#dw-review-dialog').showModal();}
  function renderReview(){
    const locked=busy||!!draft.pending;
    $('#dw-review-body').innerHTML=`<header class="dw-dialog-head"><div><span class="eyebrow">${esc(tableLabel(operations().tables.find(t=>t.id===selectedTable)))}</span><h2 id="dw-review-title">${draft.version?'Editar comanda':'Revisar pedido'}</h2></div><button type="button" class="dw-close" data-dw-close aria-label="Cerrar">×</button></header>${draft.version?'<p class="dw-edit-notice">Los cambios actualizarán la misma comanda. No se enviará otra solicitud.</p>':''}<div class="dw-review-lines">${draft.items.map(item=>`<article><div><strong>${item.quantity} × ${esc(item.name)}</strong>${window.DonPierosOrderLabels.compact(item.options.labels).map(label=>`<p>${esc(label)}</p>`).join('')}${item.notes?`<p class="dw-order-notes">${esc(item.notes)}</p>`:''}<small>${money(item.unit_price*item.quantity)}</small></div><div class="dw-line-actions"><button type="button" data-dw-edit-line="${esc(item.id)}" ${locked?'disabled':''}>Editar</button><button type="button" data-dw-replace-line="${esc(item.id)}" ${locked?'disabled':''}>Cambiar</button><button type="button" data-dw-remove-line="${esc(item.id)}" ${locked?'disabled':''}>Quitar</button></div></article>`).join('')||'<p class="dw-empty">Se retirarán todos los productos de esta comanda.</p>'}</div><label class="dw-notes-label">Notas para cocina <small>Opcional</small><textarea id="dw-order-notes" maxlength="500" placeholder="Indicaciones generales para este pedido…" ${locked?'disabled':''}>${esc(draft.notes)}</textarea></label><div class="dw-review-total"><span>Total de esta comanda</span><strong>${money(total(draft.items))}</strong></div><p id="dw-send-error" class="dw-error" role="alert">${draft.pending&&!busy?'Hay un envío pendiente de confirmar. Reintenta para comprobarlo sin duplicarlo.':''}</p><button class="dw-primary" type="button" id="dw-send-order" ${busy?'disabled':''}>${busy?'Guardando…':draft.pending?'Confirmar envío pendiente':draft.version?'Guardar cambios':'Enviar comanda'}</button>`;
    const info=details().readTime(draft.notes);
    if(draft.individual){
      $('#dw-review-body .eyebrow').textContent='Venta individual · enviar a caja';
      $('#dw-review-body .dw-review-lines').insertAdjacentHTML('beforebegin',`<label class="dw-custom-field dw-customer-field">Nombre del cliente <small id="dw-customer-status">Obligatorio</small><input id="dw-individual-customer" type="text" required aria-required="true" aria-describedby="dw-customer-status" minlength="2" maxlength="80" placeholder="Cliente individual" value="${esc(draft.customerName||'')}" ${locked?'disabled':''}></label>`);
    }
    $('#dw-order-notes').value=info.notes;
    $('#dw-order-notes').closest('label').insertAdjacentHTML('beforebegin',`<label class="dw-custom-field">Tiempo estimado <small>Opcional</small><input id="dw-estimated-time" type="text" maxlength="80" placeholder="Ej.: 25 minutos" value="${esc(info.time)}" ${locked?'disabled':''}></label>`);
    const add=document.createElement('button');add.type='button';add.className='dw-button dw-add-more';add.setAttribute('data-dw-add-extra','');add.textContent='＋ Agregar otro producto';add.disabled=locked;
    $('#dw-review-body .dw-review-lines').after(add);
    $('#dw-review-body [data-dw-close]').disabled=busy;
    $('#dw-send-order').disabled=busy||(!draft.items.length&&!draft.version);
    $('#dw-review-body .dw-review-lines').querySelectorAll('article').forEach((row,index)=>{
      row.dataset.dwLine=draft.items[index].id;
      const price=row.querySelector('small');price.dataset.dwPrice=draft.items[index].id;price.tabIndex=0;price.title='Doble clic para editar el precio unitario';
    });
  }
  function editLinePrice(element){
    if(!draft||draft.pending||busy||element.querySelector('input'))return;
    const line=draft.items.find(item=>item.id===element.dataset.dwPrice);if(!line)return;
    const input=document.createElement('input');input.className='dw-inline-price';input.type='number';input.min='0';input.max='10000000';input.step='1';input.inputMode='numeric';input.value=String(line.unit_price);input.setAttribute('aria-label','Precio unitario de '+line.name);
    let finished=false;
    const save=()=>{if(finished)return;const price=Number(input.value);if(input.value===''||!Number.isSafeInteger(price)||price<0||price>10000000){input.setCustomValidity('Escribe un precio válido en pesos.');input.reportValidity();return;}finished=true;line.unit_price=price;if(!line.options.custom)line.options.manualUnitPrice=price-window.DonPierosPackaging.read(line.notes).fee;persist();renderReview();renderSelection();};
    input.addEventListener('input',()=>input.setCustomValidity(''));
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();save();}if(event.key==='Escape'){event.preventDefault();finished=true;renderReview();}});
    input.addEventListener('blur',save);element.replaceChildren(input);input.focus();input.select();
  }
  async function saveLegacyLine(line){
    const target=draft.legacy,button=$('#dw-add-product');busy=true;button.disabled=true;button.textContent='Guardando…';
    try{
      const result=await api().saveLegacyTableLine(target.sessionId,target.itemId,line);
      if(!result)throw Error('No pudimos guardar el cambio. Revisa la cuenta e intenta de nuevo.');
      directLineEdit=false;$('#dw-product-dialog').close();
      if(waiter()){newDraft();tab='account';renderTable();}else{draft=null;selectedTable='';}api().notify('Producto actualizado.');
    }catch(error){$('#dw-product-error').textContent=errorText(error);button.disabled=false;button.textContent='Guardar cambios';}
    finally{busy=false;}
  }
  async function editConsumptionLine(sessionId,itemId){
    if(api().editTableConsumption){api().editTableConsumption(sessionId,itemId);return;}
    const session=operations().sessions.find(row=>row.id===sessionId),item=session?.session_items?.find(row=>row.id===itemId&&row.status!=='cancelled');if(!allowed()||!session||!item||busy)return;
    if(item.waiter_comanda_id){
      if(!orders.some(order=>order.id===item.waiter_comanda_id))await loadOrders();
      if(!orders.some(order=>order.id===item.waiter_comanda_id))return api().notify('No puedes editar esta comanda o su cuenta ya terminó. Actualiza el consumo.','error');
      editOrder(item.waiter_comanda_id,item.id);return;
    }
    if(draft?.pending||draft?.items.length){review();return api().notify('Termina la selección actual antes de editar otro consumo.','error');}
    selectedTable=session.table_id;draft={items:[{id:item.id,product_id:crypto.randomUUID(),name:item.item_name,quantity:Number(item.quantity),unit_price:Number(item.unit_price),notes:item.notes||'',options:{custom:true,labels:[],selectionIds:{}}}],legacy:{sessionId,itemId}};
    showProduct('custom',item.id);
  }
  async function updateConsumedLine(sessionId,itemId,changes){
    if(!allowed()||busy)throw Error('Espera a que termine el cambio actual antes de guardar.');
    const session=operations().sessions.find(row=>row.id===sessionId&&row.status==='open');
    const consumed=session?.session_items?.find(row=>row.id===itemId&&row.status!=='cancelled');
    if(!consumed?.waiter_comanda_id)throw Error('Este consumo ya no está disponible. Actualiza la cuenta.');
    if(!orders.some(order=>order.id===consumed.waiter_comanda_id))await loadOrders();
    const order=orders.find(row=>row.id===consumed.waiter_comanda_id);
    if(!order||!order.items.some(item=>item.id===itemId))throw Error('No puedes editar esta comanda o la cuenta ya terminó.');
    const items=order.items.map(item=>({id:item.id,product_id:item.web_product_id,name:item.item_name,quantity:Number(item.quantity),unit_price:Number(item.unit_price),options:clone(item.waiter_options||{labels:[],selectionIds:{}}),notes:item.waiter_line_notes||''}));
    const edited=items.find(item=>item.id===itemId);
    Object.assign(edited,{name:changes.name,quantity:changes.quantity,unit_price:changes.unitPrice,notes:changes.notes});
    edited.options.manualUnitPrice=changes.unitPrice-window.DonPierosPackaging.read(changes.notes).fee;
    edited.options.fulfillment=window.DonPierosPackaging.read(changes.notes).fulfillment;
    edited.options.labels=(edited.options.labels||[]).filter(label=>!['Para llevar','Domicilio'].includes(label));
    if(edited.options.fulfillment!=='dinein')edited.options.labels.push(edited.options.fulfillment==='delivery'?'Domicilio':'Para llevar');
    const currentToken=api().getToken();
    const {data,error}=await rpc('dp_save_waiter_comanda',{p_operation_id:crypto.randomUUID(),p_comanda_id:order.id,p_table_id:order.table_id,p_session_id:sessionId,p_expected_version:order.version,p_items:items,p_notes:order.notes||''});
    if(error||!data?.comanda){void loadOrders(true);throw Error(errorText(error||Error('No pudimos confirmar el cambio. Intenta de nuevo.')));}
    if(currentToken!==api().getToken())throw Error('La sesión cambió. Vuelve a abrir la cuenta.');
    rememberResult(data);api().applyWaiterResult(data);renderAccount();void loadOrders();
    return data.session.session_items.find(item=>item.id===itemId);
  }
  function rememberResult(data){
    const previous=orders.find(order=>order.id===data.comanda.id)||{};
    const order={...previous,...data.comanda,table:operations().tables.find(t=>t.id===data.comanda.table_id)||previous.table,
      waiter_name:data.comanda.waiter_name||previous.waiter_name||api().getUser().full_name,request_status:data.request?.status,
      items:(data.comanda.items||[]).map(item=>({id:item.id,web_product_id:item.product_id,item_name:item.name,quantity:item.quantity,unit_price:item.unit_price,waiter_options:item.options,waiter_line_notes:item.notes}))};
    localWrites.set(order.id,{revision:++writeRevision,order});orders=[order,...orders.filter(row=>row.id!==order.id)];managerSignature='';
  }
  async function sendOrder({finishQuietly=false}={}){
    if(busy||!draft||(!draft.items.length&&!draft.version))return;
    const missingDelivery=!draft.pending&&draft.items.find(line=>!['dinein','pickup','delivery'].includes(lineDelivery(line)));
    if(missingDelivery){showProduct(missingDelivery.product_id,missingDelivery.id);guideDelivery();return;}
    if(draft.individual)return sendIndividualOrder();
    const sendingDraft=draft,currentToken=api().getToken();
    syncDraftSession();
    if(!draft.pending){draft.notes=details().withTime(details().withTime($('#dw-order-notes').value.trim(),details().readTime(draft.notes).time,details().readTime(draft.notes).startedAt),$('#dw-estimated-time').value);if(draft.notes.length>500){$('#dw-send-error').textContent='Acorta las observaciones para guardar también el tiempo estimado.';return;}draft.pending={p_operation_id:crypto.randomUUID(),p_comanda_id:draft.id,p_table_id:selectedTable,p_session_id:draft.session_id,p_expected_version:draft.version,p_items:clone(draft.items),p_notes:draft.notes};persist();}
    busy=true;renderReview();
    try{
      const {data,error}=await rpc('dp_save_waiter_comanda',draft.pending);if(error)throw error;if(!data?.comanda)throw Error('No pudimos confirmar el envío.');
      if(currentToken!==api().getToken()||draft!==sendingDraft)return;
      const wasEdit=draft.version>0,previousOrder=orders.find(order=>order.id===draft.id),previousLineIds=new Set((previousOrder?.items||[]).map(item=>item.id));
      const addedLineIds=new Set(draft.items.filter(item=>!previousLineIds.has(item.id)).map(item=>item.id));
      const hadTableConsumption=liveItems(sessionFor(selectedTable)).length>0;
      const managerMode=!!draft.managerMode,orderId=draft.id;let beveragesOnlyAddition=false,additionReadyToPrint=false;
      if(!data.closed)rememberResult(data);
      else{
        orders=orders.filter(order=>order.session_id!==data.session?.id);
        for(const [id,write] of localWrites)if(write.order.session_id===data.session?.id)localWrites.delete(id);
        void api().refreshOperations();
      }
      if(!data.closed)api().applyWaiterResult(data);
      try{localStorage.removeItem(draftKey());}catch(_){}
      busy=false;$('#dw-review-dialog').close();
      const savedOrder=orders.find(order=>order.id===orderId),addedItems=(savedOrder?.items||[]).filter(item=>addedLineIds.has(item.id));
      const additionToOccupiedTable=hadTableConsumption&&data.comanda.accepted_at&&addedItems.length>0;
      const printItems=additionToOccupiedTable?newKitchenItems({...savedOrder,items:addedItems}):[];
      if(managerMode){draft=null;selectedTable='';if(!data.closed&&!finishQuietly){
          if(additionToOccupiedTable&&printItems.length){additionReadyToPrint=true;kitchenPrintItems.set(orderId,printItems);showKitchen(orderId);}
          else if(additionToOccupiedTable){beveragesOnlyAddition=true;finishTableOrderFlow();}
          else showKitchen(orderId);
        }void loadOrders();}
      else{draft=null;activeProduct=null;editingLine='';replacingLine='';if(!data.closed&&!finishQuietly){
          if(additionToOccupiedTable&&printItems.length){additionReadyToPrint=true;kitchenPrintItems.set(orderId,printItems);showKitchen(orderId);}
          else if(additionToOccupiedTable){beveragesOnlyAddition=true;newDraft();tab='account';renderTable();}
          else showKitchen(orderId);
        }else{newDraft();tab='account';renderTable();}void loadOrders();}
      api().notify(additionReadyToPrint?'Productos agregados al consumo de la mesa. Comanda lista para imprimir.':beveragesOnlyAddition?'Bebidas agregadas al consumo de la mesa.':data.closed?'El pedido ya estaba guardado y la cuenta se cerró.':wasEdit?'Comanda actualizada.':'Comanda enviada al equipo.');
    }catch(error){
      if(currentToken!==api().getToken()||draft!==sendingDraft)return;
      busy=false;
      if(draft.version&&error?.code==='P0001'&&/cuenta ya se cerró/i.test(error.message||'')){leaveClosedDraft();return;}
      if(['P0001','PGRST202','42883','42P01','22P02','23514'].includes(error?.code)){draft.pending=null;persist();}
      review();$('#dw-send-error').textContent=errorText(error);void loadOrders();void api().refreshOperations();
    }
  }
  async function sendIndividualOrder(){
    const sendingDraft=draft,currentToken=api().getToken();
    if(!draft.pending){
      const info=details().readTime(draft.notes);
      draft.notes=details().withTime(details().withTime($('#dw-order-notes').value.trim(),info.time,info.startedAt),$('#dw-estimated-time').value);
      draft.customerName=$('#dw-individual-customer').value.trim();
      if(draft.customerName.length<2){
        const input=$('#dw-individual-customer'),field=input.closest('label');input.setAttribute('aria-invalid','true');field.classList.remove('dw-required-flash');void field.offsetWidth;field.classList.add('is-invalid','dw-required-flash');
        input.scrollIntoView({block:'center',behavior:'smooth'});input.focus({preventScroll:true});$('#dw-send-error').textContent='Escribe el nombre del cliente (mínimo 2 caracteres).';return;
      }
      draft.pending={requestId:draft.id,customerName:draft.customerName,notes:draft.notes,items:draft.items.map(line=>{
        const packing=window.DonPierosPackaging.read(line.notes);
        return {productId:line.product_id,name:line.name,quantity:line.quantity,unitPrice:line.unit_price-packing.fee,
          selectionIds:clone(line.options.selectionIds||{}),manualUnitPrice:line.options.manualUnitPrice,
          custom:!!line.options.custom,notes:packing.notes,takeaway:packing.fulfillment!=='dinein',fulfillment:packing.fulfillment,packagingSize:window.DonPierosPackaging.sizes[packing.size]||''};
      })};persist();
    }
    busy=true;renderReview();
    try{
      const result=await api().createStaffOrder(draft.pending);
      if(currentToken!==api().getToken()||draft!==sendingDraft)return;
      if(!result?.orderId)throw Error('No pudimos confirmar el envío.');
      lastIndividual=result;try{localStorage.removeItem(draftKey());}catch(_){}draft=null;selectedTable='';busy=false;
      $('#dw-review-dialog').close();homeSignature='';renderHome();
      api().notify('Venta individual enviada a caja. Comanda '+result.orderId);
    }catch(error){
      if(currentToken!==api().getToken()||draft!==sendingDraft)return;
      busy=false;if(error.retryable===false){draft.pending=null;persist();}
      renderReview();$('#dw-send-error').textContent=errorText(error);
    }
  }
  function editOrder(id,focusLine=''){
    const order=orders.find(row=>row.id===id);if(!order||!allowed())return;
    if(draft?.pending){review();return;}
    if(draft?.items.length&&draft.id!==id){api().notify('Envía o termina tu selección actual antes de editar otra comanda.','error');review();return;}
    selectedTable=order.table_id;
    draft={id:order.id,version:order.version,session_id:order.session_id,notes:order.notes,items:order.items.map(item=>({id:item.id,product_id:item.web_product_id,name:item.item_name,quantity:Number(item.quantity),unit_price:Number(item.unit_price),options:item.waiter_options||{selectionIds:{},labels:[]},notes:item.waiter_line_notes||''})),pending:null,managerMode:!waiter()};
    $('#dw-kitchen-dialog').close();if(!catalog)void loadCatalog();
    persist();renderSelection();directLineEdit=!!focusLine;
    const line=draft.items.find(item=>item.id===focusLine);
    if(line)showProduct(line.product_id,line.id);else review();
  }
  function renderReception(){
    if(waiter()||!allowed()){reception.hidden=true;return;}reception.hidden=false;
    const board=window.DonPierosReceptionBoard;
    const visible=orders.filter(order=>order.items.length&&!isRemoved(order)&&(!board||board.matches('table',order)));
    if(board)visible.sort(board.compare);
    const signature=JSON.stringify(visible);if(signature===managerSignature)return;managerSignature=signature;
    reception.innerHTML=`<div class="section-head"><h3>Comandas de mesas <span class="dp-count">${visible.length}</span></h3></div>${visible.length?visible.map(order=>`<button type="button" class="dw-received-card" data-dw-open-comanda="${esc(order.id)}"><span><strong>${esc(tableLabel(order.table))}</strong><small>${esc(order.waiter_name)} · ${esc(window.DonPierosDates.dateTime(order.updated_at))}</small></span><b>${order.items.length?money(order.items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0)):'Retirada'}</b><p>${esc(order.items.map(item=>`${item.quantity} × ${item.item_name}`).join(', '))}</p><span class="dw-received-status">${!order.items.length?'Retirada':!order.accepted_at?'Pendiente de aceptar':order.version>1?'Aceptada · Actualizada':'Aceptada'} <em>Ver comanda →</em></span></button>`).join(''):'<p class="dw-muted">Los pedidos tomados por meseros aparecerán aquí.</p>'}`;
    reception.querySelectorAll('[data-dw-open-comanda]').forEach(row=>{const order=orders.find(order=>order.id===row.dataset.dwOpenComanda);if(order)details().decorate(row,order.notes,order.created_at);});
    if(managerOpen&&$('#dw-kitchen-dialog').open)showKitchen(managerOpen);
  }
  function showKitchen(id){
    const order=orders.find(row=>row.id===id);if(!order||isRemoved(order))return;managerOpen=id;
    const printItems=kitchenPrintItems.get(id),visibleOrder=printItems?{...order,items:printItems}:order;
    $('#dw-kitchen-body').innerHTML=`<header class="dw-dialog-head"><div><span class="eyebrow">${printItems?'Productos agregados al consumo':'Comanda de mesa · v'+order.version}</span><h2 id="dw-kitchen-title">${esc(tableLabel(order.table))}</h2><p>${esc(order.waiter_name)} · ${esc(window.DonPierosDates.dateTime(order.updated_at))}</p></div><button class="dw-close" type="button" data-dw-close aria-label="Cerrar">×</button></header><div class="dw-review-lines">${visibleOrder.items.map(item=>`<article><b class="dw-kitchen-qty">${item.quantity} ×</b><div><strong>${esc(item.item_name)}</strong>${window.DonPierosOrderLabels.compact(item.waiter_options?.labels||[]).map(label=>`<p>${esc(label)}</p>`).join('')}${item.waiter_line_notes?`<p class="dw-order-notes">${esc(item.waiter_line_notes)}</p>`:''}</div></article>`).join('')||'<p class="dw-empty">El mesero retiró los productos de esta comanda.</p>'}</div>${!printItems&&order.notes?`<div class="dw-kitchen-notes"><strong>Indicaciones para cocina</strong><p>${esc(order.notes)}</p></div>`:''}<div class="dw-review-total"><span>${printItems?'Total de productos nuevos':'Total de la comanda'}</span><strong>${money(visibleOrder.items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0))}</strong></div>${printItems?'':'<p class="dw-muted">Esta vista se actualiza cuando el mesero guarda una corrección.</p>'}`;
    $('#dw-kitchen-body').insertAdjacentHTML('beforeend',`<p class="dw-edit-notice">${printItems?'Consumo agregado a la mesa. Imprime esta comanda para cocina.':order.accepted_at?'Aceptada: los productos ya están en el consumo de la mesa.':'Pendiente de aceptar: estos productos todavía no se han agregado al consumo.'}</p><div class="dw-kitchen-actions">${!printItems&&!waiter()&&!order.accepted_at&&order.items.length?`<button class="dw-primary" type="button" data-dw-accept-order="${esc(order.id)}">Agregar a la mesa</button>`:''}<label class="dw-paper">Papel<select id="dw-print-width"><option value="80">80 mm</option><option value="58">58 mm</option></select></label><button class="dw-button dw-print" type="button" data-dw-print-order="${esc(order.id)}">&#9636; Imprimir comanda</button>${printItems?'':`<button class="dw-button" type="button" data-dw-edit-order="${esc(order.id)}">Editar comanda</button>${order.items.length?`<button class="dw-button dw-remove" type="button" data-dw-remove-order="${esc(order.id)}">Retirar comanda</button>`:''}`}</div><p id="dw-kitchen-error" class="dw-error" role="alert"></p>`);
    $('#dw-print-width').value=String(printWidth);
    const info=details().readTime(order.notes),notes=$('#dw-kitchen-body .dw-kitchen-notes');
    if(notes){notes.querySelector('p').textContent=info.notes;notes.hidden=!info.notes;$('#dw-kitchen-body .dw-review-lines').before(notes);}
    if(!printItems){$('#dw-kitchen-body .dw-dialog-head').insertAdjacentHTML('afterend',`<form class="order-time-form" id="dw-time-form"><label>Tiempo estimado<input id="dw-time-value" type="text" maxlength="80" placeholder="Ej.: 25 minutos" value="${esc(timeEdits.get(id)??info.time)}"></label><label class="order-observations-field">Observaciones<textarea id="dw-time-observations" maxlength="500" rows="2" placeholder="Indicaciones para este pedido…">${esc(observationEdits.get(id)??info.notes)}</textarea></label><button type="submit" class="dw-button">Guardar tiempo y observaciones</button></form>`);
      $('#dw-time-value').oninput=event=>timeEdits.set(id,event.target.value);
      $('#dw-time-observations').oninput=event=>observationEdits.set(id,event.target.value);
      $('#dw-time-form').onsubmit=event=>{event.preventDefault();void saveKitchenTime(id);};}
    window.DonPierosReception?.dismiss('request:'+id);
    if(!$('#dw-kitchen-dialog').open)$('#dw-kitchen-dialog').showModal();
  }
  async function saveKitchenTime(id){
    const order=orders.find(row=>row.id===id);if(!order||busy)return;
    const old=details().readTime(order.notes),notes=details().withTime(details().withTime($('#dw-time-observations').value.trim(),old.time,old.startedAt),$('#dw-time-value').value);
    if(notes.length>500){$('#dw-kitchen-error').textContent='Acorta las observaciones para guardar también el tiempo estimado.';return;}
    const token=api().getToken();busy=true;$('#dw-time-form button').disabled=true;
    try{
      const {data,error}=await rpc('dp_save_waiter_comanda',{p_operation_id:crypto.randomUUID(),p_comanda_id:id,p_table_id:order.table_id,p_session_id:order.session_id,p_expected_version:order.version,p_items:order.items.map(item=>({id:item.id,product_id:item.web_product_id,name:item.item_name,quantity:Number(item.quantity),unit_price:Number(item.unit_price),options:item.waiter_options||{},notes:item.waiter_line_notes||''})),p_notes:notes});
      if(error||!data?.comanda)throw error||Error('No pudimos confirmar el tiempo.');if(token!==api().getToken())return;
      timeEdits.delete(id);observationEdits.delete(id);rememberResult(data);api().applyWaiterResult(data);renderReception();renderAccount();api().notify('Tiempo y observaciones guardados.');
    }catch(error){$('#dw-kitchen-error').textContent=errorText(error);}
    finally{busy=false;const button=$('#dw-time-form button');if(button)button.disabled=false;}
  }
  async function acceptOrder(id,button){
    const order=orders.find(row=>row.id===id);if(!order||isRemoved(order))return;const hadTableConsumption=hasOtherTableConsumption(order),currentToken=api().getToken();button.disabled=true;button.textContent='Agregando…';
    try{
      const {data,error}=await rpc('dp_accept_waiter_comanda',{p_comanda_id:id,p_expected_version:order.version});if(error)throw error;
      if(currentToken!==api().getToken())return;
      if(!data?.comanda?.accepted_at)throw Error('No pudimos confirmar que se agregaron los productos. Intenta de nuevo.');
      if(managerOpen===id){managerOpen='';$('#dw-kitchen-dialog').close();}button.remove();rememberResult(data);api().applyWaiterResult(data);void loadOrders();
      const accepted=orders.find(row=>row.id===id),printItems=hadTableConsumption?newKitchenItems(accepted):[];
      if(hadTableConsumption&&printItems.length){kitchenPrintItems.set(id,printItems);showKitchen(id);api().notify('Comanda aceptada. Consumo agregado a la mesa; comanda lista para imprimir.');}
      else api().notify(hadTableConsumption?'Bebidas agregadas al consumo de la mesa.':'Comanda aceptada. Consumo agregado a la mesa.');
    }catch(error){if(currentToken!==api().getToken())return;if(managerOpen===id)$('#dw-kitchen-error').textContent=errorText(error);else api().notify(errorText(error),'error');if(button.isConnected){button.disabled=false;button.textContent='Agregar a la mesa';}void loadOrders();}
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
  const tablePrints=new Set();
  async function printCompleteTable(tableId){
    if(waiter()||!allowed()||tablePrints.has(tableId))return;
    const currentToken=api().getToken(),popup=window.open('','_blank','width=480,height=720');
    if(!popup){api().notify('Permite las ventanas emergentes para imprimir la comanda.','error');return;}
    popup.document.title='Comanda completa';popup.document.body.textContent='Preparando comanda completa…';tablePrints.add(tableId);
    try{
      // Read orders before consumption: accepting an order between the reads
      // must not print its products twice or leave them out.
      const listed=await rpc('dp_list_waiter_comandas');if(listed.error)throw listed.error;
      const snapshot=await rpc('get_admin_snapshot',{auth_token:currentToken});if(snapshot.error)throw snapshot.error;
      if(currentToken!==api().getToken()||waiter()||!allowed())throw Error('La sesión cambió. Abre la mesa nuevamente.');
      if(!Array.isArray(listed.data?.orders)||!Array.isArray(snapshot.data?.sessions))throw Error('No pudimos actualizar la comanda completa. Intenta de nuevo.');
      const account=snapshot.data.sessions.find(session=>session.table_id===tableId&&session.status==='open');
      if(!account)throw Error('Esta mesa ya no tiene una cuenta abierta.');
      const removed=new Set(listed.data.orders.filter(isRemoved).map(order=>order.id));
      const session={...account,session_items:(account.session_items||[]).filter(item=>!removed.has(item.waiter_comanda_id))};
      const tableOrders=listed.data.orders.filter(order=>order.session_id===session.id&&order.table_id===tableId&&!removed.has(order.id)&&order.items.length);
      const items=details().completeTableItems(session,tableOrders).map(item=>{
        const packing=window.DonPierosPackaging.read(item.waiter_comanda_id||item.pending?item.waiter_line_notes:item.notes);
        return {...item,waiter_line_notes:packing.notes,packagingSize:window.DonPierosPackaging.sizes[packing.size]||'',packagingUnitFee:packing.fee};
      });
      if(!items.length)throw Error('Esta mesa todavía no tiene productos para imprimir.');
      const notes=tableOrders.map(order=>{const info=details().readTime(order.notes);return [info.notes,info.time?'Tiempo estimado: '+info.time:''].filter(Boolean).length?`${order.waiter_name||'Comanda'}: `+[info.notes,info.time?'Tiempo estimado: '+info.time:''].filter(Boolean).join(' · '):'';}).filter(Boolean).join('\n');
      let width=80;try{if(localStorage.getItem('don_pieros_order_paper')==='58')width=58;}catch(_){}
      if(!popup.closed)renderKitchenPrint(popup,{table:operations().tables.find(table=>table.id===tableId)||session.restaurant_tables,items,notes,waiter_name:[...new Set(tableOrders.map(order=>order.waiter_name).filter(Boolean))].join(', ')||session.assigned_waiter?.full_name||'',updated_at:new Date().toISOString()},width,true);
    }catch(error){if(!popup.closed)popup.close();api().notify(errorText(error),'error');}
    finally{tablePrints.delete(tableId);}
  }
  function printKitchen(id){
    const order=orders.find(row=>row.id===id);if(!order||!allowed())return;
    printWidth=$('#dw-print-width')?.value==='58'?58:80;
    try{localStorage.setItem('don_pieros_order_paper',String(printWidth));}catch(_){}
    const popup=window.open('','_blank','width=480,height=720');
    if(!popup){api().notify('Permite las ventanas emergentes para imprimir la comanda.','error');return;}
    const printable=kitchenPrintItems.has(id)?{...order,items:kitchenPrintItems.get(id)}:order;
    void renderKitchenPrint(popup,printable,printWidth).then(()=>finishPrintedTableOrder(id)).catch(error=>api()?.notify('No se pudo preparar la impresión. '+String(error.message||error),'error'));
  }
  function finishTableOrderFlow(){
    ['dw-product-dialog','dw-review-dialog','dw-catalog-dialog','dw-kitchen-dialog'].forEach(dialogId=>{const dialog=$('#'+dialogId);if(dialog?.open)dialog.close();});
    managerOpen='';activeProduct=null;editingLine='';replacingLine='';directLineEdit=false;draft=null;selectedTable='';tab='menu';category='';query='';homeSignature='';renderHome();
  }
  function finishPrintedTableOrder(id){
    if(managerOpen!==id)return;
    kitchenPrintItems.delete(id);finishTableOrderFlow();
  }
  function renderKitchenPrint(popup,order,width,complete=false){
    const groupedItems=details().groupComandaItems(order.items);
    const printItems=groupedItems.map(item=>({...item,packing:window.DonPierosPackaging.breakdown(item)}));
    const productTotal=printItems.reduce((sum,item)=>sum+item.packing.products,0),boxTotal=printItems.reduce((sum,item)=>sum+item.packing.packagingTotal,0);
    const logo=new URL('images/don-pieros-logo.png',location.href).href;
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ${esc(tableLabel(order.table))}</title><style>@page{size:${width}mm auto;margin:0}*{box-sizing:border-box;color:#000!important;font-weight:900!important}body{width:${width-6}mm;margin:0;font:16px/1.45 monospace;color:#000;background:#fff}header img{display:block;width:28mm;height:22mm;object-fit:contain;margin:0 auto}h1{text-align:center;font-size:22px;margin:8px 0}header,footer{text-align:center}article{display:flex;gap:8px;padding:10px 0;border-top:1px dashed #000}article>b{font-size:22px}article div{flex:1}article strong{font-size:19px}p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}.fulfillment{font-size:17px;text-decoration:underline;text-decoration-color:#218653}.notes{border:2px solid #000;padding:8px;margin:12px 0}footer{border-top:1px dashed #000;padding:12px 0}${window.DonPierosThermal.sizeStyle}</style></head><body><header><img src="${esc(logo)}" alt="Don Pieros Pizza"><h1>${esc(tableLabel(order.table))}</h1><p>${complete?'COMANDA COMPLETA DE LA MESA':'Comanda de mesa · v'+Number(order.version)}</p><p>${esc(order.waiter_name)}<br>${esc(window.DonPierosDates.dateTime(order.updated_at))}</p></header>${printItems.map(item=>{const fulfillment=item.waiter_options?.fulfillment||item.packing.fulfillment,label=fulfillment==='delivery'?'Domicilio':fulfillment==='pickup'?'Para llevar':fulfillment==='dinein'?'Para comer en el local':'';const labels=(item.waiter_options?.labels||[]).filter(text=>!['Domicilio','Para llevar','En el local','Para comer en el local'].includes(text));return `<article><b>${Number(item.quantity)} ×</b><div><strong>${esc(item.item_name)}</strong>${label?`<p class="fulfillment">${label}</p>`:''}${window.DonPierosOrderLabels.compact(labels).map(label=>{const option=window.DonPierosThermal.sizeOption(label);return `<p class="${option.isSize?'size-option':''}">${option.html}</p>`;}).join('')}${complete&&item.pending?'<p>Pendiente de aceptar</p>':''}${item.packing.notes?`<p class="line-notes"><b>${esc(item.packing.notes)}</b></p>`:''}<p>Productos: ${money(item.packing.unitPrice)} c/u · ${money(item.packing.products)}</p>${item.packing.packagingTotal?`<p class="packing-line">Caja ${esc(item.packing.packagingSize)}: ${item.quantity} × ${money(item.packing.packagingUnitFee)} = ${money(item.packing.packagingTotal)}</p>`:''}<p>Total de la línea: ${money(item.packing.total)}</p></div></article>`;}).join('')}${order.notes?`<section class="notes"><b>Indicaciones para cocina</b><p>${esc(order.notes)}</p></section>`:''}<footer>Productos: ${esc(money(productTotal))}${boxTotal?`<br>Cajas para llevar: ${esc(money(boxTotal))}`:''}<br>Total: ${esc(money(total(order.items)))}</footer></body></html>`);
    popup.document.close();details().prepareComanda(popup.document,'article',groupedItems,order.notes);return window.DonPierosThermal.print(popup,width);
  }
  async function beginCatalogChoice(replacement=''){
    replacingLine=replacement;$('#dw-review-dialog').close();category='';query='';
    if(individualPick||webPick||draft.managerMode){
      $('#dw-manager-catalog').innerHTML=`<header class="dw-dialog-head"><div><span class="eyebrow">${esc(tableLabel(operations().tables.find(table=>table.id===selectedTable)))}</span><h2 id="dw-catalog-title">${replacement?'Cambiar producto':'Agregar producto'}</h2></div><button type="button" class="dw-close" data-dw-close aria-label="Cerrar">×</button></header><button type="button" class="dw-button" data-dw-account>Ver consumo de la mesa</button><label class="dw-search">Buscar producto<input type="search" id="dw-manager-search" placeholder="Pizza, bebida, lasaña…"></label><div id="dw-manager-categories" class="dw-categories"></div><div id="dw-manager-products" class="dw-product-grid"></div>${individualPick?'<button type="button" class="dw-primary dw-send-print" data-dw-send-individual>▤ Enviar e imprimir comanda</button>':''}`;
      if(individualPick){$('#dw-manager-catalog .eyebrow').textContent='Venta individual';$('#dw-manager-catalog [data-dw-account]').remove();$('#dw-catalog-dialog').dataset.individualPicker='1';}
      if(webPick){$('#dw-manager-catalog .eyebrow').textContent=webPick.title;$('#dw-manager-catalog [data-dw-account]').remove();$('#dw-catalog-dialog').dataset.webPicker='1';}
      renderManagerProducts();$('#dw-catalog-dialog').showModal();$('#dw-catalog-dialog').scrollTop=0;if(!catalog)void loadCatalog();
    }else{
      tab='menu';renderTable();if(replacement)$('#dw-menu-view').insertAdjacentHTML('afterbegin','<p class="dw-edit-notice" id="dw-replace-banner">Elige el producto que reemplazará al anterior. <button type="button" class="dw-button" data-dw-cancel-replace>Cancelar</button></p>');
      root.scrollIntoView({block:'start',behavior:'instant'});
    }
  }
  function renderManagerProducts(){
    if(!$('#dw-manager-products'))return;
    if(!catalog){$('#dw-manager-products').innerHTML=(webPick?'':customChoice())+'<p class="dw-error">'+esc(catalogError||'Preparando la carta…')+'</p>'+(catalogError?'<button type="button" class="dw-button" data-dw-reload>Cargar carta</button>':'');return;}
    const categories=[...new Set(catalog.products.filter(p=>p.available).map(p=>p.category))];
    $('#dw-manager-categories').innerHTML=['',...categories].map(name=>`<button type="button" class="${name===category?'active':''}" data-dw-manager-category="${esc(name)}">${esc(name||'Todo')}</button>`).join('');
    $('#dw-manager-products').innerHTML=(webPick?'':customChoice())+(catalog.products.filter(p=>p.available&&(!category||p.category===category)&&normalize(p.name+' '+p.description).includes(normalize(query))).map(p=>`<button class="dw-product" type="button" data-dw-product="${esc(p.id)}"><img src="${esc(window.DonPierosImages.resolve(p))}" alt="" loading="lazy"><div><strong>${esc(p.name)}</strong><span>${p.modifiers?.some(group=>group.usePrice)?'Desde ':''}${money(p.price)} <b>＋</b></span></div></button>`).join('')||'<p class="dw-empty">No encontramos ese producto en esta categoría.</p>');
  }
  function chooseIndividualProduct(sessionId){
    if(waiter()||!allowed()||busy)return;
    if(document.querySelector('.dw-dialog[open]'))return api().notify('Termina la selección actual antes de agregar productos.','error');
    individualPick={sessionId};void beginCatalogChoice();void loadCatalog();
  }
  function chooseWebOrderProduct(options){
    if(waiter()||!allowed()||busy)return false;
    if(document.querySelector('.dw-dialog[open]')){api().notify('Termina la selección actual antes de agregar productos.','error');return false;}
    webPick=options;
    if(options.item)void editWebProduct(options);else{void beginCatalogChoice();void loadCatalog();}
    return true;
  }
  async function editWebProduct(pick){
    const dialog=$('#dw-product-dialog');dialog.dataset.webPicker='1';dialog.dataset.webEdit='1';
    $('#dw-product-body').innerHTML='<header class="dw-dialog-head"><h2 id="dw-product-title">Editar producto</h2><button type="button" class="dw-close" data-dw-close aria-label="Cerrar">×</button></header><p>Preparando producto…</p>';
    dialog.showModal();
    if(!catalog)await loadCatalog();
    if(webPick!==pick)return;
    const item=pick.item,product=catalog?.products.find(product=>product.id===item.productId);
    if(!product&&!item.custom){$('#dw-product-body p').textContent='Este producto ya no está en la carta. Cierra y actualiza el menú.';return;}
    const selectionIds={};
    for(const group of product?.modifiers||[]){
      if(Array.isArray(item.selectionIds?.[group.id]))selectionIds[group.id]=item.selectionIds[group.id].slice();
      else selectionIds[group.id]=(catalog.toppings||[]).filter(option=>option.kind===group.source&&(item.selections||[]).some(label=>String(label).replace(/\s*\(\+\$[^)]*\)\s*$/,'')===group.name+': '+option.name)).map(option=>option.id);
    }
    const packing=window.DonPierosPackaging,fee=Number(item.packagingUnitFee)||0;
    const fulfillment=item.fulfillment||(pick.fulfillment==='delivery'?'delivery':fee?'pickup':pick.fulfillment==='dinein'?'dinein':'pickup');
    pick.line={id:crypto.randomUUID(),product_id:item.productId,name:item.name,quantity:Number(item.quantity),unit_price:Number(item.unitPrice)+fee,options:{selectionIds,fulfillment,...(item.custom?{custom:true}:{})},notes:packing.note(item.notes||'',fee?packing.size(item.packagingSize):'',fulfillment)};
    showProduct(item.productId,pick.line.id);
    $('#dw-add-product').childNodes[0].textContent='Guardar cambios · ';
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
    if(target.hasAttribute('data-dw-individual')){openStaffIndividual();return;}
    if(target.hasAttribute('data-dw-home')){selectedTable='';replacingLine='';homeSignature='';renderHome();root.scrollIntoView({block:'start',behavior:'instant'});}
    if(target.hasAttribute('data-dw-tab')){tab=target.dataset.dwTab;$('#dw-menu-view').hidden=tab!=='menu';$('#dw-account-view').hidden=tab!=='account';root.querySelectorAll('[data-dw-tab]').forEach(b=>b.classList.toggle('active',b.dataset.dwTab===tab));renderSelection();if(tab==='account')void loadOrders();}
    if(target.hasAttribute('data-dw-category')){category=target.dataset.dwCategory;renderProducts();}
    if(target.hasAttribute('data-dw-manager-category')){category=target.dataset.dwManagerCategory;renderManagerProducts();}
    if(target.dataset.dwProduct)showProduct(target.dataset.dwProduct,replacingLine);
    if(target.hasAttribute('data-dw-custom'))showProduct('custom',replacingLine);
    if(target.hasAttribute('data-dw-account')){const table=selectedTable;persist();draft=null;selectedTable='';$('#dw-catalog-dialog').close();$('#dw-review-dialog').close();api().openTableAccount(table);}
    if(target.hasAttribute('data-dw-send-individual')){
      const sessionId=individualPick?.sessionId;if(!sessionId)return;
      saveIndividualProductDetails(sessionId);
      const popup=window.open('','_blank','width=420,height=720');
      if(!popup)return api().notify('Permite ventanas emergentes para imprimir.','error');
      sendIndividualAndPrint(sessionId,popup,target);return;
    }
    if(target.hasAttribute('data-dw-quantity')){const output=$('#dw-product-quantity');output.value=Math.min(draft?.legacy?100:99,Math.max(1,Number(output.value)+Number(target.dataset.dwQuantity)));updateProductOptions();}
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
    if(event.target.id==='dw-individual-customer'&&draft&&!draft.pending){
      draft.customerName=event.target.value;persist();const complete=draft.customerName.trim().length>=2,field=event.target.closest('label');
      if(complete){field.classList.remove('is-invalid','dw-required-flash');event.target.removeAttribute('aria-invalid');$('#dw-send-error').textContent='';}
      field.classList.toggle('is-complete',complete);$('#dw-customer-status').textContent=complete?'Completo':'Obligatorio';
    }
    if(['dw-custom-name','dw-custom-price','dw-unit-price'].includes(event.target.id))updateProductOptions();
    if(['dw-product-customer','dw-product-time','dw-product-observations','dw-product-address'].includes(event.target.id)){
      const data={customerName:$('#dw-product-customer').value,time:$('#dw-product-time').value,notes:$('#dw-product-observations').value,address:$('#dw-product-address')?.value||'',fulfillment:$('#dw-fulfillment')?.value||''};
      if(individualPick)api().updateIndividualDetails(individualPick.sessionId,data);
      else if(draft?.individual&&!draft.pending){const old=details().readTime(draft.notes);draft.customerName=data.customerName;draft.notes=details().withTime(details().withTime(data.notes,old.time,old.startedAt),data.time);persist();}
    }
    if(['dw-order-notes','dw-estimated-time'].includes(event.target.id)&&draft&&!draft.pending){const old=details().readTime(draft.notes);draft.notes=details().withTime(details().withTime($('#dw-order-notes').value,old.time,old.startedAt),$('#dw-estimated-time').value);persist();}
  });
  $('#dw-product-form').onsubmit=addProduct;
  $('#dw-product-form').addEventListener('invalid',event=>{if(event.target.id==='dw-fulfillment'){event.preventDefault();guideDelivery();}},true);
  $('#dw-product-form').addEventListener('change',event=>{
    if(event.target.id!=='dw-fulfillment')return;
    const complete=['dinein','pickup','delivery'].includes(event.target.value),field=event.target.closest('.dw-fulfillment-field');
    field.classList.toggle('is-complete',complete);field.classList.remove('is-invalid','dw-required-flash');event.target.removeAttribute('aria-invalid');
    $('#dw-fulfillment-status').textContent=complete?'Seleccionado':'Obligatorio';if(complete)$('#dw-product-error').textContent='';
    const address=$('#dw-product-address');if(address){address.closest('.dw-delivery-address').hidden=event.target.value!=='delivery';if(event.target.value==='delivery')address.focus();}
    if(individualPick)saveIndividualProductDetails(individualPick.sessionId);
  });
  $('#dw-product-form').addEventListener('input',event=>{if(event.target.id==='dw-product-address')event.target.setCustomValidity('');});
  $('#dw-product-form').addEventListener('change',updateProductOptions);
  $('#dw-product-form').addEventListener('input',event=>{if(event.target.id==='dw-item-name')event.target.setCustomValidity('');});
  document.addEventListener('dblclick',event=>{
    const price=event.target.closest('[data-dw-price]');if(price){editLinePrice(price);return;}
    const line=event.target.closest('[data-dw-line]');if(line&&!event.target.closest('button,input')){const item=draft?.items.find(item=>item.id===line.dataset.dwLine);if(item)showProduct(item.product_id,item.id);return;}
    const consumed=event.target.closest('[data-table-consumption-edit]');if(consumed){$('#accountDetailDialog')?.close();void editConsumptionLine(consumed.dataset.sessionId,consumed.dataset.tableConsumptionEdit);}
  });
  document.addEventListener('keydown',event=>{const price=event.target.closest('[data-dw-price]');if(price&&event.target===price&&event.key==='Enter'){event.preventDefault();editLinePrice(price);}});
  for(const dialog of document.querySelectorAll('.dw-dialog')){
    dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy)dialog.close();});
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  }
  $('#dw-product-dialog').addEventListener('close',()=>{
    if($('#dw-product-dialog').dataset.webPicker){delete $('#dw-product-dialog').dataset.webPicker;if($('#dw-product-dialog').dataset.webEdit){delete $('#dw-product-dialog').dataset.webEdit;const pick=webPick;webPick=null;pick?.onClose();}return;}
    if($('#dw-product-dialog').dataset.individualPicker){delete $('#dw-product-dialog').dataset.individualPicker;return;}
    if(busy||!draft||!directLineEdit&&!draft.legacy)return;
    try{localStorage.removeItem(draftKey());}catch(_){}directLineEdit=false;
    if(waiter()){newDraft();renderSelection();}else{draft=null;selectedTable='';}
  });
  $('#dw-review-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('#dw-review-dialog').addEventListener('close',()=>{if(draft?.managerMode&&!draft.pending&&!busy&&!$('#dw-product-dialog').open&&!$('#dw-catalog-dialog').open){draft=null;selectedTable='';}});
  $('#dw-catalog-dialog').addEventListener('close',()=>{
    if($('#dw-catalog-dialog').dataset.webPicker){delete $('#dw-catalog-dialog').dataset.webPicker;const pick=webPick;webPick=null;pick?.onClose();return;}
    if($('#dw-catalog-dialog').dataset.individualPicker){delete $('#dw-catalog-dialog').dataset.individualPicker;const sessionId=individualPick?.sessionId;individualPick=null;if(sessionId)api().leaveIndividualCatalog?.(sessionId);return;}
    if(draft?.managerMode&&!$('#dw-review-dialog').open&&!$('#dw-product-dialog').open){
      persist();replacingLine='';draft=null;selectedTable='';
    }
  });
  function tick(){
    if(!allowed()||document.hidden)return;
    const next=api().getToken();if(next!==token){token=next;busy=false;serviceReady=false;orders=[];lastIndividual=null;localWrites.clear();selectedTable='';draft=null;lastSnapshot='';homeSignature='';managerSignature='';sync();void loadCatalog();}
    sync();void loadOrders();
  }
  const editComanda=async(id,removeId='')=>{if(!orders.some(order=>order.id===id))await loadOrders();editOrder(id);if(removeId&&draft?.id===id&&!draft.pending){draft.items=draft.items.filter(item=>item.id!==removeId);persist();renderReview();renderSelection();}void loadOrders();};
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
  window.addEventListener('donpieros-catalog-change',()=>{if(allowed())void loadCatalog();});
  window.addEventListener('donpieros-reception-filter',()=>{managerSignature='';renderReception();});
  window.DonPierosWaiter={openTable,startTableOrder,chooseIndividualProduct,chooseWebOrderProduct,printCompleteTable,editConsumptionLine,updateConsumedLine,sync,editComanda,openRequest,getSessionObservations,isReady:()=>serviceReady};setInterval(tick,3000);window.addEventListener('donpieros-session-change',tick);window.addEventListener('focus',tick);tick();
})();
