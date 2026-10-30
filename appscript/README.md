# Apps Script de Don Pieros Pizza

Pega únicamente el contenido completo de Code.gs en el proyecto nuevo de Apps Script. Ya incorpora el servicio original de caja y la extensión de menú/pedidos.

Versión actual: **3.4.0-donpieros**. Incluye eliminación idempotente de pedidos web y aviso de recepción antes de responder al cliente. Para actualizar una instalación, reemplaza Code.gs y publica una nueva versión de la implementación existente, conservando su URL. Publica también los archivos web nuevos, incluido `pending-deletions.js`, y vuelve a ejecutar `supabase/install/07_COMANDAS_MESERO.sql` para separar la revisión de la comanda de su asignación a la mesa.

Hoja: 1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E.

Implementa como aplicación web, ejecutando como propietario y con acceso Cualquier persona. Abre la URL /exec una vez para inicializar todas las pestañas sin datos de muestra. También puedes ejecutar CONFIGURAR_SISTEMA antes de implementar.

Pega esa URL en APPS_SCRIPT_URL de ../config.js y publica los archivos web. No necesitas editar app.js.

La guía completa, el orden de SQL y las pruebas de activación están en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).
