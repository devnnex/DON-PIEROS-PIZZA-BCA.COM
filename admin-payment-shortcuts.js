(() => {
  'use strict';
  const box = document.querySelector('#adminPaymentShortcuts');
  if (!box || document.body.dataset.staffEntry === 'waiter') return;
  const api = () => window.DonPierosAdmin;
  let requestId = 0, loadedAt = 0, loadedToken = '', loading = false;
  const clipboardIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H5v16h14V5h-3"/></svg>';
  function render(payments) {
    box.replaceChildren();
    for (const payment of payments.filter(p => p.available && String(p.account_value || '').trim())) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'admin-payment-copy';
      button.setAttribute('aria-label', 'Copiar ' + payment.name + ': ' + payment.account_value);
      button.title = 'Copiar ' + payment.name;
      const text = document.createElement('span'), label = document.createElement('small'), value = document.createElement('strong');
      label.textContent = payment.name; value.textContent = payment.account_value;
      text.append(label, value); button.append(text);
      button.insertAdjacentHTML('beforeend', clipboardIcon);
      button.addEventListener('click', async () => {
        if (!api()?.getUser() || !window.DonPierosSessionGuard?.ensureActive()) return;
        try {
          await copy(String(payment.account_value));
          api().notify(payment.name + ': dato copiado.', 'ok');
          value.textContent = 'Copiado';
          window.setTimeout(() => { value.textContent = payment.account_value; }, 1800);
        } catch (_) { api().notify('No se pudo copiar. Mantén presionado el dato para copiarlo.', 'error'); }
      });
      box.append(button);
    }
    box.hidden = !box.childElementCount;
  }
  async function copy(value) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(value); return; } catch (_) {}
    }
    const field = document.createElement('textarea');
    field.value = value; field.readOnly = true;
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(field);
    try { field.select(); field.setSelectionRange(0, field.value.length); if (!document.execCommand('copy')) throw Error('copy'); }
    finally { field.remove(); }
  }
  async function refresh(force = false) {
    const user = api()?.getUser(), token = api()?.getToken();
    if (!token || !['boss', 'admin'].includes(user?.role)) {
      requestId++; loadedToken = ''; box.replaceChildren(); box.hidden = true; return;
    }
    if (document.hidden || loading || !force && token === loadedToken && Date.now() - loadedAt < 60000) return;
    const id = ++requestId; loading = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(window.DON_PIEROS_CONFIG.appsScriptUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'dp_get_catalog', origin: location.origin }),
        cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) throw Error('catalog');
      const catalog = await response.json();
      if (id !== requestId || token !== api()?.getToken()) return;
      if (!catalog.ok || !Array.isArray(catalog.payments)) throw Error('payments');
      render(catalog.payments); loadedAt = Date.now(); loadedToken = token;
    } catch (_) { /* Se vuelve a consultar al recuperar la conexión o el foco. */ }
    finally { clearTimeout(timer); loading = false; }
  }
  window.addEventListener('donpieros-session-change', () => void refresh(true));
  window.addEventListener('donpieros-catalog-change', () => void refresh(true));
  window.addEventListener('focus', () => void refresh());
  window.addEventListener('online', () => void refresh(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  window.setInterval(() => void refresh(), 60000);
  void refresh();
})();
