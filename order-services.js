(() => {
  'use strict';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  async function api(action, data = {}, timeoutMs = 20000) {
    const config = window.DON_PIEROS_CONFIG || {};
    if (!config.appsScriptUrl) throw new Error('El servicio no está disponible.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(config.appsScriptUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', signal: controller.signal,
        body: JSON.stringify({ action, supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey, ...data })
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
      return result;
    } catch (error) { if (error.name === 'AbortError') throw new Error('La conexión está tardando. Intenta nuevamente.'); throw error; }
    finally { clearTimeout(timeout); }
  }
  let capabilities = null;
  async function requireCapability(name) {
    if (!capabilities) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
      try {
        const url = new URL(window.DON_PIEROS_CONFIG.appsScriptUrl); url.searchParams.set('capabilities', Date.now());
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!result.ok) throw new Error('No se pudo conectar con DonPieros.');
        capabilities = result.capabilities || {};
      } finally { clearTimeout(timer); }
    }
    if (!capabilities[name]) throw new Error(name === 'receipts' ? 'El envío de comprobantes aún no está disponible. Puedes retirarlo y enviar el comprobante al equipo por WhatsApp.' : 'Esta función aún no está disponible. Puedes continuar con tu pedido sin compartir ubicación.');
  }
  function locationUrl(orderId, viewerToken) {
    if (!/^[a-f0-9]{64}$/.test(viewerToken || '')) return '';
    const url = new URL('./ubicacion.html', location.href); url.searchParams.set('order', orderId); url.hash = `token=${viewerToken}`; return url.href;
  }
  function safeLink(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function fileData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error('No pudimos leer la imagen.'));
      reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file);
    });
  }
  async function prepareReceipt(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Elige una imagen JPG, PNG o WebP.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Elige una imagen de hasta 10 MB.');
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = objectUrl; await image.decode();
      const ratio = Math.min(1, 2000 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
      if (!blob) throw new Error('No se pudo preparar la imagen.');
      if (blob.size > 2.5 * 1024 * 1024) blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .7));
      if (!blob || blob.size > 2.5 * 1024 * 1024) throw new Error('La imagen es demasiado grande. Elige una captura más pequeña.');
      const dataUrl = await fileData(blob);
      return { name: file.name.slice(0, 120), mimeType: 'image/jpeg', base64: dataUrl.split(',')[1], dataUrl };
    } catch (error) { if (error.name === 'EncodingError') throw new Error('No pudimos abrir esa imagen. Elige otra captura.'); throw error; }
    finally { URL.revokeObjectURL(objectUrl); }
  }
  async function prepareProductImage(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2.5 * 1024 * 1024) throw new Error('Elige JPG, PNG o WebP de hasta 2.5 MB.');
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = objectUrl; await image.decode();
      const ratio = Math.min(1,1600/Math.max(image.width,image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(image.width*ratio)); canvas.height = Math.max(1,Math.round(image.height*ratio));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
      // Keep small originals when converting does not save transfer bytes.
      const selected = blob && blob.size < file.size ? blob : file;
      return {mimeType:selected.type,base64:(await fileData(selected)).split(',')[1]};
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  window.DonPierosServices = Object.freeze({ api, escapeHtml, locationUrl, requireCapability, prepareReceipt, prepareProductImage, fileData, safeLink });
})();
