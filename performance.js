(() => {
  'use strict';
  const namespace = `don-pieros-fast-v1:${window.DON_PIEROS_CONFIG.supabaseUrl}:${window.DON_PIEROS_CONFIG.appsScriptUrl}:`;
  const imageNames = new Set(['logo','original','poderosa','payes','parfait','maracu-brownie','choco-cruch','fresas','bebidas']);
  function imageUrl(value) {
    return value || './images/don-pieros-logo.png';
  }
  function read(key, maxAge, storage = sessionStorage) {
    try { const record = JSON.parse(storage.getItem(namespace+key) || 'null'); if (record && Date.now()-record.at <= maxAge && record.at <= Date.now()) return record.value; } catch { /* Storage may be disabled. */ }
    return null;
  }
  function write(key,value,storage = sessionStorage) {
    try { const text=JSON.stringify({at:Date.now(),value}); if(text.length<=1000000)storage.setItem(namespace+key,text); } catch { /* Cache never blocks an action. */ }
  }
  function remove(key,storage = sessionStorage) { try {storage.removeItem(namespace+key)}catch { /* Optional cache. */ } }
  window.DonPierosPerformance = Object.freeze({imageUrl,read,write,remove});
  if ('serviceWorker' in navigator) window.addEventListener('load',() => {
    const register = () => { void navigator.serviceWorker.register('./service-worker.js').catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(register,{timeout:3000}); else setTimeout(register,300);
  });
})();
