# Apps Script de Don Pieros Pizza

Pega únicamente el contenido completo de Code.gs en el proyecto nuevo de Apps Script. Ya incorpora el servicio original de caja y la extensión de menú/pedidos.

Versión actual: **3.7.0-donpieros**. Agrega la edición de precios y cajas de pedidos web activos desde administración, con recálculo de totales, control de versiones y validación al cobrar. Para actualizar una instalación, reemplaza Code.gs y publica una nueva versión de la implementación existente, conservando su URL. Publica también los archivos web nuevos, incluido `reception-board.js`. Esta actualización no requiere SQL adicional si ya ejecutaste los archivos de instalación 01 a 07.

Hoja: 1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E.

Implementa como aplicación web, ejecutando como propietario y con acceso Cualquier persona. Abre la URL /exec una vez para inicializar todas las pestañas sin datos de muestra. También puedes ejecutar CONFIGURAR_SISTEMA antes de implementar.

Pega esa URL en APPS_SCRIPT_URL de ../config.js y publica los archivos web. No necesitas editar app.js.

La guía completa, el orden de SQL y las pruebas de activación están en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).
