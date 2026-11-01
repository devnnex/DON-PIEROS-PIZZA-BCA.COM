# Apps Script de Don Pieros Pizza

Pega únicamente el contenido completo de Code.gs en el proyecto nuevo de Apps Script. Ya incorpora el servicio original de caja y la extensión de menú/pedidos.

Versión actual: **3.16.0-donpieros**. Exige nombre de cliente en nuevas comandas individuales y permite corregir la entrega por producto, recalculando cajas y total. Los envíos del mesero consultan solo los productos elegidos y sus opciones; el aviso de recepción se envía desde el navegador después de guardar. Los clientes anteriores conservan el aviso desde el servidor. Los cobros web sin artículos de inventario evitan leer/regrabar existencias y descargar movimientos históricos. El diario financiero y los reintentos con identidad estable siguen protegiendo ventas y pagos. Publica Code.gs conservando `/exec` y los archivos web **v53** para los avisos por origen, sabores compactos y cobro con recuperación automática en segundo plano. Se conserva el domicilio **Por confirmar**. No requiere SQL adicional. El acceso de mantenimiento sigue documentado en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).

Hoja: 1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E.

Implementa como aplicación web, ejecutando como propietario y con acceso Cualquier persona. Abre la URL /exec una vez para inicializar todas las pestañas sin datos de muestra. También puedes ejecutar CONFIGURAR_SISTEMA antes de implementar.

Pega esa URL en APPS_SCRIPT_URL de ../config.js y publica los archivos web. No necesitas editar app.js.

La guía completa, el orden de SQL y las pruebas de activación están en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).
