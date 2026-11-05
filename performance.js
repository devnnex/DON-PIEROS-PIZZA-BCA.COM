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
  window.DonPierosPerformance = Object.freeze({imageUrl,read,write,remove,compressImage});
  if ('serviceWorker' in navigator) window.addEventListener('load',() => {
    const register = () => { void navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).then(registration=>registration.update()).catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(register,{timeout:3000}); else setTimeout(register,300);
  });
})();
