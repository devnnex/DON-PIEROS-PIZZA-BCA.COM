# Apps Script de Don Pieros Pizza

Pega únicamente el contenido completo de Code.gs en el proyecto nuevo de Apps Script. Ya incorpora el servicio original de caja y la extensión de menú/pedidos.

Versión actual: **3.14.0-donpieros**. Agrega ventas individuales tomadas por meseros a la recepción compartida, con el responsable, notas, cajas y reintentos sin duplicar. Conserva la edición, impresión y cobro de pedidos y la pizza combinada. Para actualizar, reemplaza Code.gs y publica una nueva versión de la implementación existente, conservando su URL `/exec`. Publica también los archivos web v51. El acceso de mantenimiento se aprovisiona aparte en Supabase siguiendo [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md); requiere la actualización SQL 08 y el archivo privado de activación.

Hoja: 1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E.

Implementa como aplicación web, ejecutando como propietario y con acceso Cualquier persona. Abre la URL /exec una vez para inicializar todas las pestañas sin datos de muestra. También puedes ejecutar CONFIGURAR_SISTEMA antes de implementar.

Pega esa URL en APPS_SCRIPT_URL de ../config.js y publica los archivos web. No necesitas editar app.js.

La guía completa, el orden de SQL y las pruebas de activación están en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).
