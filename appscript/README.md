# Apps Script de Don Pieros Pizza

Pega únicamente el contenido completo de Code.gs en el proyecto nuevo de Apps Script. Ya incorpora el servicio original de caja y la extensión de menú/pedidos.

Versión actual: **3.20.0-donpieros**, archivos web **v67**. Conserva el teléfono del cliente en la columna final `telefono_cliente` de `Ventas` y lo devuelve al consultar el historial para reimprimir desde otros equipos. La actualización agrega el encabezado sin alterar las ventas anteriores; una corrección de un cliente antiguo sin campo teléfono conserva el teléfono guardado. Publica el contenido completo de **Code.gs** como una nueva versión de la implementación existente, conservando `/exec`. El push no actualiza por sí solo Apps Script. No requiere SQL adicional.

En la venta individual, el modal del producto incluye nombre y teléfono obligatorios, tiempo estimado y observaciones de la comanda; estos datos se conservan al seguir agregando productos. El teléfono se incluye en la comanda y la factura. Al agregar un producto se regresa al catálogo y al cerrarlo se vuelve a la comanda. Las impresiones colocan las observaciones antes del primer producto y subrayan en verde las observaciones y la entrega a domicilio, conservando la letra negra en negrita.

Hoja: 1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E.

Implementa como aplicación web, ejecutando como propietario y con acceso Cualquier persona. Abre la URL /exec una vez para inicializar todas las pestañas sin datos de muestra. También puedes ejecutar CONFIGURAR_SISTEMA antes de implementar.

Pega esa URL en APPS_SCRIPT_URL de ../config.js y publica los archivos web. No necesitas editar app.js.

La guía completa, el orden de SQL y las pruebas de activación están en [LEEME-IMPLEMENTACION.md](../LEEME-IMPLEMENTACION.md).
