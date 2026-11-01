# Apps Script de Don Pieros Pizza

Pega únicamente el contenido completo de Code.gs en el proyecto nuevo de Apps Script. Ya incorpora el servicio original de caja y la extensión de menú/pedidos.

Versión actual: **3.15.0-donpieros**. Conserva ventas individuales de meseros y pedidos web compartidos, y devuelve los productos y cajas confirmados para WhatsApp. Coloca la pizza combinada primero y La Pamplonita después una sola vez, sin restablecer precios ni disponibilidad. Al cobrar productos y cajas de un domicilio sin tarifa, mantiene **Por confirmar** y guarda ese indicador en el historial. Publica Code.gs conservando `/exec` y los archivos web v52 para los selectores de entrega obligatorios, la nueva foto y el desglose impreso. Esta actualización no requiere SQL adicional. El acceso de mantenimiento sigue documentado en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).

Hoja: 1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E.

Implementa como aplicación web, ejecutando como propietario y con acceso Cualquier persona. Abre la URL /exec una vez para inicializar todas las pestañas sin datos de muestra. También puedes ejecutar CONFIGURAR_SISTEMA antes de implementar.

Pega esa URL en APPS_SCRIPT_URL de ../config.js y publica los archivos web. No necesitas editar app.js.

La guía completa, el orden de SQL y las pruebas de activación están en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).
