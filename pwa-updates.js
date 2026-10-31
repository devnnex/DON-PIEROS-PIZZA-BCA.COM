(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  const version = document.querySelector('meta[name="app-version"]')?.content;
  let registration, checking, pendingVersion, reloading = false, lastCheck = 0, checkAgain = false;
  const dirtyForms = new Set();
  document.addEventListener('input', event => { if (event.target.form) dirtyForms.add(event.target.form); }, true);
  document.addEventListener('reset', event => dirtyForms.delete(event.target), true);
  function applyUpdate() {
    if (!pendingVersion || reloading || document.hidden || !navigator.onLine) return;
    // Feature modules can defer a reload while there is unsaved work.
    const event = new Event('don-pieros-before-update', { cancelable: true });
    if (!window.dispatchEvent(event)) return;
    if (document.querySelector('dialog[open],form[aria-busy="true"]')) return;
    for (const form of dirtyForms) {
      if (!form.isConnected) dirtyForms.delete(form);
      else if (form.getClientRects().length) return;
    }
    // A temporarily stale CDN must not cause repeated reloads of one release.
    try {
      const key = 'don-pieros-update-reload', previous = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (previous?.version === pendingVersion && Date.now() - previous.at < 60000) return;
      sessionStorage.setItem(key, JSON.stringify({ version: pendingVersion, at: Date.now() }));
    } catch (_) {}
    reloading = true;
    const url = new URL(location.href);
    url.searchParams.set('__app_update', pendingVersion);
    location.replace(url.href);
  }
  async function check(force = false) {
    if (checking) { if (force) checkAgain = true; return checking; }
    if (document.hidden || !navigator.onLine || (!force && Date.now() - lastCheck < 15000)) return;
    lastCheck = Date.now();
    checking = (async () => {
      try {
        registration ||= await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
        // Update checks and the small release marker bypass HTTP caches.
        const updated = registration.update().catch(() => {});
        const url = new URL('./app-release.json', document.baseURI);
        url.searchParams.set('__fresh', Date.now());
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return;
        const release = await response.json();
        await updated;
        const installing = registration.installing;
        if (installing && installing.state !== 'activated' && installing.state !== 'redundant') {
          await new Promise(resolve => {
            const timer = setTimeout(resolve, 5000);
            installing.addEventListener('statechange', () => {
              if (['activated','redundant'].includes(installing.state)) { clearTimeout(timer); resolve(); }
            });
          });
        }
        if (registration.installing) return;
        if (version && release.version && release.version !== version) pendingVersion = release.version;
        applyUpdate();
      } catch (_) { /* Keep the current screen and retry when connectivity returns. */ }
    })().finally(() => {
      checking = null;
      if (checkAgain && !reloading) { checkAgain = false; void check(true); }
    });
    return checking;
  }
  window.addEventListener('pageshow', () => void check(true));
  window.addEventListener('online', () => void check(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(true); });
  // A new worker does not reload a page on its own. Compare the release before
  // reloading so the first installation and an unchanged version never loop.
  navigator.serviceWorker.addEventListener('controllerchange', () => void check(true));
  window.addEventListener('don-pieros-update-ready', applyUpdate);
  document.addEventListener('click', () => { if (pendingVersion) window.setTimeout(applyUpdate, 0); });
  window.setInterval(() => { applyUpdate(); void check(); }, 60000);
  void check(true);
})();
