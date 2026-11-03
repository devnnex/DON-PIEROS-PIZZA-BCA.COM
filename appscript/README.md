# Apps Script de Don Pieros Pizza

Pega únicamente el contenido completo de Code.gs en el proyecto nuevo de Apps Script. Ya incorpora el servicio original de caja y la extensión de menú/pedidos.

Versión actual: **3.17.0-donpieros**. Acepta **Domicilio** como entrega por producto en las comandas individuales y al agregar o editar productos, calculando las cajas por tamaño y cantidad. Conserva las entregas y notas al reeditar. Publica el contenido completo de **Code.gs** como una nueva versión de la implementación existente, conservando `/exec`, junto con los archivos web **v56**. El push de los archivos web no actualiza por sí solo Apps Script. No requiere SQL adicional.

En la venta individual, el modal del producto incluye nombre del cliente, tiempo estimado y observaciones de la comanda; estos datos se conservan al seguir agregando productos. Al agregar un producto se regresa al catálogo y al cerrarlo se vuelve a la comanda. Las impresiones colocan las observaciones antes del primer producto y subrayan en verde las observaciones y la entrega a domicilio, conservando la letra negra en negrita.

Hoja: 1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E.

Implementa como aplicación web, ejecutando como propietario y con acceso Cualquier persona. Abre la URL /exec una vez para inicializar todas las pestañas sin datos de muestra. También puedes ejecutar CONFIGURAR_SISTEMA antes de implementar.

Pega esa URL en APPS_SCRIPT_URL de ../config.js y publica los archivos web. No necesitas editar app.js.

La guía completa, el orden de SQL y las pruebas de activación están en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).
