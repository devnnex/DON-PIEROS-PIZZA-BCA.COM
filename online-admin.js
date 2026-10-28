(() => {
  'use strict';
  if(document.body.dataset.page !== 'admin') return;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v)||0);
  const date=v=>new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'});
  const api=()=>window.DonPierosAdmin;
  const friendly=(value)=>window.DonPierosLanguage.message(value);
  const labels={nueva:'Nueva',atendiendo:'En preparación',lista:'Lista',despachada:'Despachada',cancelada:'Cancelada'};
  let orders=[],dashboardOrders=[],total=0,offset=0,revision='',busy=false,firstLoad=true,connectedToken='',channel=null,catalog=null,catalogKind='products',editItem=null,removeImage=false,previewUrl='';
  const seenOrderIds=new Set();
  const pendingAvailability=new Map();
  let catalogLoading=null,ordersReloadRequested=false,catalogEpoch=0;
  const notify=(text,error=false)=>api()?.notify(friendly(text),error?'error':'ok');
  const canOrders=()=>{const u=api()?.getUser();return u && (u.role==='boss'||u.role==='waiter'||u.role==='admin'&&(!Array.isArray(u.permissions)||u.permissions.includes('dashboard')||u.permissions.includes('service')));};
  const canMenu=()=>{const u=api()?.getUser();return u && (u.role==='boss'||u.role==='admin'&&(!Array.isArray(u.permissions)||u.permissions.includes('inventory')));};

  async function request(action,payload={},timeoutMs=45000){
    const url=window.DON_PIEROS_CONFIG.appsScriptUrl;
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))throw new Error('La conexión del negocio necesita revisión. Contacta al responsable.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload,authToken:api()?.getToken()||'',origin:location.origin}),signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('No pudimos completar la solicitud. Intenta de nuevo en unos segundos.');
      const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo completar la operación.');return result;
    }catch(error){if(error.name==='AbortError')throw new Error('La respuesta está tardando. Actualiza para comprobar si se guardó.');throw error;}finally{clearTimeout(timer);}
  }

  function mount(){
    const main=$('.admin-app');
    main.insertAdjacentHTML('beforeend',`
      <section class="panel dp-panel" id="onlineorders" data-admin-section="onlineorders">
        <div class="section-head"><div><span class="eyebrow">Recepción de pedidos</span><h2>Pedidos web</h2><p id="dp-orders-status" role="status">Esperando conexión…</p></div><button class="ghost" id="dp-orders-refresh" type="button">↻ Actualizar</button></div>
        <div class="dp-toolbar"><label>Mostrar<select id="dp-order-filter"><option value="active">En cola</option><option value="all">Todos</option>${Object.entries(labels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><a class="ghost" href="index.html" target="_blank" rel="noopener">Abrir carta ↗</a></div>
        <div class="dp-orders" id="dp-orders-list"></div><div class="dp-pagination"><button class="ghost" id="dp-prev">← Anteriores</button><span id="dp-page"></span><button class="ghost" id="dp-next">Siguientes →</button></div>
      </section>
      <section class="panel dp-panel" id="webmenu" data-admin-section="webmenu">
        <div class="section-head"><div><span class="eyebrow">Carta del cliente</span><h2>Menú online</h2><p>Administra tus productos, precios y fotografías en un solo lugar.</p></div><a class="ghost" href="index.html" target="_blank" rel="noopener">Ver carta ↗</a></div>
        <div class="dp-connection" id="dp-connection"><div><strong>Conexión del negocio</strong><p>Tu carta y tus pedidos se mantienen actualizados.</p></div><button class="ghost" type="button" id="dp-check-connection">Comprobar conexión</button><small id="dp-connection-status" role="status"></small></div>
        <div class="dp-toolbar"><div class="dp-tabs" id="dp-catalog-tabs"><button type="button" data-catalog="products" class="active">Productos</button><button type="button" data-catalog="toppings">Tamaños y opciones</button><button type="button" data-catalog="payments">Pagos</button><button type="button" data-catalog="neighborhoods">Barrios</button></div><div><button class="ghost" id="dp-menu-refresh" type="button">↻ Actualizar</button> <button class="primary" id="dp-add-item" type="button">＋ Agregar</button></div></div>
        <label class="dp-category-filter" id="dp-category-filter">Categoría<select id="dp-menu-category"><option value="">Todas las categorías</option></select></label><p id="dp-menu-status" role="status"></p><div id="dp-catalog-list"></div>
      </section>`);
    $('#alertsPanel').insertAdjacentHTML('afterend','<div id="dp-dashboard-orders" class="dp-dashboard-orders"></div>');
    document.body.insertAdjacentHTML('beforeend',`<dialog id="dp-order-dialog" class="dp-dialog"><div class="dp-dialog-card"><button class="dp-close" type="button" data-dp-close aria-label="Cerrar">×</button><div id="dp-order-detail"></div></div></dialog><dialog id="dp-item-dialog" class="dp-dialog"><form id="dp-item-form" class="dp-dialog-card"><button class="dp-close" type="button" data-dp-close aria-label="Cerrar">×</button><span class="eyebrow">Menú online</span><h2 id="dp-item-title"></h2><div id="dp-item-fields"></div><p id="dp-item-error" role="alert"></p><div class="dp-form-actions"><button class="ghost" type="button" data-dp-close>Cancelar</button><button class="primary" id="dp-item-save" type="submit">Guardar</button></div></form></dialog>`);
    $('#dp-orders-refresh').onclick=()=>void loadOrders(true);
    $('#dp-order-filter').onchange=()=>{offset=0;revision='';void loadOrders(true);};
    $('#dp-prev').onclick=()=>{offset=Math.max(0,offset-60);void loadOrders(true);};$('#dp-next').onclick=()=>{offset+=60;void loadOrders(true);};
    $('#dp-menu-refresh').onclick=()=>void loadCatalog();$('#dp-add-item').onclick=()=>openItem();
    $('#dp-menu-category').onchange=renderCatalog;
    $('#dp-catalog-tabs').onclick=e=>{const button=e.target.closest('[data-catalog]');if(!button)return;catalogKind=button.dataset.catalog;$$('[data-catalog]').forEach(b=>b.classList.toggle('active',b===button));renderCatalog();};
    $('#dp-check-connection').onclick=async e=>{
      const button=e.currentTarget;button.disabled=true;$('#dp-connection-status').textContent='Comprobando conexión…';
      try{
        await request('dp_admin_catalog');if(api().getUser()?.role==='boss')await api().bootstrap();$('#dp-connection-status').textContent='Conexión activa. Todo está listo para trabajar.';
        await Promise.allSettled([loadCatalog(),loadOrders(true)]);
      }catch(error){$('#dp-connection-status').textContent=friendly(error);notify(friendly(error),true);}finally{button.disabled=false;}
    };
    $('#dp-item-form').onsubmit=saveItem;
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-dp-close]'))e.target.closest('dialog')?.close();
      const order=e.target.closest('[data-dp-order]');if(order)openOrder(order.dataset.dpOrder);
      const edit=e.target.closest('[data-dp-edit]');if(edit)openItem(catalog[catalogKind].find(item=>item.id===edit.dataset.dpEdit));
      const del=e.target.closest('[data-dp-delete]');if(del)void deleteItem(del.dataset.dpDelete);
      const availability=e.target.closest('[data-dp-availability]');if(availability)void toggleAvailability(availability);
    });
    for(const dialog of $$('.dp-dialog')){dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}});}
    void firstBoss();
  }

  async function firstBoss(){
    const form=$('#loginForm');
    try{
      const {data,error}=await api().db.rpc('dp_setup_status');if(error||data!==true)return;
      form.querySelector('h1').textContent='Crear primer Jefe';form.querySelector('p').textContent='Configura el acceso de Don Pieros Pizza. Solo se permite crear un primer Jefe.';
      form.querySelector('label').insertAdjacentHTML('beforebegin','<label id="dp-first-name">Tu nombre<input name="boss_name" type="text" maxlength="80" minlength="2" autocomplete="name" required></label>');
      form.pin.pattern='[0-9]{4,12}';form.pin.minLength=4;form.pin.maxLength=12;form.pin.placeholder='De 4 a 12 dígitos';form.querySelector('[type=submit]').textContent='Crear Jefe y entrar';
      let created=false;
      form.addEventListener('submit',async event=>{
        if(created)return;event.preventDefault();event.stopImmediatePropagation();
        const button=form.querySelector('[type=submit]');button.disabled=true;$('#loginError').textContent='';
        try{
          const {error}=await api().db.rpc('dp_create_boss',{p_name:form.boss_name.value.trim(),p_username:form.username.value.trim().toLowerCase(),p_pin:form.pin.value});
          if(error)throw error;created=true;form.username.value=form.username.value.trim().toLowerCase();button.disabled=false;form.requestSubmit();
        }catch(error){$('#loginError').textContent=friendly(error);button.disabled=false;}
      },true);
    }catch(_){}
  }

  async function loadOrders(force=false){
    if(busy){if(force)ordersReloadRequested=true;return;}
    if(!canOrders()||!window.DON_PIEROS_CONFIG.appsScriptUrl)return;
    busy=true;
    if(force)$('#dp-orders-status').textContent='Actualizando pedidos…';
    try{
      const filter=$('#dp-order-filter').value;
      if(!force&&revision){const status=await request('dp_order_status',{},15000);if(status.revision===revision)return;}
      const pageOffset=offset;
      const [result,activeResult]=await Promise.all([request('dp_get_orders',{status:filter,offset:pageOffset,limit:60}),
        filter==='active'&&pageOffset===0?Promise.resolve(null):request('dp_get_orders',{status:'active',offset:0,limit:20})]);
      if(filter!==$('#dp-order-filter').value||pageOffset!==offset){ordersReloadRequested=true;return;}
      const active=activeResult||result;
      dashboardOrders=active.orders;
      if(!firstLoad&&dashboardOrders.some(o=>o.status==='nueva'&&!seenOrderIds.has(o.id)))api().alarm();
      dashboardOrders.forEach(o=>seenOrderIds.add(o.id));
      firstLoad=false;orders=result.orders;total=result.total;revision=result.revision;
      renderOrders();$('#dp-nav-count').textContent=result.activeCount||'';$('#dp-orders-status').textContent='Conectado · '+result.activeCount+' en cola · '+new Date().toLocaleTimeString('es-CO');
      renderDashboard(dashboardOrders,active.activeCount);
    }catch(error){$('#dp-orders-status').textContent=friendly(error);if(force)notify(error.message,true);}finally{busy=false;if(ordersReloadRequested){ordersReloadRequested=false;void loadOrders(true);}}
  }

  function orderCard(order){return `<button class="dp-order-card dp-state-${esc(order.status)}" data-dp-order="${esc(order.id)}" type="button"><div><span class="dp-status">${labels[order.status]||esc(order.status)}</span><small>${esc(date(order.createdAt))}</small></div><h3>${esc(order.customerName)}</h3><p>${esc(order.id)} · ${order.fulfillment==='delivery'?'Domicilio':'Recoge en tienda'}</p><p>${order.items.reduce((sum,item)=>sum+Number(item.quantity),0)} producto(s) · ${esc(order.items.map(i=>i.quantity+' × '+i.name).join(', '))}</p><footer><strong>${money(order.total)}</strong><span>Ver comanda →</span></footer></button>`;}
  function renderOrders(){
    $('#dp-orders-list').innerHTML=orders.map(orderCard).join('')||'<div class="dp-empty">No hay pedidos en este estado.</div>';
    $('#dp-page').textContent=total?`${offset+1}–${Math.min(offset+60,total)} de ${total}`:'Sin pedidos';$('#dp-prev').disabled=offset===0;$('#dp-next').disabled=offset+60>=total;
  }
  function renderDashboard(rows,count){$('#dp-dashboard-orders').innerHTML=`<div class="section-head"><h3>Pedidos de la carta <span class="dp-count">${count}</span></h3><a href="#onlineorders">Ver todos →</a></div>${rows.slice().reverse().slice(0,6).map(orderCard).join('')||'<p class="dp-muted">Los pedidos de clientes aparecerán aquí.</p>'}`;}

  function openOrder(id){
    const order=orders.find(o=>o.id===id)||dashboardOrders.find(o=>o.id===id);if(!order)return;
    $('#dp-order-detail').innerHTML=`<span class="eyebrow">Comanda · Don Pieros Pizza</span><h2>${esc(order.id)}</h2><span class="dp-status">${labels[order.status]}</span><p>${esc(date(order.createdAt))}</p><div class="dp-order-customer"><h3>${esc(order.customerName)}</h3><a href="tel:${esc(order.phone.replace(/[^+\d]/g,''))}">${esc(order.phone)}</a><p>${order.fulfillment==='delivery'?'Domicilio · '+esc(order.neighborhood)+'<br>'+esc(order.address):'Recoger en el negocio'}</p></div><div class="dp-detail-lines">${order.items.map(item=>`<article><div><strong>${item.quantity} × ${esc(item.name)}</strong>${item.selections?.length?`<p>${item.selections.map(esc).join('<br>')}</p>`:''}</div><b>${money(item.quantity*item.unitPrice)}</b></article>`).join('')}</div>${order.notes?`<div class="dp-notes"><strong>Indicaciones para cocina</strong><p>${esc(order.notes)}</p></div>`:''}<div class="dp-totals"><p>Subtotal <b>${money(order.subtotal)}</b></p><p>Domicilio <b>${money(order.deliveryFee)}</b></p><p class="dp-total">Total <b>${money(order.total)}</b></p><small>${esc(order.paymentMethod)}${order.paymentValue?' · '+esc(order.paymentValue):''} · Pago por verificar</small></div><p class="dp-muted">Turno al confirmar: ${Number(order.queuePosition)} · ${Number(order.ordersAhead)} delante.${order.handledByName?' Atendido por '+esc(order.handledByName)+'.':''}</p><div class="dp-order-actions"><label>Estado<select id="dp-new-status">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${value===order.status?'selected':''}>${label}</option>`).join('')}</select></label><button class="primary" id="dp-change-status">Guardar estado</button><label>Recibo<select id="dp-print-width"><option value="80">80 mm</option><option value="58">58 mm</option></select></label><button class="ghost" id="dp-print-order">▤ Imprimir comanda</button><a class="ghost" href="https://wa.me/${esc(order.phone.replace(/\D/g,'').replace(/^(\d{10})$/,'57$1'))}?text=${encodeURIComponent('🍕 Hola '+order.customerName+', somos Don Pieros Pizza. Tu pedido '+order.id+' está '+labels[order.status].toLowerCase()+'.')}" target="_blank" rel="noopener">WhatsApp ↗</a></div><p id="dp-order-error" role="alert"></p>`;
    $('#dp-change-status').onclick=async event=>{event.target.disabled=true;event.target.textContent='Guardando…';try{await request('dp_update_order',{id:order.id,status:$('#dp-new-status').value,version:order.version});$('#dp-order-dialog').close();revision='';void loadOrders(true);notify('Estado del pedido actualizado.');signal('order-updated');}catch(error){$('#dp-order-error').textContent=friendly(error);event.target.disabled=false;event.target.textContent='Guardar estado';}};
    $('#dp-print-order').onclick=()=>printOrder(order,Number($('#dp-print-width').value));$('#dp-order-dialog').showModal();
  }

  function printOrder(order,width){
    const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;right:0;border:0';document.body.append(frame);
    const d=frame.contentDocument;d.open();d.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ${esc(order.id)}</title><style>@page{size:${width}mm auto;margin:3mm}*{box-sizing:border-box}body{font:12px/1.4 monospace;color:#000;background:white;margin:0;width:${width-6}mm}h1{font-size:19px;text-align:center;margin:6px 0}h2{font-size:16px}p{margin:5px 0;overflow-wrap:anywhere}.center{text-align:center}.line{border-top:1px dashed #000;margin:10px 0}.item{margin:10px 0}.item strong{font-size:15px}.item small{display:block}footer{font-size:10px;text-align:center}</style></head><body><h1>DON PIEROS PIZZA</h1><p class="center">COMANDA DE COCINA</p><h2>${esc(order.id)}</h2><p>${esc(date(order.createdAt))}</p><div class="line"></div><strong>${esc(order.customerName)}</strong><p>${esc(order.phone)}</p><p>${order.fulfillment==='delivery'?'DOMICILIO':'RECOGER EN TIENDA'}</p>${order.address?`<p>${esc(order.neighborhood)}<br>${esc(order.address)}</p>`:''}<div class="line"></div>${order.items.map(item=>`<div class="item"><strong>${item.quantity} × ${esc(item.name)}</strong>${(item.selections||[]).map(s=>`<small>+ ${esc(s)}</small>`).join('')}<p>${money(item.unitPrice*item.quantity)}</p></div>`).join('')}${order.notes?`<div class="line"></div><strong>INDICACIONES</strong><p>${esc(order.notes)}</p>`:''}<div class="line"></div><p>Subtotal: ${money(order.subtotal)}</p><p>Domicilio: ${money(order.deliveryFee)}</p><h2>TOTAL ${money(order.total)}</h2><p>Pago: ${esc(order.paymentMethod)} · POR VERIFICAR</p><p>Turno al confirmar: ${order.queuePosition}</p><div class="line"></div><footer>Comanda interna · No es factura fiscal<br>WhatsApp +57 310 224 1444</footer></body></html>`);d.close();
    frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});setTimeout(()=>{const height=Math.max(40,Math.ceil(d.body.scrollHeight*25.4/96)+6);const paper=d.createElement('style');paper.textContent=`@page{size:${width}mm ${height}mm;margin:3mm}`;d.head.append(paper);frame.contentWindow.focus();frame.contentWindow.print();},150);setTimeout(()=>frame.remove(),120000);
  }

  async function loadCatalog(){
    if(!canMenu())return;
    if(catalogLoading)return catalogLoading;
    const readEpoch=catalogEpoch;
    $('#dp-menu-status').textContent='Cargando menú…';
    catalogLoading=(async()=>{
      try{const next=await request('dp_admin_catalog');if(readEpoch!==catalogEpoch){$('#dp-menu-status').textContent='Menú actualizado con tus cambios recientes.';return;}catalog=next;catalog.products=catalog.products.map(item=>pendingAvailability.get(item.id)||item);renderCatalog();$('#dp-menu-status').textContent='Menú actualizado. Los cambios llegan a la carta al actualizar o en menos de un minuto.';}
      catch(error){$('#dp-menu-status').textContent=friendly(error);}finally{catalogLoading=null;}
    })();return catalogLoading;
  }
  function applyCatalogItem(kind,item){catalogEpoch++;catalog[kind]=[...(catalog[kind]||[]).filter(row=>row.id!==item.id),item].sort((a,b)=>a.sort_order-b.sort_order||String(a.name).localeCompare(String(b.name)));}
  function removeCatalogPhoto(path,message){void api().db.storage.from('product-images').remove([path]).then(({error})=>{if(error)notify(message,true);}).catch(()=>notify(message,true));}
  function renderCatalog(){
    if(!catalog){$('#dp-catalog-list').innerHTML='<div class="dp-empty">Actualiza el menú para ver y editar tus productos.</div>';return;}
    let rows=catalog[catalogKind]||[];
    const select=$('#dp-menu-category'),selected=select.value,categories=[...new Set((catalog.products||[]).map(p=>p.category))];
    select.innerHTML='<option value="">Todas las categorías</option>'+categories.map(c=>`<option value="${esc(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('');$('#dp-category-filter').hidden=catalogKind!=='products';
    if(catalogKind==='products'&&select.value)rows=rows.filter(item=>item.category===select.value);
    const card=item=>`<article class="dp-menu-card ${item.available?'':'dp-menu-unavailable'}">${catalogKind==='products'?`<img src="${esc(window.DonPierosImages.resolve(item))}" alt="${esc(item.name)}" loading="lazy">`:''}<div><small>${esc(item.category||item.kind||'')}</small><h3>${esc(item.name)}</h3><p>${catalogKind==='products'||catalogKind==='toppings'?money(item.price):catalogKind==='neighborhoods'?money(item.delivery_fee):esc(item.account_value||'Sin dato de cuenta')}</p><span class="dp-status">${item.available?'Disponible':'Agotado / desactivado'}</span></div><footer>${catalogKind==='products'?`<button class="dp-availability ${item.available?'is-available':''}" data-dp-availability="${esc(item.id)}" type="button">${item.available?'● Disponible':'○ Agotado'}</button>`:''}<button class="ghost" data-dp-edit="${esc(item.id)}">Editar</button><button class="ghost" data-dp-delete="${esc(item.id)}">Eliminar</button></footer></article>`;
    $('#dp-catalog-list').innerHTML=rows.length?(catalogKind==='products'?categories.filter(c=>rows.some(p=>p.category===c)).map(c=>`<section class="dp-category-section"><h3>${esc(c)} <small>${rows.filter(p=>p.category===c).length}</small></h3><div class="dp-menu-grid">${rows.filter(p=>p.category===c).map(card).join('')}</div></section>`).join(''):`<div class="dp-menu-grid">${rows.map(card).join('')}</div>`):'<div class="dp-empty">Sin registros. Agrega el primero para comenzar.</div>';
    $$('[data-dp-availability]').forEach(button=>{if(!pendingAvailability.has(button.dataset.dpAvailability))return;const card=button.closest('.dp-menu-card');card.setAttribute('aria-busy','true');card.querySelectorAll('button').forEach(control=>{control.disabled=true;});});
  }
  async function toggleAvailability(button){
    const item=catalog.products.find(p=>p.id===button.dataset.dpAvailability);if(!item)return;button.disabled=true;
    if(pendingAvailability.has(item.id))return;
    const optimistic={...item,available:!item.available};pendingAvailability.set(item.id,optimistic);applyCatalogItem('products',optimistic);renderCatalog();
    const card=$(`[data-dp-availability="${CSS.escape(item.id)}"]`)?.closest('.dp-menu-card');card?.setAttribute('aria-busy','true');card?.querySelectorAll('button').forEach(control=>{control.disabled=true;});
    $('#dp-menu-status').textContent='Guardando disponibilidad…';
    try{const result=await request('dp_save_catalog',{kind:'products',item:optimistic});pendingAvailability.delete(item.id);applyCatalogItem('products',result.item);renderCatalog();$('#dp-menu-status').textContent='Disponibilidad guardada.';signal('catalog-changed');notify(result.item.available?'Producto disponible.':'Producto agotado: el cliente no podrá pedirlo.');}
    catch(error){pendingAvailability.delete(item.id);applyCatalogItem('products',item);renderCatalog();notify(error.message,true);void loadCatalog();}
  }
  const field=(name,label,value='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  function openItem(item){
    if(!catalog)return notify('Primero conecta y carga el menú.',true);editItem=item||{id:crypto.randomUUID(),version:0};removeImage=false;
    $('#dp-item-title').textContent=(item?'Editar ':'Agregar ')+({products:'producto',toppings:'adicional',payments:'medio de pago',neighborhoods:'barrio'})[catalogKind];
    let fields=field('name','Nombre',item?.name||'','text','required maxlength="120"');
    if(catalogKind==='products')fields+=field('category','Categoría',item?.category||'Pizzas','text','required maxlength="80"')+field('price','Precio de venta',item?.price||0,'number','required min="0" step="1"')+`<label>Descripción<textarea name="description" maxlength="1000">${esc(item?.description||'')}</textarea></label>`+field('badge','Etiqueta (opcional)',item?.badge||'')+`<div class="dp-image-editor"><img id="dp-image-preview" src="${esc(window.DonPierosImages.resolve(item||{}))}" alt="Vista previa"><label>Fotografía del producto<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="ghost" type="button" id="dp-remove-image">Quitar imagen</button><small>JPG, PNG o WebP · hasta 5 MB. La foto propia reemplaza la de referencia.</small></div><label class="dp-check"><input type="checkbox" name="featured" ${item?.featured?'checked':''}> Destacado</label><details><summary>Opciones del producto: tamaños y adicionales</summary><p>Primero crea adicionales con un grupo (por ejemplo Tamaño o Extra). Agrega los grupos que este producto podrá elegir.</p><div id="dp-modifier-list"></div><button class="ghost" type="button" id="dp-add-modifier">＋ Grupo de opciones</button></details>`;
    if(catalogKind==='toppings')fields+=field('kind','Grupo de opciones',item?.kind||'Extra','text','required maxlength="60" list="dp-option-groups"')+field('price','Valor que se suma al precio base',item?.price||0,'number','required min="0" step="1"');
    if(catalogKind==='payments')fields+=field('account_value','Cuenta, llave o número (opcional)',item?.account_value||'')+`<label>Instrucciones<textarea name="instructions" maxlength="500">${esc(item?.instructions||'')}</textarea></label>`;
    if(catalogKind==='neighborhoods')fields+=field('delivery_fee','Valor del domicilio',item?.delivery_fee||0,'number','required min="0" step="1"');
    fields+=field('sort_order','Orden en la carta',item?.sort_order||0,'number','step="1"')+`<label class="dp-check"><input type="checkbox" name="available" ${item?.available!==false?'checked':''}> Disponible / visible</label>`;
    fields+='<datalist id="dp-option-groups">'+[...new Set((catalog.toppings||[]).map(item=>item.kind))].map(kind=>'<option value="'+esc(kind)+'"></option>').join('')+'</datalist>';
    $('#dp-item-fields').innerHTML=fields;$('#dp-item-error').textContent='';$('#dp-item-save').disabled=false;
    if(catalogKind==='products'){
      (item?.modifiers||[]).forEach(addModifier);$('#dp-add-modifier').onclick=()=>addModifier();
      $('#dp-remove-image').onclick=()=>{removeImage=true;$('#dp-item-form').image.value='';$('#dp-image-preview').src=window.DonPierosImages.example({name:$('#dp-item-form').elements.namedItem('name').value,category:$('#dp-item-form').category.value});};
      $('#dp-item-form').image.onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);$('#dp-image-preview').src=previewUrl;removeImage=false;};
    }
    $('#dp-item-dialog').showModal();
  }
  function addModifier(group={}){
    if($('#dp-modifier-list').children.length>=12)return;
    const wrapper=document.createElement('div');wrapper.className='dp-modifier';wrapper.dataset.groupId=group.id||crypto.randomUUID();
    wrapper.innerHTML=field('group_name','Nombre del selector',group.name||'Elige tus adicionales','text','required')+field('group_source','Grupo de adicionales',group.source||'Extra','text','required list="dp-option-groups"')+field('group_min','Mínimo',group.min||0,'number','min="0" max="30"')+field('group_max','Máximo',group.max||1,'number','min="1" max="30"')+`<label class="dp-check"><input name="group_required" type="checkbox" ${group.required?'checked':''}> Obligatorio</label><label class="dp-check"><input name="group_price" type="checkbox" ${group.usePrice!==false?'checked':''}> Sumar precio del adicional</label><button class="ghost" type="button">Quitar grupo</button>`;
    wrapper.querySelector('button').onclick=()=>wrapper.remove();$('#dp-modifier-list').append(wrapper);
  }

  async function uploadImage(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Elige JPG, PNG o WebP de hasta 5 MB.');
    const image=new Image(),url=URL.createObjectURL(file);let blob=file;
    try{image.src=url;await image.decode();const ratio=Math.min(1,1400/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const compressed=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(compressed)blob=compressed;}finally{URL.revokeObjectURL(url);}
    const extension=blob.type==='image/webp'?'webp':blob.type==='image/png'?'png':'jpg',path='products/'+crypto.randomUUID()+'.'+extension;
    const bucket=api().db.storage.from('product-images'),{error}=await bucket.upload(path,blob,{contentType:blob.type,upsert:false});if(error)throw error;
    return {path,url:bucket.getPublicUrl(path).data.publicUrl};
  }
  async function saveItem(event){
    event.preventDefault();const form=event.target,button=$('#dp-item-save');button.disabled=true;$('#dp-item-error').textContent='';let uploaded=null,saved=false;
    try{
      const item={...editItem,name:form.elements.namedItem('name').value.trim(),available:form.available.checked,sort_order:Number(form.sort_order.value)};
      if(catalogKind==='products'){
        Object.assign(item,{category:form.category.value.trim(),price:Number(form.price.value),description:form.description.value,badge:form.badge.value,featured:form.featured.checked});
        item.modifiers=$$('.dp-modifier').map(group=>({id:group.dataset.groupId,name:group.querySelector('[name=group_name]').value,source:group.querySelector('[name=group_source]').value,min:Number(group.querySelector('[name=group_min]').value),max:Number(group.querySelector('[name=group_max]').value),required:group.querySelector('[name=group_required]').checked,usePrice:group.querySelector('[name=group_price]').checked}));
        if(removeImage){item.image_url='';item.image_path='';}if(form.image.files?.[0]){button.textContent='Subiendo imagen…';uploaded=await uploadImage(form.image.files[0]);item.image_url=uploaded.url;item.image_path=uploaded.path;}
      }
      if(catalogKind==='toppings'){item.kind=form.kind.value.trim();item.price=Number(form.price.value);}
      if(catalogKind==='payments'){item.account_value=form.account_value.value;item.instructions=form.instructions.value;}
      if(catalogKind==='neighborhoods')item.delivery_fee=Number(form.delivery_fee.value);
      button.textContent='Guardando…';const result=await request('dp_save_catalog',{kind:catalogKind,item});saved=true;
      if(editItem?.image_path && editItem.image_path!==item.image_path)removeCatalogPhoto(editItem.image_path,'Producto guardado. La foto anterior quedó pendiente de retirar.');
      if(result.item){applyCatalogItem(catalogKind,result.item);renderCatalog();}else void loadCatalog();
      $('#dp-item-dialog').close();signal('catalog-changed');notify('Guardado.');
    }catch(error){$('#dp-item-error').textContent=friendly(error);
      // A lost response may hide a committed save. Keep the uploaded image until reconciliation.
      if(uploaded&&!saved)$('#dp-item-error').textContent+=' Actualiza antes de reintentar para comprobar el estado del producto.';
    }finally{button.disabled=false;button.textContent='Guardar';}
  }
  async function deleteItem(id){
    const item=catalog[catalogKind].find(row=>row.id===id);if(!item||!confirm('¿Eliminar “'+item.name+'” del menú? Las comandas anteriores conservarán su detalle.'))return;
    const kind=catalogKind,button=$(`[data-dp-delete="${CSS.escape(id)}"]`);if(button?.disabled)return;if(button){button.disabled=true;button.textContent='Eliminando…';}
    try{await request('dp_delete_catalog',{kind,id,version:item.version});catalogEpoch++;catalog[kind]=catalog[kind].filter(row=>row.id!==id);renderCatalog();if(item.image_path)removeCatalogPhoto(item.image_path,'Registro eliminado. La foto quedó pendiente de retirar.');signal('catalog-changed');notify('Registro eliminado.');}
    catch(error){if(button?.isConnected){button.disabled=false;button.textContent='Eliminar';}notify(error.message,true);}
  }
  function signal(event){if(channel)void channel.send({type:'broadcast',event,payload:{at:Date.now()}});}
  async function tick(){
    const token=api()?.getToken();if(!token||!api()?.getUser()||document.hidden)return;
    if(connectedToken!==token){connectedToken=token;revision='';firstLoad=true;
      if(channel)void api().db.removeChannel(channel);
      channel=api().db.channel('don-pieros-orders-live').on('broadcast',{event:'order-created'},()=>void loadOrders(true)).on('broadcast',{event:'order-updated'},()=>void loadOrders(true)).subscribe();
      if(canMenu())void loadCatalog();
    }
    if(canOrders())void loadOrders();
  }
  mount();setInterval(tick,6000);setTimeout(tick,1000);
  window.addEventListener('focus',()=>void tick());window.addEventListener('online',()=>void tick());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void tick();});
})();
