(() => {
  'use strict';
  const namespace = `don-pieros-fast-v1:${window.DON_PIEROS_CONFIG.supabaseUrl}:${window.DON_PIEROS_CONFIG.appsScriptUrl}:`;
  const imageNames = new Set(['logo','original','poderosa','payes','parfait','maracu-brownie','choco-cruch','fresas','bebidas']);
  function imageUrl(value) {
    return value || './images/don-pieros-logo.png';
  }
  function resolveStorage(storage) {
    return storage === 'local' ? localStorage : storage || sessionStorage;
  }
  function read(key, maxAge, storage) {
    try { const record = JSON.parse(resolveStorage(storage).getItem(namespace+key) || 'null'); if (record && Date.now()-record.at <= maxAge && record.at <= Date.now()) return record.value; } catch { /* Storage may be disabled. */ }
    return null;
  }
  function write(key,value,storage) {
    try { const text=JSON.stringify({at:Date.now(),value}); if(text.length<=1000000)resolveStorage(storage).setItem(namespace+key,text); } catch { /* Cache never blocks an action. */ }
  }
  function remove(key,storage) { try {resolveStorage(storage).removeItem(namespace+key)}catch { /* Optional cache. */ } }
  async function compressImage(file,maxDimension=1920){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))return file;
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;await img.decode();
      const ratio=Math.min(1,maxDimension/Math.max(img.naturalWidth,img.naturalHeight));
      if(ratio===1&&file.size<160000)return file;
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));
      return blob&&blob.size<file.size?blob:file;
    }catch(_){return file;}finally{URL.revokeObjectURL(url);}
  }
  // La precarga, la carta de meseros y los datos bancarios comparten una lectura.
  const catalogAge = 3 * 60000;
  let catalogLoading = null, catalogRevision = 0, catalogMemory = null, catalogMemoryAt = 0;
  function normalizeCatalog(value) {
    if (Array.isArray(value)) value = { products:value[0]?.data, toppings:value[1]?.data, payments:value[2]?.data, neighborhoods:value[3]?.data };
    return Array.isArray(value?.products) && Array.isArray(value?.toppings) && Array.isArray(value?.payments) ? value : null;
  }
  function readCatalog({allowStale = false} = {}) {
    const age = allowStale ? 7 * 86400000 : catalogAge;
    if(catalogMemory && Date.now() >= catalogMemoryAt && Date.now()-catalogMemoryAt <= age)return catalogMemory;
    return normalizeCatalog(read('staff-public-catalog',age,'local')) || normalizeCatalog(read('catalog',age,'local'));
  }
  function previewCatalog() {
    const snapshot = window.DonPierosCatalogSnapshot;
    return readCatalog({allowStale:true}) || (snapshot?.source === window.DON_PIEROS_CONFIG.appsScriptUrl ? normalizeCatalog(snapshot.catalog) : null);
  }
  async function requestCatalog() {
    let lastError;
    for(let attempt=0;attempt<2;attempt++){
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let timer;
      try {
        const result = await Promise.race([
          fetch(window.DON_PIEROS_CONFIG.appsScriptUrl, {
            method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, cache:'no-store',
            ...(controller?{signal:controller.signal}:{}),body:JSON.stringify({action:'dp_get_catalog',origin:location.origin})
          }).then(async response => {const result=await response.json();if(!response.ok || !result.ok || !normalizeCatalog(result))throw Error('No pudimos cargar la carta. Intenta de nuevo.');return result;}),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('La carta tardó en responder.'));},12000);})
        ]);
        return normalizeCatalog(result);
      } catch(error){lastError=error;} finally {clearTimeout(timer);}
    }
    throw lastError;
  }
  function loadCatalog({force = false} = {}) {
    if (catalogLoading) return catalogLoading;
    const cached = !force && readCatalog();
    if (cached) return Promise.resolve(cached);
    catalogLoading = (async () => {
      let data, revision;
      do {
        revision = catalogRevision;
        data = await requestCatalog();
      } while (revision !== catalogRevision);
      catalogMemory = data;catalogMemoryAt=Date.now();
      write('staff-public-catalog',data,'local');
      window.dispatchEvent(new CustomEvent('donpieros-public-catalog-ready',{detail:data}));
      return data;
    })().finally(() => { catalogLoading = null; });
    return catalogLoading;
  }
  window.addEventListener('donpieros-catalog-change',() => {
    catalogRevision++;
    catalogMemory = null;catalogMemoryAt=0;
    remove('staff-public-catalog','local'); remove('catalog','local');
  });
  window.DonPierosPerformance = Object.freeze({imageUrl,read,write,remove,compressImage,readCatalog,previewCatalog,loadCatalog});
  if(typeof document !== 'undefined' && document.querySelector('#products'))void loadCatalog().catch(()=>{});
  if ('serviceWorker' in navigator) window.addEventListener('load',() => {
    const register = () => { void navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).then(registration=>registration.update()).catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(register,{timeout:3000}); else setTimeout(register,300);
  });
})();
