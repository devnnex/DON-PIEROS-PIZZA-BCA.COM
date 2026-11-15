(() => {
  'use strict';
  if (document.body.dataset.page !== 'admin') return;
  const entries = new Map(), handlers = new Map();
  let scope = '', saved = '', ordinal = 0, revealFrame = 0;
  const host = document.createElement('aside');
  host.className = 'dp-reception-notices';
  host.setAttribute('aria-label', 'Comandas pendientes por orden de llegada');
  document.body.append(host);
  const api = () => window.DonPierosAdmin;
  const storageKey = () => `dp-reception-queue-v1:${window.DON_PIEROS_CONFIG?.supabaseUrl || location.origin}:${new URL('.',document.baseURI).pathname}:${scope}`;
  const kindLabels = {order:'PEDIDO EN LÍNEA', individual:'VENTA INDIVIDUAL', waiter:'COMANDA DEL MESERO'};
  const valid = record => record && Object.hasOwn(kindLabels,record.kind) && typeof record.key === 'string' && /^(request|order):/.test(record.key);
  function persist() {
    if (!scope) return;
    // Never trim unfinished work. Only completed receipt history is bounded.
    const complete = [...entries.values()].filter(entry => entry.complete).sort((a,b) => b.ordinal-a.ordinal);
    for (const entry of complete.slice(2000)) entries.delete(entry.key);
    const value = JSON.stringify([...entries.values()].map(({node,action,...record}) => record.complete
      ? {key:record.key,kind:record.kind,createdAt:record.createdAt,ordinal:record.ordinal,complete:true} : record));
    if (value === saved) return;
    try { localStorage.setItem(storageKey(), value); saved = value; } catch (_) { /* Keep the live queue if storage is unavailable. */ }
  }
  function clearScreen() {
    cancelAnimationFrame(revealFrame); host.replaceChildren(); entries.clear(); ordinal = 0; saved = '';
  }
  function activate() {
    const user = api()?.getUser?.();
    const next = user && api()?.getToken?.() ? String(user.id || user.username || user.role) : '';
    if (next === scope) return Boolean(scope);
    clearScreen(); scope = next;
    if (!scope) return false;
    try {
      const records = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      if (Array.isArray(records)) for (const record of records) {
        if (!valid(record)) continue;
        const entry = {...record, action:null, node:null};
        finish(entry); entries.set(record.key,entry);
        ordinal = Math.max(ordinal, Number(record.ordinal) || 0);
      }
    } catch (_) { /* Rebuild the queue from the server's pending comandas. */ }
    render(); persist(); return true;
  }
  function updateCard(entry) {
    const card = entry.node;
    card.querySelector('strong').textContent = entry.title;
    card.querySelector('p').textContent = entry.detail;
    card.querySelector('.dp-notice-progress').textContent = 'Pendiente: abrir comanda';
    card.querySelector('button').disabled = !entry.action && !handlers.has(entry.kind);
  }
  function createCard(entry) {
    const card = document.createElement('article');
    card.className = 'dp-reception-notice ' + ({waiter:'is-waiter',order:'is-online',individual:'is-individual'})[entry.kind];
    card.dataset.noticeKey = entry.key; card.setAttribute('role','status');
    const header = document.createElement('div'); header.className = 'dp-notice-head';
    const label = document.createElement('span'); label.className = 'dp-notice-label'; label.textContent = kindLabels[entry.kind];
    const number = document.createElement('span'); number.className = 'dp-notice-number'; header.append(label,number);
    const title = document.createElement('strong'), text = document.createElement('p'), progress = document.createElement('small');
    progress.className = 'dp-notice-progress';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Ver comanda';
    const error = document.createElement('small'); error.className = 'dp-notice-error';
    button.onclick = async () => {
      button.disabled = true; error.textContent = '';
      try {
        api()?.revealReception?.(entry.kind === 'waiter' ? 'waiter' : 'order');
        const action = entry.action || handlers.get(entry.kind);
        if (!action) throw Error('La comanda todavía se está cargando.');
        const result = await action(entry);
        if (result === false) throw Error('La comanda no está disponible todavía.');
        mark(entry.key,'viewed');
      } catch (_) { error.textContent = 'No pudimos abrir la comanda. Intenta de nuevo.'; }
      finally { if (button.isConnected) updateCard(entry); }
    };
    card.append(header,title,text,progress,button,error); entry.node = card;
    updateCard(entry); return card;
  }
  function render() {
    const pending = [...entries.values()].filter(entry => !entry.complete)
      .sort((a,b) => (Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0) || a.ordinal-b.ordinal);
    for (const entry of entries.values()) if (entry.complete) { entry.node?.remove(); entry.node = null; }
    pending.forEach((entry,index) => {
      const card = entry.node || createCard(entry);
      updateCard(entry); card.querySelector('.dp-notice-number').textContent = 'Turno ' + (index+1);
      if (host.children[index] !== card) host.insertBefore(card,host.children[index] || null);
    });
  }
  function reveal(kind) {
    const link = document.querySelector(`.admin-sidebar a[href="#${kind === 'order' || kind === 'individual' ? 'onlineorders' : 'dashboard'}"]`);
    if (!link || link.hidden) return;
    link.classList.remove('dp-arrival-flash'); void link.offsetWidth; link.classList.add('dp-arrival-flash');
    setTimeout(() => link.classList.remove('dp-arrival-flash'),6000);
  }
  function show({key,kind,title,detail,createdAt,action,accepted=false}) {
    if (!Object.hasOwn(kindLabels,kind) || !key || !activate()) return;
    let entry = entries.get(key), fresh = !entry;
    if (!entry) {
      entry = {key,kind,title:'',detail:'',createdAt:createdAt || new Date().toISOString(),ordinal:++ordinal,viewed:false,printed:false,accepted:false,complete:false,node:null,action:null};
      entries.set(key,entry);
    }
    if (entry.complete) return;
    const changed = fresh || title && String(title) !== entry.title || detail && String(detail) !== entry.detail
      || createdAt && createdAt !== entry.createdAt || accepted && !entry.accepted;
    const couldOpen = Boolean(entry.action || handlers.has(entry.kind));
    if (action) entry.action = action;
    if (!changed) {
      if (!couldOpen && entry.node && entry.action) updateCard(entry);
      return;
    }
    entry.title = String(title || entry.title); entry.detail = String(detail || entry.detail);
    if (createdAt) entry.createdAt = createdAt;
    if (accepted) entry.accepted = true;
    finish(entry); render(); persist();
    if (fresh) {
      cancelAnimationFrame(revealFrame);
      revealFrame = requestAnimationFrame(() => { revealFrame=0; reveal(kind); });
    }
  }
  function finish(entry) {
    if (entry.viewed) entry.complete = true;
  }
  function mark(key,step) {
    if (!['viewed','printed','accepted'].includes(step) || !activate()) return;
    const entry = entries.get(key); if (!entry || entry.complete || entry[step]) return;
    entry[step] = true; finish(entry); render(); persist();
  }
  function dismiss(key) {
    if (!activate()) return;
    const entry = entries.get(key); if (!entry || entry.complete) return;
    entry.complete = true; render(); persist();
  }
  function register(kind,handler) { handlers.set(kind,handler); if (activate()) render(); }
  function syncRequests(requests,{label,body,accept,open}) {
    if (!activate()) return;
    requests.filter(request => request.request_source === 'waiter')
      .sort((a,b) => (Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0)).forEach(request => {
        const key='request:'+request.id;
        if (!entries.has(key)) show({key,kind:'waiter',title:label(request),detail:body(request),createdAt:request.created_at,
          action:() => open ? open(request.id) : accept(request.id)});
      });
    // A missing or partial snapshot is not an acceptance or a successful print.
  }
  window.addEventListener('storage',event => {
    if (!activate() || event.key !== storageKey() || !event.newValue) return;
    try {
      const records = JSON.parse(event.newValue); if (!Array.isArray(records)) return;
      for (const record of records) {
        if (!valid(record)) continue;
        let entry = entries.get(record.key);
        if (!entry) { entry = {...record,action:null,node:null}; entries.set(record.key,entry); }
        else for (const step of ['viewed','printed','accepted','complete']) if (record[step]) entry[step] = true;
        ordinal = Math.max(ordinal,Number(record.ordinal)||0); finish(entry);
      }
      render(); persist();
    } catch (_) { /* Ignore incomplete storage writes from another tab. */ }
  });
  window.DonPierosReception = {show,dismiss,mark,register,syncRequests,reveal,
    has(key) { return activate() && Boolean(entries.get(key) && !entries.get(key).complete); },
    reset() { clearScreen(); scope=''; }
  };
})();
