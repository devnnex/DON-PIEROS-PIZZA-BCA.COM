(() => {
  'use strict';
  if (document.body.dataset.page !== 'admin') return;
  const notices = new Map(), announced = new Set();
  let revealFrame=0;
  const host = document.createElement('aside');
  host.className = 'dp-reception-notices';
  host.setAttribute('aria-label', 'Nuevos pedidos y solicitudes');
  document.body.append(host);
  const api = () => window.DonPierosAdmin;
  const dismiss = key => {
    const notice = notices.get(key);
    if (!notice) return;
    clearTimeout(notice.timer); notice.element.remove(); notices.delete(key);
  };
  function reveal(kind) {
    const link = document.querySelector(`.admin-sidebar a[href="#${kind === 'order' ? 'onlineorders' : 'dashboard'}"]`);
    if (link && !link.hidden) {
      const nav = link.closest('nav');
      const box = link.getBoundingClientRect(), parent = nav.getBoundingClientRect();
      if (box.top < parent.top || box.bottom > parent.bottom || box.left < parent.left || box.right > parent.right) nav.scrollTo({top: nav.scrollTop + box.top - parent.top - 12, left:nav.scrollLeft + box.left - parent.left, behavior: 'smooth'});
      link.classList.remove('dp-arrival-flash'); void link.offsetWidth; link.classList.add('dp-arrival-flash');
      setTimeout(() => link.classList.remove('dp-arrival-flash'), 6000);
    }
    // Keep the open comanda or an edit form intact while signalling the arrival.
    if (!document.querySelector('dialog[open]')) api()?.revealReception?.(kind);
  }
  function show({key, kind, title, detail, action}) {
    if (!key || announced.has(key)) return;
    announced.add(key);
    const card = document.createElement('article');
    card.className = 'dp-reception-notice'; card.dataset.noticeKey = key;
    if(kind==='waiter')card.classList.add('is-waiter');
    if(kind==='order')card.classList.add('is-money');
    const heading = document.createElement('strong'), text = document.createElement('p');
    heading.textContent = title; text.textContent = detail;
    const label = document.createElement('span'); label.className = 'dp-notice-label';
    label.textContent = kind === 'order' ? 'NUEVA ORDEN' : kind==='waiter'?'COMANDA DEL MESERO':'SOLICITUD DE MESA';
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = kind === 'order'||kind==='waiter' ? 'Aceptar · Ver comanda' : 'Aceptar solicitud';
    const error = document.createElement('small'); error.className = 'dp-notice-error';
    button.onclick = async () => {
      button.disabled = true; error.textContent = '';
      try { await action(); } catch (_) { error.textContent = 'No pudimos completar la acción. Intenta de nuevo.'; }
      finally { if (button.isConnected) button.disabled = false; }
    };
    card.append(label, heading, text, button, error);
    card.setAttribute('role', 'status'); host.prepend(card);
    notices.set(key, {element:card, timer:setTimeout(() => dismiss(key), 60000)});
    cancelAnimationFrame(revealFrame);
    revealFrame=requestAnimationFrame(() => {revealFrame=0;reveal(kind);});
    requestAnimationFrame(() => {
      const attribute = kind === 'order' ? 'data-dp-order' : 'data-alert-card';
      const id = key.slice(key.indexOf(':') + 1);
      for (const target of document.querySelectorAll(`[${attribute}]`)) if (target.getAttribute(attribute) === id) {
        target.classList.add('dp-content-flash'); setTimeout(() => target.classList.remove('dp-content-flash'), 6000);
      }
    });
  }
  function syncRequests(requests, {label, body, accept}) {
    const pending = new Set(requests.map(request => 'request:' + request.id));
    for (const key of notices.keys()) if (key.startsWith('request:') && !pending.has(key)) dismiss(key);
    for (const request of requests) show({key:'request:' + request.id, kind:request.request_source==='waiter'?'waiter':'request', title:label(request),
      detail:body(request), action:() => accept(request.id)});
  }
  window.DonPierosReception = {show, dismiss, syncRequests, reveal, reset() {
    cancelAnimationFrame(revealFrame);for (const key of notices.keys()) dismiss(key); announced.clear();
  }};
})();
