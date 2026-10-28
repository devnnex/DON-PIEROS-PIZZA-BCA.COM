// ÚNICO archivo de conexión compartido por caja, carta y pedidos.
// Pega la NUEVA URL /exec después de implementar appscript/Code.gs.
(() => {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxhrU4AGqxxdCNiIeO_nuX8T4JVKv6aspi0KFACtNVmAdBQvcvhWko11MqYdz5YsAxi/exec';
  window.DON_PIEROS_CONFIG = Object.freeze({
    supabaseUrl: 'https://bxyvxbutjlvoconfsjub.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4eXZ4YnV0amx2b2NvbmZzanViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDcwNDUsImV4cCI6MjEwMzA4MzA0NX0.-7NfjICnFLbUI952-Vpw8vlNo70-p7J9yB8Inqh_7b8',
    whatsappNumber: '573102241444',
    get appsScriptUrl() { return APPS_SCRIPT_URL || localStorage.getItem('don_pieros_apps_script_url') || ''; }
  });
})();
