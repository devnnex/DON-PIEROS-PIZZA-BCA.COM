(() => {
  'use strict';
  const box = document.querySelector('#adminPaymentShortcuts');
  if (!box || document.body.dataset.staffEntry === 'waiter') return;
  const api = () => window.DonPierosAdmin;
  const fast = () => window.DonPierosPerformance;
  let signature = '', pending = false;
  const clipboardIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H5v16h14V5h-3"/></svg>';
  const copiedIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const allowed = () => Boolean(api()?.getToken() && ['boss','admin'].includes(api()?.getUser()?.role));
  function render(payments) {
    if (!allowed()) return;
    const rows = payments.filter(p => p.available && String(p.account_value || '').trim());
    const next = JSON.stringify(rows.map(p => [p.id,p.name,p.account_value]));
    if (next === signature) return;
    signature = next;
    box.replaceChildren();
    for (const payment of rows) {
      const name = String(payment.name || '').toUpperCase();
      const copyValue = name.includes('BANCOLOMBIA') && name.includes('AHORROS')
        ? 'BANCOLOMBIA - AHORROS: ' + String(payment.account_value).trim()
        : String(payment.account_value);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'admin-payment-copy';
      button.setAttribute('aria-label', 'Copiar ' + payment.name + ': ' + payment.account_value);
      button.title = 'Copiar ' + payment.name;
      const text = document.createElement('span'), label = document.createElement('small'), value = document.createElement('strong');
      label.textContent = payment.name; value.textContent = payment.account_value;
      text.append(label, value); button.append(text);
      const icon = document.createElement('span'); icon.className = 'admin-payment-copy-icon'; icon.innerHTML = clipboardIcon; button.append(icon);
      let copiedTimer;
      button.addEventListener('click', async () => {
        if (!api()?.getUser() || !window.DonPierosSessionGuard?.ensureActive()) return;
        try {
          await copy(copyValue);
          api().notify(payment.name + ': dato copiado.', 'ok');
          clearTimeout(copiedTimer); button.dataset.copied = ''; icon.innerHTML = copiedIcon; button.title = 'Copiado';
          copiedTimer = window.setTimeout(() => { delete button.dataset.copied; icon.innerHTML = clipboardIcon; button.title = 'Copiar ' + payment.name; }, 1800);
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
  async function refresh() {
    if (!allowed()) { signature = ''; box.replaceChildren(); box.hidden = true; return; }
    const cached = fast()?.readCatalog?.();
    if (cached) { render(cached.payments); return; }
    if (document.hidden || pending) return;
    pending = true;
    try {
      const catalog = await fast()?.loadCatalog?.();
      if (catalog && allowed()) render(catalog.payments);
    } catch (_) { /* Se vuelve a consultar al recuperar la conexión o el foco. */ }
    finally { pending = false; }
  }
  window.addEventListener('donpieros-public-catalog-ready', event => render(event.detail.payments));
  window.addEventListener('donpieros-payment-methods-change', event => { if(Array.isArray(event.detail))render(event.detail); });
  window.addEventListener('donpieros-session-change', () => void refresh());
  window.addEventListener('donpieros-catalog-change', event => {
    if(Array.isArray(event.detail?.payments))render(event.detail.payments);else void refresh();
  });
  window.addEventListener('focus', () => void refresh());
  window.addEventListener('online', () => void refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  void refresh();
})();
