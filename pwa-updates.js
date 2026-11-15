(() => {
  'use strict';
  const version = document.querySelector('meta[name="app-version"]')?.content;
  if (!version) return;
  let registration, workerUpdating, checking, pendingVersion, reloading = false, lastCheck = 0, checkAgain = false;
  const dirtyForms = new Set();
  const markDirty = event => {
    for (const form of dirtyForms) if (!form.isConnected) dirtyForms.delete(form);
    const form = event.target.form;
    if (form && !form.matches('#incomeFilterForm,#purchaseFilters,[data-update-safe]')) dirtyForms.add(form);
  };
  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  document.addEventListener('reset', event => dirtyForms.delete(event.target), true);
  function applyUpdate() {
    if (!pendingVersion || reloading || document.hidden || !navigator.onLine) return;
    // Feature modules can defer a reload while there is unsaved work.
    const event = new Event('don-pieros-before-update', { cancelable: true });
    if (!window.dispatchEvent(event)) return;
    if (document.querySelector('dialog[open],details[open],form[aria-busy="true"]') || window.DonPierosRemotePrint?.busy) return;
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
  async function freshFetch(url) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      return { ok: response.ok, body: await response.text() };
    }
    finally { clearTimeout(timer); }
  }
  async function updateWorker() {
    // Private mode, policy or browser support may prevent registration. Release
    // detection must continue even when offline caching is unavailable.
    if (!navigator.serviceWorker) return;
    if (workerUpdating) return workerUpdating;
    workerUpdating = (async () => {
      let timer;
      try {
        await Promise.race([
          (async () => {
            registration ||= await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
            await registration.update();
          })(),
          new Promise(resolve => { timer = setTimeout(resolve, 5000); })
        ]);
      } catch (_) { /* The page can still receive the published release. */ }
      finally { clearTimeout(timer); workerUpdating = null; }
    })();
    return workerUpdating;
  }
  async function check(force = false) {
    if (checking) { if (force) checkAgain = true; return checking; }
    if (document.hidden || !navigator.onLine || (!force && Date.now() - lastCheck < 15000)) return;
    lastCheck = Date.now();
    checking = (async () => {
      try {
        const url = new URL('./app-release.json', document.baseURI);
        url.searchParams.set('__fresh', Date.now());
        const response = await freshFetch(url);
        if (!response.ok) return;
        const release = JSON.parse(response.body);
        if (typeof release.version !== 'string' || !release.version || release.version.length > 100) return;
        if (release.version === version) { pendingVersion = null; return; }
        if (pendingVersion === release.version) { applyUpdate(); return; }
        await updateWorker();
        const installing = registration?.installing;
        if (installing && installing.state !== 'activated' && installing.state !== 'redundant') {
          await new Promise(resolve => {
            const finish = () => { clearTimeout(timer); installing.removeEventListener('statechange', changed); resolve(); };
            const changed = () => { if (['activated','redundant'].includes(installing.state)) finish(); };
            const timer = setTimeout(finish, 5000);
            installing.addEventListener('statechange', changed);
          });
        }
        if (registration?.installing) return;
        // Pages/CDN can briefly expose the marker before the matching HTML.
        // Reload only after this particular page is available in that release.
        const pageUrl = new URL(location.href);
        pageUrl.searchParams.set('__fresh', Date.now());
        const pageResponse = await freshFetch(pageUrl);
        if (!pageResponse.ok) return;
        const published = new DOMParser().parseFromString(pageResponse.body, 'text/html');
        if (published.querySelector('meta[name="app-version"]')?.content !== release.version) { pendingVersion = null; return; }
        pendingVersion = release.version;
        applyUpdate();
      } catch (_) { /* Keep the current screen and retry when connectivity returns. */ }
    })().finally(() => {
      checking = null;
      if (checkAgain && !reloading) { checkAgain = false; void check(true); }
    });
    return checking;
  }
  window.addEventListener('pageshow', () => void check(true));
  window.addEventListener('focus', () => void check(true));
  window.addEventListener('online', () => void check(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(true); });
  // A new worker does not reload a page on its own. Compare the release before
  // reloading so the first installation and an unchanged version never loop.
  navigator.serviceWorker?.addEventListener('controllerchange', () => void check(true));
  window.addEventListener('don-pieros-update-ready', applyUpdate);
  document.addEventListener('click', () => { if (pendingVersion) window.setTimeout(applyUpdate, 0); });
  for (const name of ['close','toggle','reset']) document.addEventListener(name, () => {
    if (pendingVersion) window.setTimeout(applyUpdate, 0);
  }, true);
  window.setInterval(() => { applyUpdate(); void check(); }, 30000);
  void updateWorker();
  void check(true);
})();
