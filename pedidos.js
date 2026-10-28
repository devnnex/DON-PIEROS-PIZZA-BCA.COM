(() => {
  'use strict';

  if (!document.querySelector('#products')) return;

  const CONFIG = window.DON_PIEROS_CONFIG;
  const fast = window.DonPierosPerformance;
  const WHATSAPP_NUMBER = '573102241444';
  const isSupabaseConfigured = /^https:\/\/.+\.supabase\.co$/i.test(CONFIG.supabaseUrl)
    && !CONFIG.supabaseAnonKey.includes('PEGA_');
  const isOrdersConfigured = /^https:\/\/script\.google\.com\//i.test(CONFIG.appsScriptUrl)
    && !CONFIG.appsScriptUrl.includes('PEGA_');
  const supabaseClient = isSupabaseConfigured && window.supabase
    ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    : null;

  const option = (id, name, price = 0) => ({ id, name, price });
  const group = (id, name, type, options, settings = {}) => ({ id, name, type, options, ...settings });
  const localToppings = [];
  const localProducts = [];
  let products = [], toppingCatalog = [], paymentMethods = [], neighborhoods = [], categories = ["Todo el menú"];
  const state = {
    category:'Todo el menú', query:'', active:null, selections:{}, quantity:1, editingKey:null,
    cart:[], cartStep:'cart', fulfillment:'pickup', payment:'transferencia', selectedNeighborhood:null,
    customer:{name:'',phone:'',address:'',neighborhood:'',notes:''}, orderTotal:0, realtime:null, orderSignal:null,
    sendingTimer:null,
    receipt:null, receiptBusy:false, receiptRevision:0, lastWhatsappUrl:'',
    availabilitySignature:''
  };
  let favoriteIds;try{favoriteIds=new Set(JSON.parse(localStorage.getItem('don_pieros_favorites_v1')||'[]'));}catch(_){favoriteIds=new Set();}
  state.favoritesOnly=false;
  state.catalogReady = false;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const moneyFormatter = new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 });
  const money = value => moneyFormatter.format(Number(value) || 0);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  async function copyText(value) { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value); window.prompt('Copia este contenido:', value); }
  const delivery = window.DonPierosDelivery;
  delivery.configure(() => { const wrapper = $('#checkout-location'); if (wrapper) wrapper.innerHTML = delivery.markup(); }, toast);

  function orderWhatsAppUrl(order, orderId, confirmedTotal, queuePosition, ordersAhead) {
    const productLines = order.items.flatMap((item, index) => {
      const lines = [`${index + 1}. *${item.quantity} × ${item.name}*`];
      if (item.selections.length) lines.push(`   ↳ ${item.selections.join(' · ')}`);
      lines.push(`   💰 ${money(item.unitPrice * item.quantity)}`);
      return lines;
    });
    const deliveryLines = order.fulfillment === 'delivery'
      ? ['🚚 *Entrega:* Domicilio', `📍 *Barrio:* ${order.neighborhood}`, `🏠 *Dirección:* ${order.address}`]
      : ['🏪 *Entrega:* Recoger en Don Pieros Pizza'];
    const totalValue = confirmedTotal ?? (Number(order.subtotal) + Number(order.deliveryFee));
    const lines = [
      '🍕 *DON PIEROS PIZZA · NUEVO PEDIDO*',
      '',
      'Hola, equipo de Don Pieros Pizza 👋',
      'Acabo de realizar este pedido desde la página web:',
      '',
      `🧾 *Pedido:* ${orderId}`,
      `🎟️ *Turno al confirmar:* ${queuePosition || 1} · ${ordersAhead || 0} pedido(s) delante`,
      `👤 *Cliente:* ${order.customerName}`,
      `📱 *Teléfono:* ${order.phone}`,
      ...deliveryLines,
      '',
      '🛍️ *PRODUCTOS*',
      ...productLines,
      '',
      `🧮 *Subtotal:* ${money(order.subtotal)}`,
      ...(order.fulfillment === 'delivery' ? [`🛵 *Domicilio:* ${money(order.deliveryFee)}`] : []),
      `💵 *TOTAL:* ${money(totalValue)}`,
      `💳 *Método de pago:* ${order.paymentMethod}`,
      ...(order.receipt ? ['📎 Comprobante adjunto a la orden.'] : []),
      ...(order.liveLocation ? ['📍 *Ubicación del cliente:* ' + window.DonPierosServices.locationUrl(orderId, order.liveLocation.viewerToken)] : []),
      ...(order.notes ? ['', `📝 *Indicaciones:* ${order.notes}`] : []),
      '',
      '✅ Quedo atento(a) a la confirmación. ¡Gracias!'
    ];
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  try { state.cart = JSON.parse(localStorage.getItem('don-pieros-cart-v2') || '[]'); } catch { state.cart = []; }
  const table = new URLSearchParams(location.search).get('table');
  if (table) $('#order-location').textContent = `Mesa ${table}`;

  function saveCart() { localStorage.setItem('don-pieros-cart-v2', JSON.stringify(state.cart)); updateCounts(); showAvailabilityAlert(); }
  function updateCounts() { const count = state.cart.reduce((sum,item) => sum + item.quantity, 0); $$('.cart-count').forEach(node => { node.textContent = count; }); $('#nav-cart').classList.toggle('has-items', count > 0); }
  function replayFeedback(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }
  function toast(title, copy = '', cartFeedback = false) {
    const element = $('#toast');
    clearTimeout(toast.timer); clearTimeout(toast.hideTimer);
    element.classList.remove('is-leaving');
    element.classList.toggle('cart-feedback', cartFeedback);
    $('#toast-title').textContent = window.DonPierosLanguage.message(title);
    $('#toast-copy').textContent = copy ? window.DonPierosLanguage.message(copy) : '';
    element.hidden = false;
    replayFeedback(element, 'toast-enter');
    if (cartFeedback) {
      replayFeedback($('#nav-cart'), 'cart-added');
      replayFeedback($('#header-cart'), 'cart-added');
    }
    toast.timer = setTimeout(() => {
      element.classList.add('is-leaving');
      toast.hideTimer = setTimeout(() => { element.hidden = true; }, 180);
    }, 2900);
  }
  function subtotal() { return state.cart.reduce((sum,item) => sum + item.unitPrice * item.quantity, 0); }
  function deliveryFee() { return state.fulfillment === 'delivery' ? Number(state.selectedNeighborhood?.delivery_fee || 0) : 0; }
  function total() { return subtotal() + deliveryFee(); }
  function productById(id) { return products.find(product => product.id === id) || state.cart.find(item => item.productId === id)?.productSnapshot; }

  function cartAvailabilityIssues() {
    return state.cart.map(item => {
      const liveProduct = products.find(product => product.id === item.productId);
      const product = liveProduct || item.productSnapshot;
      const reasons = [];
      if (!liveProduct || liveProduct.available === false) reasons.push('Este producto ya no está disponible.');
      const selectedIds = [...new Set(Object.values(item.selections || {}).flat())];
      selectedIds.forEach(id => {
        const topping = toppingCatalog.find(entry => entry.id === id);
        if (!topping || topping.available === false) reasons.push(`${topping?.name || 'Un topping seleccionado'} se agotó.`);
      });
      return reasons.length ? { item, product, reasons } : null;
    }).filter(Boolean);
  }

  function showAvailabilityAlert() {
    const issues = cartAvailabilityIssues();
    const signature = issues.map(issue => `${issue.item.key}:${issue.reasons.join('|')}`).sort().join('::');
    if (!issues.length) {
      state.availabilitySignature = '';
      if (!$('#availability-overlay').hidden) hideOverlay('availability');
      return;
    }
    if (signature === state.availabilitySignature) return;
    state.availabilitySignature = signature;
    $('#availability-items').innerHTML = issues.map(issue => `<article class="availability-item"><img src="${escapeHtml(fast.imageUrl(issue.product?.image) || './images/don-pieros-logo.png')}" alt="${escapeHtml(issue.product?.name || 'Producto')}"><div><strong>${escapeHtml(issue.product?.name || 'Producto del pedido')}</strong>${issue.reasons.map(reason => `<span>${escapeHtml(reason)}</span>`).join('')}</div></article>`).join('');
    showOverlay('availability');
  }

  function buildModifiers(definitions, toppingRows) {
    if (!Array.isArray(definitions)) return [];
    return definitions.map(definition => {
      const options = toppingRows.filter(item => item.available !== false && item.kind === definition.source).map(item => option(item.id, item.name, definition.usePrice ? Number(item.price || 0) : 0));
      return group(definition.id, definition.name, definition.max === 1 ? 'single' : 'multiple', options, {
        required:Boolean(definition.required), min:Number(definition.min || 0), max:Number(definition.max || 99)
      });
    });
  }

  function applyStoreData(data) {
      const [productResult,toppingResult,paymentResult,neighborhoodResult] = data;
      const toppingRows = toppingResult.data || [];
      toppingCatalog = toppingRows;
      products = (productResult.data || []).map(row => ({
        id:row.id,name:row.name,category:row.category,price:Number(row.price),image:window.DonPierosImages.resolve(row),isExampleImage:!window.DonPierosImages.hasOwn(row),
        description:row.description,badge:row.badge,featured:row.featured,available:row.available,
        sort_order:row.sort_order,modifiers:buildModifiers(row.modifiers,toppingRows)
      }));
      paymentMethods = (paymentResult.data || []).filter(item => item.available !== false);
      neighborhoods = (neighborhoodResult.data || []).filter(item => item.available !== false);
      let pricesChanged = false;
      state.cart.forEach(item => {
        const live = products.find(product => product.id === item.productId);
        if (!live) return;
        const price = live.price + (live.modifiers || []).reduce((sum,modifier) => sum + (item.selections?.[modifier.id] || []).reduce((value,id) => value + (modifier.options.find(option => option.id === id)?.price || 0),0),0);
        if (item.unitPrice !== price) { pricesChanged = true; item.unitPrice = price; }
        item.productSnapshot = live;
      });
      if(pricesChanged){saveCart();toast('Precios actualizados','Revisa el total de tu pedido antes de confirmar.');}
      if (state.customer.neighborhood) setNeighborhood(state.customer.neighborhood);
      categories = ['Todo el menú', ...new Set(products.map(product => product.category))];
      if (!categories.includes(state.category)) state.category = 'Todo el menú';
      if (!paymentMethods.some(method => method.id === state.payment)) state.payment = paymentMethods[0]?.id || '';
      renderCategories(); renderProducts();
      if (!$('#cart-overlay').hidden && ['cart','checkout'].includes(state.cartStep)) renderCart();
      showAvailabilityAlert();
  }
  let catalogLoading = null, catalogQueued = false;
  function loadStoreData(showError = false, queue = false) {
    if (catalogLoading) { if (queue) catalogQueued = true; return catalogLoading; }
    catalogLoading = refreshStoreData(showError).finally(() => { catalogLoading = null; if (catalogQueued) { catalogQueued = false; void loadStoreData(false); } });
    return catalogLoading;
  }
  async function refreshStoreData(showError) {
    try {
      const result = await window.DonPierosServices.api('dp_get_catalog');
      const data = [{data:result.products},{data:result.toppings},{data:result.payments},{data:result.neighborhoods}];
      state.catalogReady = true; fast.write('catalog',data,localStorage); applyStoreData(data);
    } catch(error) { if(showError) toast('Carta pendiente de conexión', error.message); renderCategories(); renderProducts(); }
  }
  function connectRealtime() {
    if(supabaseClient) state.orderSignal = supabaseClient.channel('don-pieros-orders-live').on('broadcast',{event:'catalog-changed'},()=>loadStoreData(false,true)).subscribe();
    setInterval(()=>{if(!document.hidden) void loadStoreData(false);},60000);
    window.addEventListener('online',()=>loadStoreData(true));
  }

  function renderCategories() {
    const root = $('#categories');
    root.innerHTML = categories.map(name => `<button role="tab" aria-selected="${state.category === name}" data-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  }
  function visibleProducts() {
    const query = state.query.trim().toLowerCase();
    return products.filter(product => (!state.favoritesOnly || favoriteIds.has(product.id)) && (state.category === 'Todo el menú' ? true : product.category === state.category) && (!query || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query)));
  }
  function renderProducts(loading = false) {
    const root = $('#products');
    if (loading) { root.innerHTML = '<div class="skeleton"></div>'.repeat(6); return; }
    const list = visibleProducts();
    if (!list.length) {
      root.innerHTML = !products.length ? '<div class="empty"><b>Estamos preparando nuestro menú</b><p>Pronto encontrarás aquí todos nuestros productos. Mientras tanto, puedes escribirnos.</p><a class="dp-whatsapp" href="https://wa.me/573102241444">Contactar por WhatsApp →</a><button id="retry-catalog" type="button">Actualizar menú</button></div>' : '<div class="empty"><b>No encontramos ese antojo</b><p>Prueba con otro nombre o explora una categoría.</p><button id="reset-filter">Ver todos los productos</button></div>';return;
    }
    root.innerHTML = list.map(product => `<article class="product-card ${product.available === false ? 'sold-out' : ''}" data-product="${escapeHtml(product.id)}" tabindex="0" aria-label="${escapeHtml(product.name)}${product.available === false ? ', agotado' : ''}">
      <button class="favorite" data-favorite="${escapeHtml(product.id)}" aria-pressed="${favoriteIds.has(product.id)}" aria-label="Guardar ${escapeHtml(product.name)}">${favoriteIds.has(product.id)?'♥':'♡'}</button>
      <div class="product-image"><img src="${escapeHtml(fast.imageUrl(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy">${product.isExampleImage ? '<small class="example-photo-label">Foto de referencia</small>' : ''}${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ''}${product.available === false ? '<span class="sold-label">Agotado</span>' : ''}</div>
      <div class="product-copy"><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p><div class="product-foot"><strong>${(product.modifiers || []).some(group => group.options.some(option => option.price > 0)) ? "Desde " : ""}${money(product.price)}</strong><button class="add" ${product.available === false ? 'disabled' : ''} data-add="${escapeHtml(product.id)}" aria-label="Personalizar ${escapeHtml(product.name)}">+</button></div></div>
    </article>`).join('');
  }

  function defaultSelections(product) { const values = {}; (product.modifiers || []).forEach(modifier => { values[modifier.id] = []; }); return values; }
  function selectedUnitPrice() { return state.active ? state.active.price + (state.active.modifiers || []).reduce((sum,modifier) => sum + (state.selections[modifier.id] || []).reduce((groupSum,id) => groupSum + (modifier.options.find(item => item.id === id)?.price || 0),0),0) : 0; }
  function groupIsComplete(modifier) { return !modifier.required || (state.selections[modifier.id] || []).length >= (modifier.min || 1); }
  function firstMissingGroup() { return (state.active?.modifiers || []).find(modifier => !groupIsComplete(modifier)); }
  function optionLabel(item) { return Object.values(item.selectionLabels || {}).flat().join(' · ') || 'Preparación original'; }
  function quantityMarkup(value,key='detail') { return `<div class="quantity ${key !== 'detail' ? 'compact' : ''}" data-quantity="${escapeHtml(key)}"><button data-qty="minus" aria-label="Disminuir">−</button><b>${value}</b><button data-qty="plus" aria-label="Aumentar">+</button></div>`; }

  function openProduct(product,item=null) {
    if (!product || product.available === false) { toast('Producto agotado','Estará disponible nuevamente muy pronto.'); return; }
    state.active = product;
    state.selections = defaultSelections(product);
    if (item) {
      (product.modifiers || []).forEach(modifier => {
        const allowed = new Set(modifier.options.map(entry => entry.id));
        state.selections[modifier.id] = (item.selections?.[modifier.id] || []).filter(id => allowed.has(id));
      });
    }
    state.quantity = item?.quantity || 1;
    state.editingKey = item?.key || null;
    renderProductDetail(); showOverlay('product');
  }
  function renderProductDetail() {
    const product = state.active; if (!product) return;
    const modifiers = (product.modifiers || []).map(modifier => `<fieldset class="modifier" data-modifier="${escapeHtml(modifier.id)}" tabindex="-1"><legend>${escapeHtml(modifier.name)}<small class="requirement-badge ${modifier.required && !groupIsComplete(modifier) ? 'is-pending' : ''}">${modifier.required ? 'Obligatorio' : `Opcional${modifier.max ? ` · Máx. ${modifier.max}` : ''}`}</small></legend>${modifier.options.map(item => {
      const checked = (state.selections[modifier.id] || []).includes(item.id);
      return `<label class="option"><span><input type="${modifier.type === 'single' ? 'radio' : 'checkbox'}" name="${escapeHtml(modifier.id)}" value="${escapeHtml(item.id)}" data-group="${escapeHtml(modifier.id)}" ${checked ? 'checked' : ''}>${escapeHtml(item.name)}</span><em>${item.price ? `+${money(item.price)}` : 'Incluido'}</em></label>`;
    }).join('')}</fieldset>`).join('');
    const complete = !firstMissingGroup();
    $('#product-detail').innerHTML = `<div class="detail-content"><div class="detail-photo"><img src="${escapeHtml(fast.imageUrl(product.image))}" alt="${escapeHtml(product.name)}">${product.isExampleImage ? '<small class="example-photo-label">Foto de referencia</small>' : ''}</div><div class="detail-head"><div><h2 id="product-title">${escapeHtml(product.name)}</h2><p>${escapeHtml(product.description)}</p></div><strong>${(product.modifiers || []).some(group => group.options.some(option => option.price > 0)) ? "Desde " : ""}${money(product.price)}</strong></div><div class="modifier-list">${modifiers}<div class="qty-block"><div><strong>Cantidad</strong><small>¿Cuántos quieres?</small></div>${quantityMarkup(state.quantity)}</div></div></div><div class="sticky-action"><button id="add-product" class="${complete ? '' : 'is-disabled'}" aria-disabled="${!complete}">${state.editingKey ? 'Actualizar pedido' : 'Agregar al pedido'} · <span id="detail-total">${money(selectedUnitPrice() * state.quantity)}</span></button></div>`;
    refreshDetailTotal();
  }
  function refreshDetailTotal() {
    $('#detail-total').textContent = money(selectedUnitPrice() * state.quantity);
    $('[data-quantity="detail"] b').textContent = state.quantity;
    (state.active?.modifiers || []).forEach(modifier => {
      const field = $(`.modifier[data-modifier="${CSS.escape(modifier.id)}"]`);
      const complete = groupIsComplete(modifier);
      const selected = (state.selections[modifier.id] || []).length > 0;
      const badge = field?.querySelector('.requirement-badge');
      field?.classList.toggle('is-complete', complete && selected);
      badge?.classList.toggle('is-pending', modifier.required && !complete);
      if (badge) badge.textContent = complete && selected ? '✓ Correcto' : modifier.required ? 'Obligatorio' : `Opcional${modifier.max ? ` · Máx. ${modifier.max}` : ''}`;
      if (complete) { field?.classList.remove('modifier-attention'); field?.removeAttribute('aria-invalid'); }
    });
    const complete = !firstMissingGroup(), button = $('#add-product');
    button.classList.toggle('is-disabled', !complete); button.setAttribute('aria-disabled', String(!complete));
  }
  function addActive() {
    if (!state.active) return;
    const missing = firstMissingGroup();
    if (missing) {
      (state.active.modifiers || []).filter(modifier => !groupIsComplete(modifier)).forEach(modifier => {
        const field = $(`.modifier[data-modifier="${CSS.escape(modifier.id)}"]`);
        field.setAttribute('aria-invalid', 'true'); replayFeedback(field, 'modifier-attention');
      });
      const field = $(`.modifier[data-modifier="${CSS.escape(missing.id)}"]`);
      field.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'center'});
      field.focus({preventScroll:true}); toast('Completa tu elección', missing.name); return;
    }
    const selectionLabels = {};
    (state.active.modifiers || []).forEach(modifier => { selectionLabels[modifier.id] = (state.selections[modifier.id] || []).map(id => modifier.options.find(item => item.id === id)?.name).filter(Boolean); });
    const item = { key:state.editingKey || `${state.active.id}-${Date.now()}`, productId:state.active.id, productSnapshot:{...state.active}, quantity:state.quantity, selections:structuredClone(state.selections), selectionLabels, unitPrice:selectedUnitPrice() };
    state.cart = state.editingKey ? state.cart.map(entry => entry.key === state.editingKey ? item : entry) : [...state.cart,item];
    saveCart(); hideOverlay('product'); toast(state.editingKey ? 'Producto actualizado' : 'Agregado a tu pedido', `${item.quantity} × ${state.active.name}`, true); state.active = null; state.editingKey = null;
  }

  function confettiMarkup(count = 58) {
    const colors = ['#10a5d2','#073b57','#ff6b35','#8b2ad9','#ffd23f','#21c778'];
    return Array.from({ length: count }, (_, index) => {
      const x = (index * 37 + 7) % 100;
      const delay = -((index * 0.13) % 4.8);
      const duration = 3.6 + ((index * 17) % 25) / 10;
      const drift = ((index * 29) % 120) - 60;
      const rotation = (index * 67) % 360;
      const color = colors[index % colors.length];
      const shape = index % 3 === 0 ? 'round' : index % 3 === 1 ? 'strip' : 'square';
      return `<i class="confetti-piece ${shape}" style="--x:${x};--delay:${delay}s;--duration:${duration}s;--drift:${drift}px;--rotation:${rotation}deg;--color:${color}"></i>`;
    }).join('');
  }

  function startSendingMessages() {
    clearInterval(state.sendingTimer);
    const messages = ['Enviando tu pedido a Don Pieros Pizza…','Confirmando productos y total…','Avisando al equipo de cocina…','Ya casi está listo…'];
    let index = 0;
    state.sendingTimer = setInterval(() => {
      const message = $('#sending-message');
      if (!message || state.cartStep !== 'sending') return clearInterval(state.sendingTimer);
      index = (index + 1) % messages.length;
      message.classList.remove('message-in');
      requestAnimationFrame(() => { message.textContent = messages[index]; message.classList.add('message-in'); });
    }, 1250);
  }

  function receiptMarkup() {
    return `<div class="receipt-card-heading"><span aria-hidden="true">▤</span><div><strong>Comprobante de pago</strong><p>Opcional · Adjunta la imagen de tu transferencia.</p></div></div>${state.receipt ? `<div class="receipt-selected"><img src="${state.receipt.dataUrl}" alt="Vista previa del comprobante"><div><strong>${escapeHtml(state.receipt.name)}</strong><span>Se enviará junto con tu pedido.</span><button type="button" id="receipt-remove">Quitar imagen</button></div></div>` : ''}<label class="premium-upload"><input name="receiptFile" id="receipt-file" type="file" accept="image/png,image/jpeg,image/webp" ${state.receiptBusy ? 'disabled' : ''}><span class="upload-symbol" aria-hidden="true">↑</span><span><strong>${state.receiptBusy ? 'Preparando imagen…' : state.receipt ? 'Cambiar comprobante' : 'Seleccionar comprobante'}</strong><small>JPG, PNG o WebP · hasta 10 MB</small></span><b aria-hidden="true">+</b></label>`;
  }
  async function selectReceipt(file) {
    if (!file) return;
    const revision = ++state.receiptRevision; state.receiptBusy = true;
    $('#checkout-receipt').innerHTML = receiptMarkup(); $('#confirm-order').disabled = true;
    try { const receipt = await window.DonPierosServices.prepareReceipt(file); if (revision === state.receiptRevision) state.receipt = receipt; }
    catch (error) { toast('Revisa el comprobante', error.message); }
    finally { if (revision === state.receiptRevision) { state.receiptBusy = false; const wrapper = $('#checkout-receipt'); if (wrapper) wrapper.innerHTML = receiptMarkup(); const button = $('#confirm-order'); if (button) button.disabled = false; } }
  }

  function renderCart() {
    const root = $('#cart-content'), action = $('#cart-action');
    $('#cart-overlay .cart-sheet').classList.toggle('checkout-view', state.cartStep === 'checkout');
    $('#cart-overlay .cart-sheet').classList.toggle('celebration-view', state.cartStep === 'sending' || state.cartStep === 'success');
    if (state.cartStep !== 'sending') clearInterval(state.sendingTimer);
    $('#cart-kicker').textContent = state.cartStep === 'cart' ? 'TU PEDIDO' : state.cartStep === 'checkout' ? 'FINALIZAR' : state.cartStep === 'sending' ? 'ENVIANDO' : 'ORDEN RECIBIDA';
    $('#cart-title').textContent = state.cartStep === 'cart' ? 'Tu pedido' : state.cartStep === 'checkout' ? 'Datos del pedido' : state.cartStep === 'sending' ? 'Creando tu orden' : 'Pedido confirmado';
    $('#cart-back').textContent = state.cartStep === 'checkout' ? '←' : '×';
    if (state.cartStep === 'sending') {
      root.innerHTML = `<div class="sending-experience" role="status" aria-live="polite"><div class="sending-orbit" aria-hidden="true"><span></span><span></span><span></span><div class="sending-logo"><img src="./images/don-pieros-logo.png" alt="" decoding="async" loading="lazy"></div></div><small>ESTAMOS PREPARANDO TODO</small><h3>Tu orden va en camino</h3><p id="sending-message" class="message-in">Enviando tu pedido a Don Pieros Pizza…</p><div class="sending-progress" aria-hidden="true"><i></i></div><div class="sending-tip"><strong>Un momento delicioso</strong><span>No cierres esta ventana mientras confirmamos tu pedido.</span></div></div>`;
      action.innerHTML = '';
      startSendingMessages();
      return;
    }
    if (state.cartStep === 'success') {
      root.innerHTML = `<div class="confetti-layer" aria-hidden="true">${confettiMarkup()}</div><div class="success success-celebration"><button class="success-close" id="success-close" type="button" aria-label="Cerrar">×</button><div class="success-mark"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M14 27.5 22.5 36 39 18"></path></svg></div><small>ORDEN REALIZADA</small><h3>¡Pedido realizado<br>con éxito!</h3><p>Gracias, ${escapeHtml(state.customer.name.split(' ')[0] || '')}. Te llevaremos a WhatsApp para enviar los detalles de tu pedido.</p><div class="order-number"><small>NÚMERO DE PEDIDO</small><strong>${escapeHtml(state.lastOrderId)}</strong></div><div class="queue-confirmation"><strong>Tu turno: ${Number(state.queuePosition) || 1}</strong><p>${Number(state.ordersAhead) || 0} pedido(s) delante al confirmar. Te avisaremos por WhatsApp.</p></div><a class="dp-whatsapp" href="${escapeHtml(state.lastWhatsappUrl)}">Continuar a WhatsApp →</a><button id="finish-order">Volver al menú</button></div>`;
      if (delivery.confirmed && delivery.active) {
        $('.success-celebration p', root).textContent = 'Tu ubicación se está compartiendo con Don Pieros Pizza. Envíanos los detalles por WhatsApp sin cerrar esta página.';
        const link = document.createElement('a'); link.href = state.lastWhatsappUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'order-whatsapp-link'; link.textContent = 'Enviar pedido por WhatsApp ↗'; $('#finish-order').before(link);
      }
      action.innerHTML = ''; return;
    }
    if (state.cartStep === 'recovery') {
      root.innerHTML='<div class="cart-empty"><i>↻</i><h3>Verifiquemos tu pedido</h3><p>La conexión se interrumpió antes de confirmar la respuesta. Tu pedido conserva su identificador: podemos verificarlo sin duplicarlo.</p><button id="retry-pending" type="button">Verificar y continuar</button><p>Si ya se guardó, recuperaremos su número y su turno.</p></div>';
      action.innerHTML='';return;
    }
    if (state.cartStep === 'checkout') {
      const selectedPayment = paymentMethods.find(method => method.id === state.payment);
      const paymentInfo = selectedPayment ? `<div class="payment-info"><div><small>Dato para pagar</small><strong>${escapeHtml(selectedPayment.account_value || 'Pendiente de configurar')}</strong><span>${escapeHtml(selectedPayment.instructions || '')}</span></div>${selectedPayment.account_value ? '<button type="button" id="copy-payment" aria-label="Copiar dato de pago">▣</button>' : ''}</div>` : '';
      const neighborhoodOptions = neighborhoods.map(item => `<option value="${escapeHtml(item.name)}"></option>`).join('');
      const deliveryFields = state.fulfillment === 'delivery' ? `<div class="delivery-fields"><label>Dirección<input name="address" value="${escapeHtml(state.customer.address)}" placeholder="Calle, carrera, número y detalles" maxlength="120" autocomplete="street-address" required><div class="neighborhood-suggestions" id="neighborhood-suggestions"></div></label><label>Barrio<input name="neighborhood" list="neighborhood-list" value="${escapeHtml(state.customer.neighborhood)}" placeholder="Escribe y selecciona tu barrio" maxlength="60" autocomplete="off" required><datalist id="neighborhood-list">${neighborhoodOptions}</datalist></label></div>` : '';
      root.innerHTML = `<form class="checkout" id="checkout-form"><fieldset class="checkout-choice"><legend>¿Cómo quieres recibir tu pedido?</legend><div class="choice-grid"><label><input type="radio" name="fulfillment" value="pickup" ${state.fulfillment === 'pickup' ? 'checked' : ''}><span><b>⌂</b><strong>Recoger</strong><small>En Don Pieros Pizza</small></span></label><label><input type="radio" name="fulfillment" value="delivery" ${state.fulfillment === 'delivery' ? 'checked' : ''}><span><b>⌖</b><strong>Domicilio</strong><small>En tu dirección</small></span></label></div></fieldset>${deliveryFields}<label>Nombre completo<input name="name" value="${escapeHtml(state.customer.name)}" placeholder="¿A nombre de quién?" maxlength="60" autocomplete="name" required></label><label>Teléfono<input name="phone" type="tel" inputmode="tel" value="${escapeHtml(state.customer.phone)}" placeholder="300 000 0000" maxlength="20" autocomplete="tel" required></label><label>Indicaciones especiales <small><span id="note-count">${state.customer.notes.length}</span>/180</small><textarea name="notes" maxlength="180" placeholder="Ej: sin cebolla, alergias o alguna indicación...">${escapeHtml(state.customer.notes)}</textarea></label><fieldset class="checkout-choice payment-choice"><legend>Método de pago</legend><div class="payment-grid">${paymentMethods.map(method => `<label><input type="radio" name="payment" value="${escapeHtml(method.id)}" ${state.payment === method.id ? 'checked' : ''}><span>${escapeHtml(method.name)}</span></label>`).join('')}</div></fieldset>${paymentInfo}<div class="summary"><div><span>Subtotal</span><span>${money(subtotal())}</span></div>${state.fulfillment === 'delivery' ? `<div><span>Domicilio${state.selectedNeighborhood ? ` · ${escapeHtml(state.selectedNeighborhood.name)}` : ''}</span><span>${state.selectedNeighborhood ? money(deliveryFee()) : 'Selecciona tu barrio'}</span></div>` : ''}<div class="total"><strong>Total</strong><strong>${money(total())}</strong></div></div></form>`;
      if (state.fulfillment === 'delivery') {
        const wrapper = document.createElement('div'); wrapper.id = 'checkout-location'; wrapper.innerHTML = delivery.markup(); $('.delivery-fields', root).after(wrapper);
      }
      const receipt = document.createElement('section'); receipt.id = 'checkout-receipt'; receipt.className = 'receipt-checkout-card'; receipt.innerHTML = receiptMarkup(); ($('.payment-info', root) || $('.payment-choice', root)).after(receipt);
      action.innerHTML = `<button id="confirm-order" ${state.receiptBusy ? 'disabled' : ''}>Confirmar pedido · ${money(total())}</button>`; return;
    }
    if (!state.cart.length) { root.innerHTML = '<div class="cart-empty"><i>♢</i><h3>Tu pedido está vacío</h3><p>Explora el menú y agrega algo delicioso.</p><button id="explore-menu">Explorar el menú</button></div>'; action.innerHTML = ''; return; }
    const issues = cartAvailabilityIssues();
    root.innerHTML = `<div class="cart-items">${state.cart.map(item => { const product = productById(item.productId) || item.productSnapshot; const issue = issues.find(entry => entry.item.key === item.key); return `<article class="cart-item ${issue ? 'is-unavailable' : ''}"><div class="cart-thumb"><img src="${escapeHtml(fast.imageUrl(product.image))}" alt="${escapeHtml(product.name)}">${issue ? '<span>Agotado</span>' : ''}</div><div class="cart-info"><div class="cart-name"><strong>${escapeHtml(product.name)}</strong><button class="delete" data-delete="${escapeHtml(item.key)}" aria-label="Eliminar ${escapeHtml(product.name)}">×</button></div>${issue ? `<div class="cart-availability">${issue.reasons.map(reason => escapeHtml(reason)).join(' ')}</div>` : `<p>${escapeHtml(optionLabel(item))}</p>`}<button class="edit" data-edit="${escapeHtml(item.key)}">✎ Editar</button><div class="cart-line">${quantityMarkup(item.quantity,item.key)}<strong>${money(item.unitPrice * item.quantity)}</strong></div></div></article>`; }).join('')}</div><button class="continue" id="continue-shopping">＋ Seguir agregando</button><div class="summary"><div><span>Subtotal</span><span>${money(subtotal())}</span></div><div class="total"><strong>Total</strong><strong>${money(subtotal())}</strong></div></div>`;
    action.innerHTML = `<button id="go-checkout" ${issues.length ? 'disabled' : ''}>${issues.length ? 'Revisa lo agotado' : `Continuar · ${money(subtotal())}`}</button>`;
  }

  function openCart() { state.cartStep = readPendingOrder() ? 'recovery' : 'cart'; renderCart(); showOverlay('cart'); }
  function showOverlay(name) { $(`#${name}-overlay`).hidden = false; document.body.classList.add('modal-open'); }
  function hideOverlay(name) { if(name==='cart')clearTimeout(state.redirectTimer); $(`#${name}-overlay`).hidden = true; if (!$$('.overlay:not([hidden])').length) document.body.classList.remove('modal-open'); }
  function setNeighborhood(value) {
    const normalized = String(value || '').trim().toLocaleLowerCase('es');
    state.selectedNeighborhood = neighborhoods.find(item => item.name.toLocaleLowerCase('es') === normalized) || null;
    state.customer.neighborhood = state.selectedNeighborhood?.name || String(value || '');
  }
  function renderAddressSuggestions(value) {
    const root = $('#neighborhood-suggestions'); if (!root) return;
    const query = value.trim().toLocaleLowerCase('es');
    if (query.length < 2) { root.innerHTML = ''; return; }
    const matches = neighborhoods.filter(item => item.name.toLocaleLowerCase('es').includes(query) || query.includes(item.name.toLocaleLowerCase('es'))).slice(0,5);
    root.innerHTML = matches.map(item => `<button type="button" data-neighborhood="${escapeHtml(item.id)}"><span>${escapeHtml(item.name)}</span><strong>${money(item.delivery_fee)}</strong></button>`).join('');
  }
  function chooseNeighborhood(id) {
    const neighborhood = neighborhoods.find(item => item.id === id); if (!neighborhood) return;
    state.selectedNeighborhood = neighborhood; state.customer.neighborhood = neighborhood.name;
    const field = $('[name="neighborhood"]'); if (field) field.value = neighborhood.name;
    $('#neighborhood-suggestions').innerHTML = '';
    renderCart();
  }
  function guideCheckoutField(selector,title,copy) { const field = $(selector,$('#checkout-form')); if (!field) return; const target = field.type === 'radio' ? field.closest('.checkout-choice') : field.closest('label'); target.classList.add('checkout-attention'); target.scrollIntoView({behavior:'smooth',block:'center'}); field.focus({preventScroll:true}); toast(title,copy); }
  function getPendingOrderId() { let id=localStorage.getItem("don_pieros_pending_order_id"); if(!id){id=crypto.randomUUID();localStorage.setItem("don_pieros_pending_order_id",id);}return id; }
  function readPendingOrder(){try{const pending=JSON.parse(localStorage.getItem('don_pieros_pending_order_v1')||'null');return pending?.order?.requestId ? pending : null;}catch(_){return null;}}
  function cartFingerprint(){return JSON.stringify(state.cart.map(item=>[item.key,item.quantity,item.unitPrice]));}
  async function confirmOrder() {
    if (state.cartStep === 'sending' || state.receiptBusy) return;
    const pending=readPendingOrder();if(pending)return sendOrder(pending.order,pending.cartFingerprint);
    if (!state.catalogReady) { void loadStoreData(true); return toast('Actualizando la carta','Estamos verificando los precios y la disponibilidad antes de confirmar.'); }
    if (delivery.preparing) return toast('Un momento', 'Espera a que termine la solicitud de ubicación o continúa sin compartirla.');
    const digits = state.customer.phone.replace(/\D/g,'');
    if (cartAvailabilityIssues().length) {
      showAvailabilityAlert();
      return toast('Revisa tu pedido', 'Un producto o topping dejó de estar disponible.');
    }
    if (state.fulfillment === 'delivery' && !state.customer.address.trim()) return guideCheckoutField('[name="address"]','Completa el domicilio','Ingresa la dirección para continuar.');
    if (state.fulfillment === 'delivery' && !state.selectedNeighborhood) return guideCheckoutField('[name="neighborhood"]','Selecciona un barrio','Elige un barrio de la lista para calcular el domicilio.');
    if (state.customer.name.trim().length<2) return guideCheckoutField('[name="name"]','Completa tus datos','Ingresa al menos dos letras de tu nombre para continuar.');
    if (digits.length < 7) return guideCheckoutField('[name="phone"]','Completa tus datos','Ingresa un teléfono válido para continuar.');
    if (!state.payment) return guideCheckoutField('[name="payment"]','Selecciona el pago','Elige un método de pago para continuar.');
    if (!isOrdersConfigured) return toast('Pedidos aún no disponibles','Estamos terminando de conectar la carta. Puedes contactarnos por WhatsApp.');
    const selectedPayment = paymentMethods.find(method => method.id === state.payment);
    const order = {
      requestId: getPendingOrderId(), paymentId:state.payment, neighborhoodId:state.selectedNeighborhood?.id || "",
      customerName:state.customer.name,phone:state.customer.phone,fulfillment:state.fulfillment,
      address:state.customer.address,neighborhood:state.customer.neighborhood,deliveryFee:deliveryFee(),
      subtotal:subtotal(),paymentMethod:selectedPayment?.name || state.payment,paymentValue:selectedPayment?.account_value || '',notes:state.customer.notes,
      items:state.cart.map(item => ({ productId:item.productId,name:(productById(item.productId) || item.productSnapshot).name,quantity:item.quantity,unitPrice:item.unitPrice,selectionIds:item.selections || {},selections:Object.values(item.selectionLabels || {}).flat() }))
    };
    if (state.receipt) order.receipt = { name:state.receipt.name, mimeType:state.receipt.mimeType, base64:state.receipt.base64 };
    if (state.fulfillment === 'delivery' && delivery.payload()) order.liveLocation = delivery.payload();
    return sendOrder(order,cartFingerprint());
  }
  async function sendOrder(order,fingerprint) {
    try{localStorage.setItem('don_pieros_pending_order_v1',JSON.stringify({order,cartFingerprint:fingerprint}));}catch(_){return toast('No pudimos conservar tu pedido','Libera espacio en el navegador e intenta nuevamente.');}
    state.cartStep = 'sending';
    renderCart();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try {
      const response = await fetch(CONFIG.appsScriptUrl, { method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},signal:controller.signal,body:JSON.stringify({action:'createOrder',order}) });
      const result = await response.json(); if (!result.ok) {const error=new Error(result.error || 'No se pudo crear la orden.');error.confirmedRejected=result.code==='ORDER_VALIDATION';throw error;}
      if (state.orderSignal) void state.orderSignal.send({ type:'broadcast', event:'order-created', payload:{ orderId:result.orderId } });
      order.subtotal = result.subtotal; order.deliveryFee = result.deliveryFee;
      const whatsappUrl = orderWhatsAppUrl(order, result.orderId, result.total,result.queuePosition,result.ordersAhead);
      localStorage.removeItem('don_pieros_pending_order_v1');localStorage.removeItem('don_pieros_pending_order_id');
      state.customer.name=order.customerName;state.queuePosition = result.queuePosition; state.ordersAhead = result.ordersAhead; state.lastWhatsappUrl = whatsappUrl; state.lastOrderId = result.orderId; state.orderTotal = result.total; state.cartStep = 'success';
      if(cartFingerprint()===fingerprint)state.cart=[];
      state.receipt=null;saveCart();renderCart();
      state.redirectTimer=setTimeout(()=>{if(state.cartStep==='success')window.location.assign(whatsappUrl);},6500);
    } catch (error) {
      if(error.confirmedRejected){localStorage.removeItem('don_pieros_pending_order_v1');localStorage.removeItem('don_pieros_pending_order_id');state.cartStep='checkout';void loadStoreData(true);}
      else state.cartStep='recovery';
      renderCart();toast('Confirma el estado de tu pedido',error.name==='AbortError'?'La conexión tardó. Puedes verificar sin duplicar tu pedido.':error.message||'Intenta nuevamente.');
    }finally{clearTimeout(timer);}
  }

  $('#categories').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (!button) return; state.category = button.dataset.category; renderCategories(); renderProducts(); });
  $('#products').addEventListener('click', event => { const favorite=event.target.closest('[data-favorite]');if(favorite){const id=favorite.dataset.favorite;if(favoriteIds.has(id))favoriteIds.delete(id);else favoriteIds.add(id);try{localStorage.setItem('don_pieros_favorites_v1',JSON.stringify([...favoriteIds]));}catch(_){}renderProducts();return;}if(event.target.closest('#retry-catalog'))return void loadStoreData(true); const target = event.target.closest('[data-product],[data-add]'); if (target) openProduct(productById(target.dataset.product || target.dataset.add)); });
  $('#products').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-product]')) { event.preventDefault(); openProduct(productById(event.target.dataset.product)); } });
  $('#search').addEventListener('input', event => { state.query = event.target.value; $('#clear-search').hidden = !state.query; renderProducts(); });
  $('#clear-search').addEventListener('click', () => { state.query = ''; $('#search').value = ''; $('#clear-search').hidden = true; renderProducts(); });
  $('#products').addEventListener('click', event => { if (event.target.id === 'reset-filter') { state.favoritesOnly=false;$('#favorites').classList.remove('active');state.query = ''; state.category = 'Todo el menú'; $('#search').value = ''; renderCategories(); renderProducts(); } });
  $('#product-detail').addEventListener('change', event => { const input = event.target.closest('[data-group]'); if (!input) return; const modifier = state.active.modifiers.find(item => item.id === input.dataset.group); const current = state.selections[modifier.id] || []; if (modifier.type === 'single') state.selections[modifier.id] = [input.value]; else if (input.checked) { if (modifier.max && current.length >= modifier.max) { input.checked = false; return toast('Máximo alcanzado',`Puedes elegir hasta ${modifier.max} opciones.`); } state.selections[modifier.id] = [...current,input.value]; } else state.selections[modifier.id] = current.filter(id => id !== input.value); refreshDetailTotal(); });
  $('#product-detail').addEventListener('click', event => { const quantity = event.target.closest('[data-qty]'); if (quantity) { state.quantity = Math.max(1,state.quantity + (quantity.dataset.qty === 'plus' ? 1 : -1)); refreshDetailTotal(); } if (event.target.closest('#add-product')) addActive(); });
  $('[data-close="product"]').addEventListener('click', () => hideOverlay('product'));
  $('#product-overlay').addEventListener('click', event => { if (event.target.id === 'product-overlay') hideOverlay('product'); });
  $('#header-cart').addEventListener('click', openCart); $('#nav-cart').addEventListener('click', openCart);
  $('#cart-overlay').addEventListener('click', event => { if (event.target.id === 'cart-overlay' && state.cartStep !== 'sending') hideOverlay('cart'); });
  $('#cart-back').addEventListener('click', () => {
    if (state.cartStep === 'sending') return;
    if (state.cartStep === 'checkout') { state.cartStep = 'cart'; renderCart(); return; }
    hideOverlay('cart');
    if (state.cartStep === 'success') { state.cartStep = 'cart'; state.customer = {name:'',phone:'',address:'',neighborhood:'',notes:''}; }
  });
  $('#cart-content').addEventListener('click', event => {
    if(event.target.closest('#retry-pending')){const pending=readPendingOrder();if(pending)void sendOrder(pending.order,pending.cartFingerprint);return;}
    if (event.target.closest('#checkout-location-toggle')) { if (delivery.active) void delivery.stop(); else delivery.open(); return; }
    if (event.target.closest('#receipt-remove')) { state.receiptRevision++; state.receiptBusy = false; state.receipt = null; $('#checkout-receipt').innerHTML = receiptMarkup(); $('#confirm-order').disabled = false; return; }
    const remove = event.target.closest('[data-delete]'); if (remove) { state.cart = state.cart.filter(item => item.key !== remove.dataset.delete); saveCart(); renderCart(); return; }
    const edit = event.target.closest('[data-edit]'); if (edit) { const item = state.cart.find(entry => entry.key === edit.dataset.edit); hideOverlay('cart'); openProduct(productById(item.productId) || item.productSnapshot,item); return; }
    const quantity = event.target.closest('[data-quantity] [data-qty]'); if (quantity) { const wrapper = quantity.closest('[data-quantity]'), item = state.cart.find(entry => entry.key === wrapper.dataset.quantity); item.quantity = Math.max(1,item.quantity + (quantity.dataset.qty === 'plus' ? 1 : -1)); saveCart(); renderCart(); return; }
    const suggestion = event.target.closest('[data-neighborhood]'); if (suggestion) { chooseNeighborhood(suggestion.dataset.neighborhood); return; }
    if (event.target.closest('#copy-payment')) { const method = paymentMethods.find(item => item.id === state.payment); void copyText(method.account_value).then(() => toast('Dato copiado',method.account_value)).catch(() => toast('No pudimos copiar', 'Mantén presionado el dato para copiarlo.')); }
    if (event.target.closest('#continue-shopping') || event.target.closest('#explore-menu')) hideOverlay('cart');
    if (event.target.closest('#finish-order') || event.target.closest('#success-close')) { hideOverlay('cart'); state.cartStep = 'cart'; state.customer = {name:'',phone:'',address:'',neighborhood:'',notes:''}; }
  });
  $('#cart-content').addEventListener('input', event => {
    if (event.target.name === 'receiptFile') return;
    if (!event.target.name) return;
    event.target.closest('.checkout-attention')?.classList.remove('checkout-attention');
    if (event.target.name === 'fulfillment') { state.fulfillment = event.target.value; if (state.fulfillment === 'pickup') { state.selectedNeighborhood = null; if (!delivery.confirmed) void delivery.stop(); } renderCart(); return; }
    if (event.target.name === 'payment') { state.payment = event.target.value; renderCart(); return; }
    state.customer[event.target.name] = event.target.value;
    if (event.target.name === 'notes') $('#note-count').textContent = event.target.value.length;
    if (event.target.name === 'address') renderAddressSuggestions(event.target.value);
    if (event.target.name === 'neighborhood') { setNeighborhood(event.target.value); const current = event.target.value; const selected = state.selectedNeighborhood; if (selected) { state.customer.neighborhood = selected.name; event.target.value = selected.name; setTimeout(renderCart,0); } else state.customer.neighborhood = current; }
  });
  $('#cart-action').addEventListener('click', event => { if (event.target.closest('#go-checkout')) { state.cartStep = 'checkout'; renderCart(); } if (event.target.closest('#confirm-order')) void confirmOrder(); });
  $('#cart-content').addEventListener('change', event => { if (event.target.name === 'receiptFile') void selectReceipt(event.target.files?.[0]); });
  $('#favorites').addEventListener('click', () => {state.favoritesOnly=!state.favoritesOnly;$('#favorites').classList.toggle('active',state.favoritesOnly);state.category='Todo el menú';renderCategories();renderProducts();$('#menu').scrollIntoView({behavior:'smooth'});});
  $('#profile').addEventListener('click', () => toast('Perfil','Tus pedidos se coordinan con Don Pieros Pizza por WhatsApp.'));
  document.body.classList.add('modal-open');
  $('#welcome-close').addEventListener('click', () => hideOverlay('welcome')); $('#welcome-dismiss').addEventListener('click', () => hideOverlay('welcome')); $('#welcome-overlay').addEventListener('click', event => { if (event.target.id === 'welcome-overlay') hideOverlay('welcome'); });
  $('#availability-dismiss').addEventListener('click', () => hideOverlay('availability'));
  $('#availability-review').addEventListener('click', () => { hideOverlay('availability'); $('#welcome-overlay').hidden = true; openCart(); });
  $('#availability-overlay').addEventListener('click', event => { if (event.target.id === 'availability-overlay') hideOverlay('availability'); });
  localProducts.forEach(product => { product.image = fast.imageUrl(product.image); });
  const cachedCatalog = fast.read('catalog',3 * 60000,localStorage);
  if (Array.isArray(cachedCatalog) && cachedCatalog.length === 4 && cachedCatalog.every(result => Array.isArray(result.data))) applyStoreData(cachedCatalog);
  else { renderCategories(); renderProducts(); }
  updateCounts();
  void loadStoreData(true);
  connectRealtime();
})();
