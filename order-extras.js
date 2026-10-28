(() => {
  'use strict';
  const service = window.DonPierosServices;
  const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, '0')).join('');
  const root = document.createElement('div'); root.id = 'delivery-location-tools';
  root.innerHTML = `<div class="overlay location-consent-overlay" id="location-consent" hidden><section class="location-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="location-consent-title" tabindex="-1"><button type="button" class="location-consent-close" data-location-cancel aria-label="Cerrar">×</button><img src="./images/optimized/don-pieros-logo.webp" decoding="async" alt="DonPieros"><small>UNA ENTREGA MÁS FÁCIL</small><h2 id="location-consent-title">¿Nos compartes<br>tu ubicación?</h2><p>Si deseas, puedes compartir tu ubicación en tiempo real para ubicarte mejor y entregar tu pedido lo más rápido posible.</p><div class="location-consent-note"><strong>Tú decides cuándo detenerla.</strong><span>Se comparte al confirmar tu pedido, durante un máximo de 2 horas. Mantén esta página abierta para actualizarla. El equipo y quienes reciban el enlace podrán verla.</span></div><p class="location-consent-status" role="status" id="location-consent-status"></p><button type="button" class="extras-primary" id="location-accept">Sí, compartir mi ubicación</button><button type="button" class="extras-secondary" data-location-cancel>Continuar sin compartir</button></section></div><aside class="location-sharing-bar" id="location-sharing-bar" hidden aria-label="Ubicación compartida"><span class="location-sharing-dot"></span><div><strong id="location-sharing-title">Ubicación compartida</strong><span id="location-sharing-status">Mantén esta página abierta.</span></div><button type="button" id="location-sharing-stop">Detener</button></aside>`;
  document.body.append(root);
  root.querySelector('.location-consent-note span').textContent = 'Se comparte al confirmar tu pedido, durante un máximo de 2 horas. Al cambiar de pestaña o aplicación se pausa y se reanuda al volver. El equipo y quienes reciban el enlace podrán verla.';
  const $ = selector => root.querySelector(selector);
  let listener = () => {}, notice = () => {}, watch = null, active = false, latest = null, writerToken = '', viewerToken = '', orderId = '', lastPublished = 0, startedAt = 0, timer = null, busy = false, lastFocus = null, inertElements = [];
  let confirmed = false, stopPending = false, preparing = false, cancelled = 0, acquiring = false;
  function fix(position) { return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, observedAt: new Date(position.timestamp || Date.now()).toISOString() }; }
  function watchPosition() {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = navigator.geolocation.watchPosition(position => { if (!active) return; latest = fix(position); if (orderId) void publish(); }, error => {
      status(error.code === 1 ? 'Permiso retirado. Deteniendo la ubicación…' : 'Sin señal. Mostramos la última actualización.');
      if (error.code === 1) void stop();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function refreshPosition() {
    if (!active || document.hidden || acquiring) return;
    acquiring = true;
    navigator.geolocation.getCurrentPosition(position => { acquiring = false; if (!active) return; latest = fix(position); if (orderId) void publish(); }, error => { acquiring = false; if (error.code === 1) void stop(); else status('Sin señal. Mostramos la última actualización.'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  function notify() { listener(); }
  function modalClose() {
    $('#location-consent').hidden = true; inertElements.forEach(element => { element.inert = false; }); inertElements = [];
    if (lastFocus?.isConnected) lastFocus.focus();
  }
  function cancelConsent() { cancelled++; preparing = false; $('#location-accept').disabled = false; modalClose(); }
  function open() {
    if (active || preparing || stopPending) return;
    lastFocus = document.activeElement;
    $('#location-consent-status').textContent = ''; $('#location-accept').disabled = false;
    $('#location-consent').hidden = false;
    inertElements = [...document.body.children].filter(element => element !== root && !element.inert && element.tagName !== 'SCRIPT'); inertElements.forEach(element => { element.inert = true; });
    $('#location-accept').focus();
  }
  function status(copy) {
    $('#location-sharing-status').textContent = copy;
    $('#location-sharing-title').textContent = active ? 'Ubicación compartida' : 'Compartir ubicación';
  }
  async function start() {
    if (preparing) return;
    if (!window.isSecureContext || !navigator.geolocation) { $('#location-consent-status').textContent = 'Tu navegador no permite compartir ubicación aquí. Puedes completar el pedido con tu dirección.'; return; }
    if (confirmed) { $('#location-consent-status').textContent = 'Ya existe una entrega compartida. Detén esa ubicación antes de iniciar otra.'; return; }
    preparing = true; const current = ++cancelled; $('#location-accept').disabled = true; $('#location-consent-status').textContent = 'Preparando la ubicación…';
    try {
      await service.requireCapability('liveLocation');
      if (current !== cancelled) return;
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      if (current !== cancelled) return;
      latest = fix(position);
      active = true; writerToken = token(); viewerToken = token(); orderId = ''; confirmed = false;
      startedAt = Date.now(); lastPublished = 0; notify(); modalClose();
      watchPosition();
      timer = setInterval(() => { if (Date.now() - startedAt >= 2 * 60 * 60 * 1000) void stop(); else refreshPosition(); }, 20000);
    } catch (error) {
      if (current === cancelled) $('#location-consent-status').textContent = error.code === 1 ? 'No se autorizó la ubicación. Puedes continuar con tu dirección.' : error.code === 2 || error.code === 3 ? 'No pudimos ubicarte. Intenta nuevamente o continúa con tu dirección.' : window.DonPierosLanguage.message(error, 'No pudimos activar la ubicación.');
    } finally { if (current === cancelled) { preparing = false; $('#location-accept').disabled = false; } }
  }
  async function publish() {
    if (!active || document.hidden || !orderId || !latest || busy || stopPending || Date.now() - lastPublished < 9000) return;
    busy = true; const currentOrder = orderId, currentToken = writerToken; lastPublished = Date.now();
    try { await service.api('updateCustomerLocation', { orderId: currentOrder, writerToken: currentToken, ...latest }); if (active && orderId === currentOrder && !document.hidden) status('Actualizada ahora · Al volver, se reanuda.'); }
    catch (error) { if (/terminó/.test(error.message)) void stop(); else if (active) status('Sin conexión. Volveremos a intentar actualizarla.'); }
    finally { busy = false; }
  }
  async function stop() {
    if (stopPending) return;
    cancelled++; active = false; preparing = false; $('#location-accept').disabled = false;
    if (watch !== null) navigator.geolocation.clearWatch(watch); watch = null; clearInterval(timer); timer = null;
    notify();
    if (!orderId) { latest = null; confirmed = false; $('#location-sharing-bar').hidden = true; return; }
    stopPending = true; $('#location-sharing-stop').disabled = true; status('Deteniendo la ubicación compartida…');
    try {
      await service.api('stopCustomerLocation', { orderId, writerToken });
      orderId = ''; latest = null; confirmed = false; $('#location-sharing-bar').hidden = true;
    } catch { status('No pudimos revocar el enlace. Pulsa Detener para reintentar.'); notice('No se pudo detener el enlace', 'La actualización se pausó. Reintenta detenerla para ocultar la última ubicación.'); }
    finally { stopPending = false; $('#location-sharing-stop').disabled = false; notify(); }
  }
  function payload() { return active && latest && !confirmed ? { ...latest, writerToken, viewerToken } : null; }
  function bind(id) {
    if (!active) return;
    orderId = id; confirmed = true; startedAt = Date.now(); $('#location-sharing-bar').hidden = false; status('Actualizada ahora · Al volver, se reanuda.'); notify();
    if (document.hidden) pause();
  }
  function pause() {
    if (watch !== null) navigator.geolocation.clearWatch(watch); watch = null;
    status('En pausa · Se reanudará al volver a DonPieros.');
    if (orderId && navigator.sendBeacon) {
      const config = window.DON_PIEROS_CONFIG;
      navigator.sendBeacon(config.appsScriptUrl, new Blob([JSON.stringify({ action:'pauseCustomerLocation', orderId, writerToken, supabaseUrl:config.supabaseUrl, supabaseAnonKey:config.supabaseAnonKey })], { type:'text/plain;charset=utf-8' }));
    }
  }
  function markup() {
    if (confirmed) return '<div class="location-checkout-card"><strong>La ubicación de tu entrega anterior sigue compartida.</strong><p>Puedes detenerla desde el aviso de ubicación.</p></div>';
    return `<div class="location-checkout-card"><span class="location-checkout-icon" aria-hidden="true">⌖</span><div><strong>${active ? 'Ubicación lista para compartir' : 'Ayúdanos a encontrarte'}</strong><p>${active ? 'Se compartirá al confirmar el pedido. Puedes detenerla cuando quieras.' : 'Comparte tu ubicación en tiempo real de forma opcional.'}</p></div><button type="button" id="checkout-location-toggle">${active ? 'Dejar de compartir' : 'Compartir ubicación'}</button></div>`;
  }
  $('#location-accept').addEventListener('click', () => { void start(); });
  root.querySelectorAll('[data-location-cancel]').forEach(button => button.addEventListener('click', cancelConsent));
  $('#location-consent').addEventListener('click', event => { if (event.target === event.currentTarget) cancelConsent(); });
  $('#location-sharing-stop').addEventListener('click', () => { void stop(); });
  $('#location-consent').addEventListener('keydown', event => {
    if (event.key === 'Escape') { cancelConsent(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...root.querySelectorAll('#location-consent button:not(:disabled)')], first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('pagehide', () => {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null; clearInterval(timer); timer = null; active = false; cancelled++;
    if (orderId && navigator.sendBeacon) {
      const config = window.DON_PIEROS_CONFIG;
      navigator.sendBeacon(config.appsScriptUrl, new Blob([JSON.stringify({ action: 'stopCustomerLocation', orderId, writerToken, supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey })], { type: 'text/plain;charset=utf-8' }));
    }
    latest = null;
    if (orderId) status('La página se cerró. Pulsa Detener para confirmar que terminó.');
    else $('#location-sharing-bar').hidden = true;
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { notify(); if (orderId) void stop(); } });
  window.addEventListener('online', () => { lastPublished = 0; void publish(); });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) pause();
    else { status('Actualizando tu ubicación…'); lastPublished = 0; watchPosition(); refreshPosition(); }
  });
  window.DonPierosDelivery = { open, stop, payload, bind, markup, get active() { return active; }, get confirmed() { return confirmed; }, get preparing() { return preparing; }, configure(onChange, onNotice) { listener = onChange; notice = onNotice; } };
})();
