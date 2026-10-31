(() => {
  'use strict';
  const fulfillmentLabel=value=>value==='delivery'?'Domicilio':value==='dinein'?'Para comer en mesa':'Recoger en local';
  if(document.body.dataset.page !== 'admin') return;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v)||0);
  const date=v=>window.DonPierosDates.dateTime(v);
  const api=()=>window.DonPierosAdmin;
  const deletions=()=>window.DonPierosDeletions;
  const friendly=(value)=>window.DonPierosLanguage.message(value);
  const labels={nueva:'Nueva',atendiendo:'En preparación',lista:'Lista',despachada:'Despachada',cancelada:'Cancelada'};
  let orders=[],dashboardOrders=[],total=0,offset=0,revision='',busy=false,firstLoad=true,connectedToken='',channel=null,catalog=null,catalogKind='products',editItem=null,removeImage=false,previewUrl='';
  const seenOrderIds=new Set();
  const pendingAvailability=new Map();
  const orderWrites=new Map(),catalogWrites=new Map();
  let orderEpoch=0,activeCount=0;
  let catalogLoading=null,ordersReloadRequested=false,catalogEpoch=0,ordersController=null,dashboardRevision='',ordersView='';
  const receivedOrderSignals=new Map();
  const searchState={dashboard:{query:'',status:'active'},list:{query:'',status:'active'}};
  const searchCache=new Map(),searchJobs=new Map();
  const searchText=new WeakMap();
  let searchEpoch=0,searchTimer,newestOrderSequence=0;
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function matchesOrder(order,query){
    if(!query.trim())return true;
    let text=searchText.get(order);
    if(text===undefined){
      text=normalize([order.id,order.sequence,order.customerName,order.phone,order.address,order.neighborhood,order.notes,
        labels[order.status],fulfillmentLabel(order.fulfillment),order.paymentMethod,order.paymentValue,
        order.total,money(order.total),date(order.createdAt),...(order.items||[]).flatMap(item=>[item.name,item.quantity,...(item.selections||[])])].join(' '));
      searchText.set(order,text);
    }
    return normalize(query).split(' ').filter(Boolean).every(word=>text.includes(word));
  }
  function receptionFilters(scope){return `<div class="dp-reception-filters"><label class="dp-order-search"><span>Buscar pedido</span><input type="search" data-dp-search="${scope}" placeholder="Cliente, teléfono, producto, tamaño…" autocomplete="off" aria-label="Buscar pedidos por cualquier información"></label><label>Estado<select data-dp-filter="${scope}" ${scope==='list'?'id="dp-order-filter"':''}><option value="active">En cola</option><option value="all">Todos en recepción</option>${Object.entries(labels).filter(([value])=>value!=='despachada').map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label></div>`;}
  function searchRows(scope,fallback){
    const {status,query}=searchState[scope],saved=searchCache.get(status);
    return overlayOrders((query||status!=='active')&&saved?.revision===dashboardRevision?saved.rows:fallback).filter(order=>!deletions()?.hidden('web-order',order.id)&&order.status!=='despachada'
      &&(status==='active'?['nueva','atendiendo','lista'].includes(order.status):status==='all'||order.status===status)&&matchesOrder(order,query));
  }
  async function ensureSearchRows(scope){
    const status=searchState[scope].status;
    if(!searchState[scope].query&&status==='active')return;
    if(searchCache.get(status)?.revision===dashboardRevision)return;
    if(searchJobs.has(status))return searchJobs.get(status);
    const epoch=searchEpoch,token=api()?.getToken();
    const job=(async()=>{
      let rows=[],page=0,version='',restarts=0;
      do{
        const result=await request('dp_get_orders',{status,offset:page,limit:100},15000);
        if(epoch!==searchEpoch||token!==api()?.getToken())return;
        if(version&&version!==result.revision){
          // An order may change while a multi-page search is in flight. Restart
          // on the new revision instead of presenting mixed or partial results.
          rows=[];page=0;version='';
          if(++restarts>2){setTimeout(()=>void ensureSearchRows(scope),250);return;}
          continue;
        }
        version=result.revision;rows.push(...result.orders);page+=100;
        if(page>=result.total)break;
      }while(true);
      searchCache.set(status,{rows,revision:version});
    })().catch(error=>notify(error.message,true)).finally(()=>{
      if(searchJobs.get(status)===job)searchJobs.delete(status);
      renderOrders();renderDashboard(dashboardOrders,$('#dp-nav-count').textContent||0);
    });
    searchJobs.set(status,job);renderOrders();renderDashboard(dashboardOrders,$('#dp-nav-count').textContent||0);return job;
  }
  let paperWidth=80;
  try{if(localStorage.getItem('don_pieros_order_paper')==='58')paperWidth=58;}catch(_){}
  function paperControl(){return `<label class="dp-paper-control">Papel<select data-dp-paper aria-label="Ancho del papel de la comanda"><option value="80" ${paperWidth===80?'selected':''}>80 mm</option><option value="58" ${paperWidth===58?'selected':''}>58 mm</option></select></label>`;}
  function findOrder(id){
    if(deletions()?.hidden('web-order',id))return null;
    if(orderWrites.has(id))return orderWrites.get(id).after;
    const saved=orders.find(order=>String(order.id)===String(id))||dashboardOrders.find(order=>String(order.id)===String(id))
      ||[...searchCache.values()].flatMap(entry=>entry.rows).find(order=>String(order.id)===String(id));
    return saved?{...saved,phone:String(saved.phone??''),items:(Array.isArray(saved.items)?saved.items:[]).map(item=>({...item,selections:Array.isArray(item.selections)?item.selections:[]}))}:null;
  }
  const notify=(text,error=false)=>api()?.notify(friendly(text),error?'error':'ok');
  const canOrders=()=>{const u=api()?.getUser();return u && (u.role==='boss'||u.role==='waiter'||u.role==='admin'&&(!Array.isArray(u.permissions)||u.permissions.includes('dashboard')||u.permissions.includes('service')));};
  const canMenu=()=>{const u=api()?.getUser();return u && (u.role==='boss'||u.role==='admin'&&(!Array.isArray(u.permissions)||u.permissions.includes('inventory')));};

  async function request(action,payload={},timeoutMs=45000,signal){
    const url=window.DON_PIEROS_CONFIG.appsScriptUrl;
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))throw new Error('La conexión del negocio necesita revisión. Contacta al responsable.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    const cancel=()=>controller.abort();
    if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    try{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload,authToken:api()?.getToken()||'',origin:location.origin}),signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('No pudimos completar la solicitud. Intenta de nuevo en unos segundos.');
      const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo completar la operación.');return result;
    }catch(error){if(error.name==='AbortError'&&!signal?.aborted)throw new Error('La respuesta está tardando. Actualiza para comprobar si se guardó.');throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }

  function mount(){
    const main=$('.admin-app');
    main.insertAdjacentHTML('beforeend',`
      <section class="panel dp-panel" id="onlineorders" data-admin-section="onlineorders">
        <div class="section-head"><div><span class="eyebrow">Recepción de pedidos</span><h2>Pedidos web</h2><p id="dp-orders-status" role="status">Esperando conexión…</p></div><button class="ghost" id="dp-orders-refresh" type="button">↻ Actualizar</button></div>
        <div class="dp-toolbar">${receptionFilters('list')}${paperControl()}<a class="ghost" href="index.html" target="_blank" rel="noopener">Abrir carta ↗</a></div>
        <p id="dp-list-result" class="dp-muted" role="status"></p><div class="dp-orders" id="dp-orders-list"></div><div class="dp-pagination"><button class="ghost" id="dp-prev">← Anteriores</button><span id="dp-page"></span><button class="ghost" id="dp-next">Siguientes →</button></div>
      </section>
      <section class="panel dp-panel" id="webmenu" data-admin-section="webmenu">
        <div class="section-head"><div><span class="eyebrow">Carta del cliente</span><h2>Menú online</h2><p>Administra tus productos, precios y fotografías en un solo lugar.</p></div><a class="ghost" href="index.html" target="_blank" rel="noopener">Ver carta ↗</a></div>
        <div class="dp-connection" id="dp-connection"><div><strong>Conexión del negocio</strong><p>Tu carta y tus pedidos se mantienen actualizados.</p></div><button class="ghost" type="button" id="dp-check-connection">Comprobar conexión</button><small id="dp-connection-status" role="status"></small></div>
        <div class="dp-toolbar"><div class="dp-tabs" id="dp-catalog-tabs"><button type="button" data-catalog="products" class="active">Productos</button><button type="button" data-catalog="toppings">Tamaños y opciones</button><button type="button" data-catalog="payments">Pagos</button><button type="button" data-catalog="neighborhoods">Barrios</button></div><div><button class="ghost" id="dp-menu-refresh" type="button">↻ Actualizar</button> <button class="primary" id="dp-add-item" type="button">＋ Agregar</button></div></div>
        <label class="dp-category-filter" id="dp-category-filter">Categoría<select id="dp-menu-category"><option value="">Todas las categorías</option></select></label><p id="dp-menu-status" role="status"></p><div id="dp-catalog-list"></div>
      </section>`);
    $('#alertsPanel').insertAdjacentHTML('afterend','<div id="dp-dashboard-orders" class="dp-dashboard-orders"></div>');
    document.body.insertAdjacentHTML('beforeend',`<dialog id="dp-order-dialog" class="dp-dialog" aria-labelledby="dp-order-title"><div class="dp-dialog-card"><button class="dp-close" type="button" data-dp-close aria-label="Cerrar">×</button><div id="dp-order-detail"></div></div></dialog><dialog id="dp-item-dialog" class="dp-dialog"><form id="dp-item-form" class="dp-dialog-card"><button class="dp-close" type="button" data-dp-close aria-label="Cerrar">×</button><span class="eyebrow">Menú online</span><h2 id="dp-item-title"></h2><div id="dp-item-fields"></div><p id="dp-item-error" role="alert"></p><div class="dp-form-actions"><button class="ghost" type="button" data-dp-close>Cancelar</button><button class="primary" id="dp-item-save" type="submit">Guardar</button></div></form></dialog>`);
    // Bind reception cards directly: opening a comanda is entirely local and is
    // independent of the rest of the page's delegated click handlers.
    for(const root of [$('#dp-orders-list'),$('#dp-dashboard-orders')]){
      root.addEventListener('click',event=>{
        const card=event.target.closest('[data-dp-order]');if(!card)return;
        event.preventDefault();event.stopPropagation();
        if(event.target.closest('[data-dp-remove-order]'))void deleteOrder(card.dataset.dpOrder);
        else if(event.target.closest('[data-dp-print]')){const order=findOrder(card.dataset.dpOrder);if(order&&canOrders())printOrder(order,paperWidth);}
        else openOrder(card.dataset.dpOrder);
      });
      root.addEventListener('keydown',event=>{
        if(!event.target.matches('[data-dp-order]')||!['Enter',' '].includes(event.key))return;
        event.preventDefault();openOrder(event.target.dataset.dpOrder);
      });
    }
    document.addEventListener('change',event=>{
      if(!event.target.matches('[data-dp-paper]'))return;
      paperWidth=event.target.value==='58'?58:80;
      try{localStorage.setItem('don_pieros_order_paper',String(paperWidth));}catch(_){}
      $$('[data-dp-paper]').forEach(select=>{select.value=String(paperWidth);});
    });
    $('#dp-orders-refresh').onclick=()=>void loadOrders(true);
    document.addEventListener('input',event=>{
      const scope=event.target.dataset.dpSearch;if(!searchState[scope])return;
      searchState[scope].query=event.target.value;scope==='list'?renderOrders():renderDashboard(dashboardOrders,$('#dp-nav-count').textContent||0);
      clearTimeout(searchTimer);searchTimer=setTimeout(()=>void ensureSearchRows(scope),180);
    });
    document.addEventListener('change',event=>{
      const scope=event.target.dataset.dpFilter;if(!searchState[scope])return;
      searchState[scope].status=event.target.value;
      if(scope==='list'){offset=0;revision='';void loadOrders(true);}
      else renderDashboard(dashboardOrders,$('#dp-nav-count').textContent||0);
      void ensureSearchRows(scope);
    });
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

  async function loadOrders(force=false,urgent=false){
    if(!canOrders()||!window.DON_PIEROS_CONFIG.appsScriptUrl)return;
    if(busy){if(!urgent){if(force)ordersReloadRequested=true;return;}ordersController?.abort();}
    const controller=new AbortController(),token=api().getToken(),readEpoch=orderEpoch;ordersController=controller;
    ordersReloadRequested=false;
    busy=true;
    if(force)$('#dp-orders-status').textContent='Actualizando pedidos…';
    try{
      const filter=$('#dp-order-filter').value;
      const pageOffset=offset;
      const view=filter+':'+pageOffset;
      // The same request checks the revision and returns changed orders. Avoid
      // paying for a separate status round trip before every changed list.
      const [result,activeResult]=await Promise.all([request('dp_get_orders',{status:filter,offset:pageOffset,limit:60,...(!force&&revision&&ordersView===view?{revision}:{})},15000,controller.signal),
        filter==='active'&&pageOffset===0?Promise.resolve(null):request('dp_get_orders',{status:'active',offset:0,limit:20,...(!force&&dashboardRevision?{revision:dashboardRevision}:{})},15000,controller.signal)]);
      if(controller!==ordersController||controller.signal.aborted||token!==api().getToken())return;
      if(readEpoch!==orderEpoch){ordersReloadRequested=true;return;}
      if(filter!==$('#dp-order-filter').value||pageOffset!==offset){ordersReloadRequested=true;return;}
      if(result.changed!==false&&pageOffset>0&&pageOffset>=result.total){offset=Math.max(0,Math.floor((result.total-1)/60)*60);revision='';ordersReloadRequested=true;return;}
      const active=activeResult||result;
      if(readEpoch===orderEpoch)for(const row of [...(result.orders||[]),...(active.orders||[])]){
        const write=orderWrites.get(row.id);
        if(write&&!write.pending&&write.after&&Number(row.version)>=Number(write.after.version))orderWrites.delete(row.id);
      }
      const listChanged=result.changed!==false&&(firstLoad||result.revision!==revision||ordersView!==view);
      const activeChanged=active.changed!==false&&(firstLoad||active.revision!==dashboardRevision);
      if(activeChanged){
        if(active.orders.length>=active.total)for(const previous of dashboardOrders)if(!active.orders.some(order=>order.id===previous.id&&order.status==='nueva'))window.DonPierosReception?.dismiss('order:'+previous.id);
        dashboardOrders=active.orders;dashboardRevision=active.revision;searchEpoch++;searchCache.clear();searchJobs.clear();
      }
      const arrived=firstLoad?[]:overlayOrders(dashboardOrders).filter(o=>!deletions()?.hidden('web-order',o.id)&&o.status==='nueva'&&!seenOrderIds.has(o.id)&&Number(o.sequence)>newestOrderSequence);
      newestOrderSequence=Math.max(newestOrderSequence,...dashboardOrders.map(order=>Number(order.sequence)||0));
      dashboardOrders.forEach(o=>seenOrderIds.add(o.id));
      firstLoad=false;
      if(listChanged){orders=result.orders;total=result.total;revision=result.revision;ordersView=view;renderOrders();}
      if(activeChanged){activeCount=Number(active.activeCount)||0;renderDashboard(dashboardOrders,activeCount);}
      for(const order of overlayOrders(dashboardOrders))if(!deletions()?.hidden('web-order',order.id)&&receivedOrderSignals.has(order.id))confirmReception(order.id);
      if(arrived.length&&api().getUser()?.role!=='waiter'){
        api().announceWebOrders(arrived);
        for(const order of arrived)window.DonPierosReception?.show({key:'order:'+order.id,kind:'order',title:order.customerName,
          detail:`${order.id} · ${fulfillmentLabel(order.fulfillment)}\n${order.items.map(item=>`${item.quantity} × ${item.name}`).join(', ')}\n${money(order.total)}`,
          action:()=>openOrder(order.id)});
      }
      for(const order of dashboardOrders)if(order.status!=='nueva')window.DonPierosReception?.dismiss('order:'+order.id);
      if(activeChanged){void ensureSearchRows('dashboard');void ensureSearchRows('list');}
      $('#dp-orders-status').textContent='Conectado · Recepción automática activa · '+window.DonPierosDates.time(Date.now());
    }catch(error){if(controller.signal.aborted||controller!==ordersController)return;$('#dp-orders-status').textContent=friendly(error);if(force)notify(error.message,true);}
    finally{if(controller===ordersController){busy=false;ordersController=null;if(ordersReloadRequested){ordersReloadRequested=false;void loadOrders(true);}}}
  }

  function orderCard(order){return `<article class="dp-order-card dp-state-${esc(order.status)}" data-dp-order="${esc(order.id)}" tabindex="0" aria-label="Pedido ${esc(order.id)} de ${esc(order.customerName)}"><div><span class="dp-status">${labels[order.status]||esc(order.status)}</span><small>${esc(date(order.createdAt))}</small></div><h3>${esc(order.customerName)}</h3><p>${esc(order.id)} · ${fulfillmentLabel(order.fulfillment)}</p><p>${order.items.reduce((sum,item)=>sum+Number(item.quantity),0)} producto(s) · ${esc(order.items.map(i=>i.quantity+' × '+i.name).join(', '))}</p><footer><strong>${money(order.total)}${order.deliveryFeePending?'<small> + domicilio por confirmar</small>':''}</strong><div class="dp-card-actions"><button type="button" class="dp-view-order" data-dp-view>Ver comanda <span aria-hidden="true">→</span></button><button type="button" class="dp-print-card" data-dp-print><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4V9h16v9h-2M6 14h12v7H6zM17 11h.01"/></svg>Imprimir comanda</button><button type="button" class="dp-remove-order" data-dp-remove-order>Eliminar</button></div></footer></article>`;}
  function overlayOrders(rows){
    const next=new Map(rows.map(row=>[row.id,row]));
    for(const [id,write] of orderWrites){
      if(!write.after)next.delete(id);
      else if(next.has(id))next.set(id,write.after);
    }
    return [...next.values()].filter(row=>row.status!=='cobrada');
  }
  function adjustedCount(rows,count,filter){
    const matches=row=>row&&row.status!=='eliminada'&&(filter==='all'||(filter==='active'?['nueva','atendiendo','lista'].includes(row.status):row.status===filter));
    for(const row of rows){const write=orderWrites.get(row.id);if(deletions()?.hidden('web-order',row.id))count-=Number(!!matches(row));else if(write)count+=Number(!!matches(write.after))-Number(!!matches(row));}
    return Math.max(0,Number(count)||0);
  }
  function repaintOrders(){renderOrders();renderDashboard(dashboardOrders,activeCount);}
  async function mutateOrder(order,after,action,payload){
    if(!canOrders()||orderWrites.get(order.id)?.pending)return;
    const token=api().getToken(),write={before:order,after,pending:true};
    orderEpoch++;orderWrites.set(order.id,write);
    window.DonPierosReception?.dismiss('order:'+order.id);$('#dp-order-dialog').close();repaintOrders();
    try{
      const result=await request(action,{id:order.id,version:order.version,...payload});
      if(token!==api().getToken())return;
      write.pending=false;if(result.order)write.after=result.order;orderEpoch++;
      revision='';dashboardRevision='';searchEpoch++;searchCache.clear();
      repaintOrders();signal('order-updated');void loadOrders(true);
      notify(after?'Estado del pedido actualizado.':'Pedido eliminado.');
    }catch(error){
      if(token!==api().getToken())return;
      orderWrites.delete(order.id);orderEpoch++;repaintOrders();
      notify('No pudimos confirmar el cambio. Restauramos el pedido mientras verificamos. '+error.message,true);void loadOrders(true);
    }
  }
  async function deleteOrder(id){
    const order=findOrder(id);if(!order||orderWrites.get(id)?.pending||!canOrders())return;
    const token=api().getToken();
    if(!await window.DonPierosDialogs.confirm({key:'delete-order:'+id,title:'¿Eliminar este pedido?',message:order.id+' · '+order.customerName+'\nSe retirará de Pedidos web y del inicio.',accept:'Eliminar pedido',danger:true}))return;
    if(token!==api().getToken()||!canOrders()||!findOrder(id)||orderWrites.get(id)?.pending)return;
    try{
      deletions().enqueue('web-order',id,{id,version:order.version});
      window.DonPierosReception?.dismiss('order:'+id);$('#dp-order-dialog').close();repaintOrders();
      notify('Pedido retirado. Se está sincronizando.');
    }catch(error){notify('No pudimos guardar la solicitud de eliminación. '+friendly(error),true);}
  }
  function renderOrders(){
    const rows=searchRows('list',orders),searching=!!searchState.list.query||searchState.list.status!=='active';
    const visibleTotal=adjustedCount(orders,total,searchState.list.status);
    $('#dp-orders-list').innerHTML=rows.map(orderCard).join('')||'<div class="dp-empty">No encontramos pedidos con esta búsqueda y estado.</div>';
    $('#dp-page').textContent=visibleTotal?`${offset+1}–${Math.min(offset+60,visibleTotal)} de ${visibleTotal}`:'Sin pedidos';$('#dp-prev').disabled=offset===0;$('#dp-next').disabled=offset+60>=visibleTotal;
    $('#dp-page').closest('.dp-pagination').hidden=searching;
    $('#dp-list-result').textContent=searching?(searchJobs.has(searchState.list.status)?'Buscando en todos los pedidos…':`${rows.length} pedido${rows.length===1?'':'s'} encontrado${rows.length===1?'':'s'}`):'';
  }
  function renderDashboard(rows,count){
    count=adjustedCount(rows,activeCount,'active');$('#dp-nav-count').textContent=count||'';
    const root=$('#dp-dashboard-orders');
    if(!$('#dp-dashboard-order-list'))root.innerHTML=`<div class="section-head"><h3>Pedidos de la carta <span class="dp-count"></span></h3><div class="dp-dashboard-controls">${paperControl()}<a href="#onlineorders">Ver todos →</a></div></div>${receptionFilters('dashboard')}<p id="dp-dashboard-result" class="dp-muted" role="status"></p><div id="dp-dashboard-order-list"></div>`;
    root.querySelector('.dp-count').textContent=count;
    const source=searchRows('dashboard',rows),searching=!!searchState.dashboard.query||searchState.dashboard.status!=='active';
    const visible=searching?source:source.slice(0,6);
    $('#dp-dashboard-result').textContent=searching?`${source.length} pedido${source.length===1?'':'s'} encontrado${source.length===1?'':'s'}${searchJobs.has(searchState.dashboard.status)?' · Buscando en los demás pedidos…':''}`:'';
    $('#dp-dashboard-order-list').innerHTML=visible.map(orderCard).join('')||'<p class="dp-muted">No hay pedidos que coincidan con esta búsqueda y estado.</p>';
  }

  function openOrder(id){
    if(!canOrders())return;
    const order=findOrder(id);if(!order)return;
    const units=order.items.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
    $('#dp-order-detail').innerHTML=`
      <header class="dp-order-heading dp-state-${esc(order.status)}"><div><span class="eyebrow">Don Pieros Pizza · Comanda</span><h2>Pedido ${esc(order.sequence||String(order.id).split('-').at(-1))}</h2><p>${esc(order.id)}<br><time>${esc(date(order.createdAt))}</time></p></div><span class="dp-status dp-detail-status">${labels[order.status]||esc(order.status)}</span></header>
      <div class="dp-order-layout">
        <section class="dp-order-products"><div class="dp-products-heading"><h3>Productos para preparar</h3><span>${units} ${units===1?'unidad':'unidades'}</span></div>
          <div class="dp-detail-lines">${order.items.map(item=>`<article><span class="dp-item-quantity">${Number(item.quantity)||0} ×</span><div><strong>${esc(item.name)}</strong>${item.selections.length?`<ul>${item.selections.map(selection=>`<li>${esc(kitchenSelection(selection))}</li>`).join('')}</ul>`:''}</div></article>`).join('')}</div>
          ${order.notes?`<div class="dp-notes"><strong>Indicaciones para cocina</strong><p>${esc(order.notes)}</p></div>`:''}
        </section>
        <aside class="dp-order-summary"><section class="dp-order-customer"><small>DATOS DEL CLIENTE</small><h3>${esc(order.customerName)}</h3>${order.phone?`<a href="tel:${esc(order.phone.replace(/[^+\d]/g,''))}">${esc(order.phone)}</a>`:''}<div class="dp-fulfillment-label">${fulfillmentLabel(order.fulfillment)}</div>${order.fulfillment==='delivery'?`<p><strong>Barrio:</strong> ${esc(order.neighborhood)}<br><strong>Dirección:</strong> ${esc(order.address)}</p>`:''}</section>
          <div class="dp-totals">${order.packagingFee?`<p>Cajas para llevar <b>${money(order.packagingFee)}</b></p>`:''}${order.fulfillment==='delivery'?`<p>Productos <b>${money(order.subtotal)}</b></p><p>Domicilio <b>${order.deliveryFeePending?'Por confirmar':money(order.deliveryFee)}</b></p>`:''}<p class="dp-total"><span>${order.deliveryFeePending?'Total de productos':'Total del pedido'}</span><b>${money(order.total)} <small>COP</small></b></p><p class="dp-payment-method"><span>Forma de pago</span><strong>${esc(order.paymentMethod)}</strong></p>${order.paymentValue?`<small>${esc(order.paymentValue)}</small>`:''}</div>
          <p class="dp-muted">Turno ${Number(order.queuePosition)||1}${order.handledByName?' · Atendido por '+esc(order.handledByName):''}</p>
        </aside>
      </div>
      <div class="dp-order-actions">${['boss','admin'].includes(api().getUser()?.role)?'<button class="primary dp-charge-order" id="dp-charge-order" type="button">Cobrar pedido</button>':''}<button class="ghost" id="dp-print-order" type="button">▤ Imprimir comanda</button><label>Papel<select id="dp-print-width"><option value="80">80 mm</option><option value="58">58 mm</option></select></label>${order.phone?`<a class="ghost" href="https://wa.me/${esc(order.phone.replace(/\D/g,'').replace(/^(\d{10})$/,'57$1'))}?text=${encodeURIComponent('🍕 Hola '+order.customerName+', somos Don Pieros Pizza. Tu pedido '+order.id+' está recibido.')}" target="_blank" rel="noopener">WhatsApp ↗</a>`:''}<button class="ghost dp-remove-order" id="dp-delete-order" type="button">Eliminar pedido</button></div><p id="dp-order-error" role="alert"></p>`;
    $('#dp-delete-order').disabled=!!orderWrites.get(id)?.pending;
    if($('#dp-charge-order'))$('#dp-charge-order').onclick=()=>void checkoutOrder(id);
    $('#dp-delete-order').onclick=()=>void deleteOrder(id);
    $('#dp-print-order').onclick=()=>printOrder(order,Number($('#dp-print-width').value));
    $('#dp-print-width').setAttribute('data-dp-paper','');$('#dp-print-width').value=String(paperWidth);
    const dialog=$('#dp-order-dialog');
    $('#dp-order-detail h2').id='dp-order-title';
    dialog.querySelector('.dp-dialog-card').scrollTop=0;
    if(!dialog.open)dialog.showModal();
    window.DonPierosReception?.dismiss('order:'+id);
  }

  async function checkoutOrder(id){
    const button=$('#dp-charge-order');if(button)button.disabled=true;
    try{
      const result=await request('dp_get_order',{id}),order=result.order;
      if(result.checkoutAvailable!==true)throw new Error('Actualiza Apps Script a la versión 3.6.0 para cobrar pedidos web.');
      if(!order||['cobrada','eliminada','cancelada'].includes(order.status))throw new Error('Este pedido ya fue cobrado o retirado. Actualiza la recepción.');
      let fee=Number(order.deliveryFee||0);
      if(order.deliveryFeePending){
        const value=await window.DonPierosDialogs.prompt({title:'Confirmar domicilio',message:'Escribe el valor acordado del domicilio antes de cobrar el pedido.',label:'Valor en pesos colombianos',value:'0',accept:'Continuar al cobro'});
        if(value===null)return;
        if(!/^\s*\$?[\d.\s]+\s*$/.test(value))throw new Error('Escribe un valor de domicilio válido.');
        fee=Number(value.replace(/[^\d]/g,''));if(!Number.isSafeInteger(fee)||fee<0||fee>100000000)throw new Error('Valor de domicilio inválido.');
      }
      $('#dp-order-dialog').close();api().openWebOrderCheckout(order,fee);
    }catch(error){notify(String(error.message||error),true);}finally{if(button?.isConnected)button.disabled=false;}
  }
  window.addEventListener('don-pieros-web-order-paid',event=>{
    const id=event.detail?.id;if(!id)return;
    const before=findOrder(id);orderWrites.set(id,{before,after:null,pending:false});repaintOrders();void loadOrders(true);
  });

  function kitchenSelection(value){
    return String(value??'').replace(/\s*\(\s*\+\s*\$[\d.,\s]+\)\s*$/,'')
      .replace(/^elige\s+(?:el\s+)?tama[ñn]o\s*:/i,'Tamaño:')
      .replace(/^sabor de la segunda mitad\s*:/i,'Segunda mitad:').trim();
  }
  function printOrder(order,width){
    width=width===58?58:80;
    const popup=window.open('','don-pieros-comanda','width=420,height=720');
    if(!popup){notify('Permite las ventanas emergentes para imprimir la comanda.',true);return;}
    const units=order.items.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
    const d=popup.document;d.open();d.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ${esc(order.id)}</title><style>
      @page{size:${width}mm auto;margin:0}*{box-sizing:border-box;color:#000!important;font-weight:900!important}
      html{background:#fff}body{font:${width===58?'12':'14'}px/1.4 Arial,Helvetica,sans-serif;color:#000;background:#fff;margin:0;padding:0;width:${width}mm}
      .kitchen-ticket{border:1px solid #000;padding:2mm}
      h1{font-size:${width===58?'15':'17'}px;line-height:1.15;text-align:center;margin:0 0 5px}h2{font-size:18px;margin:7px 0}p{margin:5px 0;overflow-wrap:anywhere}
      .center{text-align:center}.rule{border-top:1px dashed #000;margin:6px 0}.order-number{font-size:20px;font-weight:900;text-align:center;margin:8px 0}
      .fulfillment{border:2px solid #000;padding:7px 3px;text-align:center;font-weight:900;margin:10px 0}.customer{font-weight:800;font-size:15px}
      .kitchen-item{border-bottom:1px dashed #000;padding:6px 0;break-inside:avoid;page-break-inside:avoid}.kitchen-item h3{font-size:${width===58?'17':'20'}px;line-height:1.25;margin:0 0 7px;overflow-wrap:anywhere}
      .options{padding-left:17px;margin:0}.options li{font-size:${width===58?'14':'16'}px;font-weight:700;margin:5px 0;overflow-wrap:anywhere}
      ${window.DonPierosThermal.sizeStyle}
      .notes{border:2px solid #000;padding:8px;margin:13px 0;break-inside:avoid;page-break-inside:avoid}.notes strong{display:block;font-size:14px}.notes p{white-space:pre-wrap;font-weight:700}
      .total{font-size:12px;font-weight:900}.total-amount{display:block;font-size:21px}.total-amount small{font-size:10px}.payment{border-top:1px solid #000;padding-top:8px;font-weight:700}footer{font-size:12px;font-weight:900;text-align:center;margin-top:8px}
      </style></head><body><main class="kitchen-ticket"><h1>DON PIEROS PIZZA</h1><p class="center"><strong>COMANDA DE COCINA</strong></p>
      <div class="order-number">PEDIDO ${esc(order.sequence||String(order.id).split('-').at(-1))}</div><p class="center">${esc(order.id)}</p><p class="center">${esc(date(order.createdAt))}</p>
      <div class="fulfillment">${fulfillmentLabel(order.fulfillment)}</div><p class="customer">${esc(order.customerName)}</p>${order.phone?`<p>Teléfono: ${esc(order.phone)}</p>`:''}
      ${order.fulfillment==='delivery'?`<p><strong>Barrio: ${esc(order.neighborhood)}</strong></p><p>Dirección: ${esc(order.address)}</p>`:''}
      <div class="rule"></div><p><strong>PREPARAR · ${units} ${units===1?'UNIDAD':'UNIDADES'}</strong></p>
      ${order.items.map(item=>`<section class="kitchen-item"><h3>${Number(item.quantity)||0} × ${esc(item.name)}</h3>${item.selections.length?`<ul class="options">${item.selections.map(selection=>{const option=window.DonPierosThermal.sizeOption(kitchenSelection(selection));return `<li class="${option.isSize?'size-option':''}">${option.html}</li>`;}).join('')}</ul>`:''}</section>`).join('')}
      ${order.notes?`<section class="notes"><strong>INDICACIONES PARA COCINA</strong><p>${esc(order.notes)}</p></section>`:''}
      <div class="rule"></div>${order.deliveryFeePending?'<p>Domicilio por confirmar</p>':''}
      ${order.packagingFee?`<p>Cajas para llevar: <strong>${money(order.packagingFee)}</strong></p>`:''}<p class="total">${order.deliveryFeePending?'TOTAL DE PRODUCTOS':'TOTAL'}:<span class="total-amount">${money(order.total)} <small>COP</small></span></p><p class="payment">Pago: ${esc(order.paymentMethod)}</p>
      </main></body></html>`);d.close();
    // Measure the complete receipt before printing; paper height grows with all
    // products and notes instead of clipping to a fixed page or a tiny viewport.
    void window.DonPierosThermal.print(popup,width).catch(error=>{
      notify('No se pudo preparar la impresión. '+String(error.message||error),true);
    });
  }

  async function loadCatalog(){
    if(!canMenu())return;
    if(catalogLoading)return catalogLoading;
    const readEpoch=catalogEpoch;
    $('#dp-menu-status').textContent='Cargando menú…';
    catalogLoading=(async()=>{
      try{const next=await request('dp_admin_catalog');if(readEpoch!==catalogEpoch&&catalog){$('#dp-menu-status').textContent='Menú actualizado con tus cambios recientes.';return;}catalog=next;
        for(const [key,write] of catalogWrites){
          const [kind,id]=key.split(':');
          const incoming=catalog[kind].find(item=>item.id===id);
          if(!write.pending&&(!write.after&&!incoming||write.after&&incoming&&Number(incoming.version)>=Number(write.after.version))){catalogWrites.delete(key);continue;}
          catalog[kind]=catalog[kind].filter(item=>item.id!==id);
          if(write.after)catalog[kind].push(write.after);
        }
        catalog.products=catalog.products.map(item=>pendingAvailability.get(item.id)||item);renderCatalog();$('#dp-menu-status').textContent='Menú actualizado. Los cambios llegan a la carta al actualizar o en menos de un minuto.';}
      catch(error){$('#dp-menu-status').textContent=friendly(error);}finally{catalogLoading=null;}
    })();return catalogLoading;
  }
  function applyCatalogItem(kind,item){catalogEpoch++;catalog[kind]=[...(catalog[kind]||[]).filter(row=>row.id!==item.id),item].sort((a,b)=>a.sort_order-b.sort_order||String(a.name).localeCompare(String(b.name)));}
  function removeCatalogPhoto(path,message){void api().db.storage.from('product-images').remove([path]).then(({error})=>{if(error)notify(message,true);}).catch(()=>notify(message,true));}
  function renderCatalog(){
    if(!catalog){$('#dp-catalog-list').innerHTML='<div class="dp-empty">Actualiza el menú para ver y editar tus productos.</div>';return;}
    let rows=(catalog[catalogKind]||[]).filter(item=>!deletions()?.hidden('catalog-'+catalogKind,item.id));
    const select=$('#dp-menu-category'),selected=select.value,categories=[...new Set((catalog.products||[]).map(p=>p.category))];
    select.innerHTML='<option value="">Todas las categorías</option>'+categories.map(c=>`<option value="${esc(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('');$('#dp-category-filter').hidden=catalogKind!=='products';
    if(catalogKind==='products'&&select.value)rows=rows.filter(item=>item.category===select.value);
    const card=item=>`<article class="dp-menu-card ${item.available?'':'dp-menu-unavailable'}">${catalogKind==='products'?`<img src="${esc(window.DonPierosImages.resolve(item))}" alt="${esc(item.name)}" loading="lazy">`:''}<div><small>${esc(item.category||item.kind||'')}</small><h3>${esc(item.name)}</h3><p>${catalogKind==='products'||catalogKind==='toppings'?money(item.price):catalogKind==='neighborhoods'?money(item.delivery_fee):esc(item.account_value||'Sin dato de cuenta')}</p><span class="dp-status">${item.available?'Disponible':'Agotado / desactivado'}</span></div><footer>${catalogKind==='products'?`<button class="dp-availability ${item.available?'is-available':''}" data-dp-availability="${esc(item.id)}" type="button">${item.available?'● Disponible':'○ Agotado'}</button>`:''}<button class="ghost" data-dp-edit="${esc(item.id)}">Editar</button><button class="ghost" data-dp-delete="${esc(item.id)}">Eliminar</button></footer></article>`;
    $('#dp-catalog-list').innerHTML=rows.length?(catalogKind==='products'?categories.filter(c=>rows.some(p=>p.category===c)).map(c=>`<section class="dp-category-section"><h3>${esc(c)} <small>${rows.filter(p=>p.category===c).length}</small></h3><div class="dp-menu-grid">${rows.filter(p=>p.category===c).map(card).join('')}</div></section>`).join(''):`<div class="dp-menu-grid">${rows.map(card).join('')}</div>`):'<div class="dp-empty">Sin registros. Agrega el primero para comenzar.</div>';
    $$('[data-dp-edit]').forEach(button=>{const id=button.dataset.dpEdit;if(!pendingAvailability.has(id)&&!catalogWrites.get(catalogKind+':'+id)?.pending)return;const card=button.closest('.dp-menu-card');card.setAttribute('aria-busy','true');card.querySelectorAll('button').forEach(control=>{control.disabled=true;});});
  }
  async function toggleAvailability(button){
    const item=catalog.products.find(p=>p.id===button.dataset.dpAvailability);if(!item)return;button.disabled=true;
    if(pendingAvailability.has(item.id))return;
    catalogWrites.delete('products:'+item.id);
    const optimistic={...item,available:!item.available};pendingAvailability.set(item.id,optimistic);applyCatalogItem('products',optimistic);renderCatalog();
    const card=$(`[data-dp-availability="${CSS.escape(item.id)}"]`)?.closest('.dp-menu-card');card?.setAttribute('aria-busy','true');card?.querySelectorAll('button').forEach(control=>{control.disabled=true;});
    $('#dp-menu-status').textContent='Guardando disponibilidad…';
    try{const result=await request('dp_save_catalog',{kind:'products',item:optimistic});pendingAvailability.delete(item.id);applyCatalogItem('products',result.item);renderCatalog();$('#dp-menu-status').textContent='Disponibilidad guardada.';signal('catalog-changed');notify(result.item.available?'Producto disponible.':'Producto agotado: el cliente no podrá pedirlo.');}
    catch(error){pendingAvailability.delete(item.id);applyCatalogItem('products',item);renderCatalog();notify(error.message,true);void loadCatalog();}
  }
  const field=(name,label,value='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  function openItem(item){
    if(item&&catalogWrites.get(catalogKind+':'+item.id)?.pending)return;
    if(!catalog)return notify('Primero conecta y carga el menú.',true);editItem=item||{id:crypto.randomUUID(),version:0};removeImage=false;
    $('#dp-item-title').textContent=(item?'Editar ':'Agregar ')+({products:'producto',toppings:'adicional',payments:'medio de pago',neighborhoods:'barrio'})[catalogKind];
    let fields=field('name','Nombre',item?.name||'','text','required maxlength="120"');
    if(catalogKind==='products')fields+=field('category','Categoría',item?.category||'Pizzas','text','required maxlength="80"')+field('price','Precio de venta',item?.price||0,'number','required min="0" step="1"')+`<label>Descripción<textarea name="description" maxlength="1000">${esc(item?.description||'')}</textarea></label>`+field('badge','Etiqueta (opcional)',item?.badge||'')+`<div class="dp-image-editor"><img id="dp-image-preview" src="${esc(window.DonPierosImages.resolve(item||{}))}" alt="Vista previa"><div class="dp-image-heading"><strong>Fotografía del producto</strong><span id="dp-image-file" role="status">${item?.image_url?'Imagen guardada':'Imagen de referencia'}</span></div><input id="dp-product-image" name="image" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="dp-image-actions"><button class="dp-upload-image" type="button" id="dp-select-image" aria-controls="dp-product-image" aria-describedby="dp-image-hint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>Subir imagen</button><button class="ghost" type="button" id="dp-remove-image">Quitar imagen</button></div><small id="dp-image-hint">JPG, PNG o WebP · hasta 5 MB. La foto propia reemplaza la de referencia.</small></div><label class="dp-check"><input type="checkbox" name="featured" ${item?.featured?'checked':''}> Destacado</label><details><summary>Opciones del producto: tamaños y adicionales</summary><p>Primero crea adicionales con un grupo (por ejemplo Tamaño o Extra). Agrega los grupos que este producto podrá elegir.</p><div id="dp-modifier-list"></div><button class="ghost" type="button" id="dp-add-modifier">＋ Grupo de opciones</button></details>`;
    if(catalogKind==='toppings')fields+=field('kind','Grupo de opciones',item?.kind||'Extra','text','required maxlength="60" list="dp-option-groups"')+field('price','Valor que se suma al precio base',item?.price||0,'number','required min="0" step="1"');
    if(catalogKind==='payments')fields+=field('account_value','Cuenta, llave o número (opcional)',item?.account_value||'')+`<label>Instrucciones<textarea name="instructions" maxlength="500">${esc(item?.instructions||'')}</textarea></label>`;
    if(catalogKind==='neighborhoods')fields+=field('delivery_fee','Valor del domicilio',item?.delivery_fee||0,'number','required min="0" step="1"');
    fields+=field('sort_order','Orden en la carta',item?.sort_order||0,'number','step="1"')+`<label class="dp-check"><input type="checkbox" name="available" ${item?.available!==false?'checked':''}> Disponible / visible</label>`;
    fields+='<datalist id="dp-option-groups">'+[...new Set((catalog.toppings||[]).map(item=>item.kind))].map(kind=>'<option value="'+esc(kind)+'"></option>').join('')+'</datalist>';
    $('#dp-item-fields').innerHTML=fields;$('#dp-item-error').textContent='';$('#dp-item-save').disabled=false;
    if(catalogKind==='products'){
      (item?.modifiers||[]).forEach(addModifier);$('#dp-add-modifier').onclick=()=>addModifier();
      $('#dp-select-image').onclick=()=>$('#dp-product-image').click();
      $('#dp-remove-image').onclick=()=>{removeImage=true;$('#dp-item-form').image.value='';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}$('#dp-image-file').textContent='Imagen de referencia';$('#dp-image-preview').src=window.DonPierosImages.example({name:$('#dp-item-form').elements.namedItem('name').value,category:$('#dp-item-form').category.value});};
      $('#dp-item-form').image.onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);$('#dp-image-preview').src=previewUrl;$('#dp-image-file').textContent=file.name;removeImage=false;};
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
    event.preventDefault();const form=event.target,button=$('#dp-item-save'),kind=catalogKind,previous={...editItem},token=api().getToken();
    button.disabled=true;$('#dp-item-error').textContent='';let uploaded=null,optimistic=false;
    const key=kind+':'+previous.id;
    try{
      const item={...previous,name:form.elements.namedItem('name').value.trim(),available:form.available.checked,sort_order:Number(form.sort_order.value)};
      if(kind==='products'){
        Object.assign(item,{category:form.category.value.trim(),price:Number(form.price.value),description:form.description.value,badge:form.badge.value,featured:form.featured.checked});
        item.modifiers=$$('.dp-modifier').map(group=>({id:group.dataset.groupId,name:group.querySelector('[name=group_name]').value,source:group.querySelector('[name=group_source]').value,min:Number(group.querySelector('[name=group_min]').value),max:Number(group.querySelector('[name=group_max]').value),required:group.querySelector('[name=group_required]').checked,usePrice:group.querySelector('[name=group_price]').checked}));
        if(removeImage){item.image_url='';item.image_path='';}
      }
      if(kind==='toppings'){item.kind=form.kind.value.trim();item.price=Number(form.price.value);}
      if(kind==='payments'){item.account_value=form.account_value.value;item.instructions=form.instructions.value;}
      if(kind==='neighborhoods')item.delivery_fee=Number(form.delivery_fee.value);
      const image=kind==='products'?form.image.files?.[0]:null;
      if(image){button.textContent='Subiendo imagen…';uploaded=await uploadImage(image);item.image_url=uploaded.url;item.image_path=uploaded.path;}
      if(token!==api().getToken())return;
      catalogWrites.set(key,{after:item,pending:true});applyCatalogItem(kind,item);renderCatalog();optimistic=true;
      $('#dp-item-dialog').close();button.disabled=false;button.textContent='Guardar';
      const result=await request('dp_save_catalog',{kind,item});
      if(token!==api().getToken())return;
      catalogWrites.set(key,{after:result.item,pending:false});applyCatalogItem(kind,result.item);renderCatalog();
      if(previous.image_path&&previous.image_path!==item.image_path)removeCatalogPhoto(previous.image_path,'Producto guardado. La foto anterior quedó pendiente de retirar.');
      signal('catalog-changed');notify('Guardado.');
    }catch(error){
      if(token!==api().getToken())return;
      if(optimistic){catalogWrites.delete(key);catalogEpoch++;catalog[kind]=catalog[kind].filter(row=>row.id!==previous.id);if(previous.version)applyCatalogItem(kind,previous);renderCatalog();notify('No pudimos confirmar el guardado. '+friendly(error),true);void loadCatalog();}
      else $('#dp-item-error').textContent=friendly(error);
      // Preserve uploaded files on uncertain saves; deleting them could break a committed product.
      if(uploaded)notify('La foto se conservó. Actualiza el menú para comprobar el guardado.',true);
    }finally{if(!optimistic){button.disabled=false;button.textContent='Guardar';}}
  }
  async function deleteItem(id){
    const kind=catalogKind,item=catalog[kind].find(row=>row.id===id),key=kind+':'+id;
    if(!item||!canMenu()||catalogWrites.get(key)?.pending||pendingAvailability.has(id))return;
    const token=api().getToken();
    if(!await window.DonPierosDialogs.confirm({key:'delete-catalog:'+key,title:'¿Eliminar “'+item.name+'”?',message:'Se retirará del menú. Las comandas anteriores conservarán su detalle.',accept:'Eliminar registro',danger:true}))return;
    if(token!==api().getToken()||!canMenu()||deletions()?.hidden('catalog-'+kind,id)||catalogWrites.get(key)?.pending||pendingAvailability.has(id))return;
    try{deletions().enqueue('catalog-'+kind,id,{kind,id,version:item.version,image_path:item.image_path});catalogEpoch++;renderCatalog();notify('Registro retirado. Se está sincronizando.');}
    catch(error){notify('No pudimos guardar la solicitud de eliminación. '+friendly(error),true);}
  }
  function signal(event){if(channel)void channel.send({type:'broadcast',event,payload:{at:Date.now()}});}
  function confirmReception(orderId){
    const payload={orderId,at:Date.now()};
    try{localStorage.setItem('don_pieros_order_received_v1',JSON.stringify(payload));}catch(_){}
    if(channel)void channel.send({type:'broadcast',event:'order-received',payload}).catch(()=>{});
  }
  async function receiveOrderSignal(message){
    if(!canOrders())return;
    const id=message?.payload?.orderId||message?.orderId;
    if(typeof id!=='string'||!/^DP-[a-zA-Z0-9-]{1,80}$/.test(id))return;
    if(deletions()?.hidden('web-order',id)){deletions().tick();return;}
    const now=Date.now();
    if(now-(receivedOrderSignals.get(id)||0)<2500)return;
    receivedOrderSignals.set(id,now);
    if(receivedOrderSignals.size>100)receivedOrderSignals.delete(receivedOrderSignals.keys().next().value);
    const token=api().getToken(),readEpoch=orderEpoch;
    try{
      // Retrieve only this receipt through the authenticated endpoint. Public
      // broadcasts are wake-up hints and never provide trusted order details.
      const result=await request('dp_get_order',{id},15000);
      if(token!==api().getToken())return;
      if(orderWrites.get(id)?.pending||deletions()?.hidden('web-order',id))return;
      const unchanged=readEpoch===orderEpoch;
      orderEpoch++;
      const order=result.order,previous=findOrder(id);
      if(order&&(!orderWrites.has(id)||unchanged&&!orderWrites.get(id).pending)){
        if(previous&&Number(previous.version)>Number(order.version))return;
        const active=row=>row&&['nueva','atendiendo','lista'].includes(row.status);
        activeCount=Math.max(0,activeCount+Number(!!active(order))-Number(!!active(previous)));
        if(offset===0)orders=[order,...orders.filter(row=>row.id!==id)].sort((a,b)=>b.sequence-a.sequence).slice(0,60);
        dashboardOrders=[...(active(order)?[order]:[]),...dashboardOrders.filter(row=>row.id!==id)].sort((a,b)=>b.sequence-a.sequence);
        if(order.status==='nueva'&&!seenOrderIds.has(id)&&api().getUser()?.role!=='waiter'){
          api().announceWebOrders([order]);
          window.DonPierosReception?.show({key:'order:'+id,kind:'order',title:order.customerName,
            detail:`${id} · ${fulfillmentLabel(order.fulfillment)}\n${order.items.map(item=>`${item.quantity} × ${item.name}`).join(', ')}\n${money(order.total)}`,action:()=>openOrder(id)});
        }
        seenOrderIds.add(id);
      }else if(!order&&!orderWrites.get(id)?.pending){
        orders=orders.filter(row=>row.id!==id);dashboardOrders=dashboardOrders.filter(row=>row.id!==id);
        if(previous&&['nueva','atendiendo','lista'].includes(previous.status))activeCount=Math.max(0,activeCount-1);
      }
      if(!order||order.status!=='nueva')window.DonPierosReception?.dismiss('order:'+id);
      revision='';dashboardRevision='';searchEpoch++;searchCache.clear();repaintOrders();
      if(order&&findOrder(id))confirmReception(id);
    }catch(_){/* Older deployments retain the paginated reception fallback. */}
    void loadOrders(true,true);
  }
  async function tick(){
    const token=api()?.getToken();if(!token||!api()?.getUser()||document.hidden)return;
    if(connectedToken!==token){if(connectedToken)window.DonPierosReception?.reset();connectedToken=token;revision='';dashboardRevision='';ordersView='';firstLoad=true;newestOrderSequence=0;orderEpoch++;activeCount=0;orderWrites.clear();catalogWrites.clear();pendingAvailability.clear();seenOrderIds.clear();receivedOrderSignals.clear();searchEpoch++;searchCache.clear();searchJobs.clear();
      if(channel)void api().db.removeChannel(channel);
      channel=api().db.channel('don-pieros-orders-live').on('broadcast',{event:'order-created'},receiveOrderSignal).on('broadcast',{event:'order-updated'},message=>{if(message?.payload?.orderId)void receiveOrderSignal(message);else void loadOrders(true,true);}).subscribe(status=>{if(status==='SUBSCRIBED'&&canOrders())void loadOrders(true);});
      if(canMenu())void loadCatalog();
    }
    if(canOrders())void loadOrders();
  }
  deletions()?.register('web-order',async(payload,update)=>{
    try{await request('dp_delete_order',payload);}
    catch(error){
      const current=await request('dp_get_order',{id:payload.id},15000);
      if(current.order===null)return;
      if(current.order&&Number(current.order.version)!==Number(payload.version))update({version:current.order.version});
      throw error;
    }
  });
  for(const kind of ['products','toppings','payments','neighborhoods'])deletions()?.register('catalog-'+kind,async(payload,update)=>{
    try{await request('dp_delete_catalog',payload);}
    catch(error){
      const current=await request('dp_admin_catalog');
      const item=current[kind]?.find(row=>row.id===payload.id);
      if(!Array.isArray(current[kind]))throw error;
      if(item){if(Number(item.version)!==Number(payload.version))update({version:item.version});throw error;}
    }
    if(payload.image_path)removeCatalogPhoto(payload.image_path,'Registro retirado. La foto quedó pendiente de limpiar.');
  });
  window.addEventListener('donpieros-deletions-change',event=>{
    const record=event.detail;
    if(record.kind==='web-order'){
      window.DonPierosReception?.dismiss('order:'+record.id);repaintOrders();
      if(record.state==='done'){revision='';dashboardRevision='';searchEpoch++;searchCache.clear();signal('order-updated');void loadOrders(true);}
    }else if(record.kind.startsWith('catalog-')){
      catalogEpoch++;renderCatalog();if(record.state==='done')signal('catalog-changed');
    }
  });
  mount();setInterval(tick,3000);void tick();
  window.addEventListener('donpieros-session-change',()=>void tick());
  window.addEventListener('storage',event=>{if(event.key!=='don_pieros_order_signal_v1'||!event.newValue)return;try{const notice=JSON.parse(event.newValue);if(Math.abs(Date.now()-notice.at)<15000)receiveOrderSignal(notice);}catch(_){}});
  window.addEventListener('focus',()=>void tick());window.addEventListener('online',()=>void tick());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void tick();});
})();
