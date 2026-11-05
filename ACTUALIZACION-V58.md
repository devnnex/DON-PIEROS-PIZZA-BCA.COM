# Ventas compartidas y menor consumo — v58

Las ventas individuales de caja se conservaban solo en el navegador. Ahora `appscript/Code.gs` las guarda en la pestaña **Ventas_Individuales_Pendientes** del mismo archivo de Google Sheets. Se comparte el cliente, los productos, cantidades, sabores, entrega, cajas, observaciones y tiempo estimado. La pestaña se crea automáticamente. No se necesita ejecutar SQL ni añadir almacenamiento a Supabase.

## Publicación

1. Copia el contenido completo de `appscript/Code.gs` en el proyecto de Apps Script existente.
2. Abre **Implementar → Gestionar implementaciones → Editar → Nueva versión → Implementar**, conservando la misma URL `/exec`, la ejecución como propietario y los permisos actuales.
3. La URL `/exec` debe informar `version: "3.18.0-donpieros"` y `capabilities.sharedIndividualSales: true`.
4. Publica los archivos web v58 (`npm run build` prepara `dist/`) y abre la aplicación actualizada en los dispositivos. Los equipos que conservan borradores antiguos los migran al consultar la recepción. Hay que abrir cada equipo con esos borradores para que pueda enviarlos.

**El push de GitHub actualiza el código del repositorio; no publica automáticamente Apps Script.** La sincronización nueva requiere actualizar esa implementación. No hay credenciales de despliegue de Apps Script configuradas en este repositorio.

## Flujo y protección de datos

- **Nueva venta** abre la carta directamente. Agregar otro producto vuelve a la carta. Cerrar la carta conserva la venta pendiente sin abrir el cobro.
- El botón verde **Enviar e imprimir comanda** agrega el producto, confirma el guardado compartido y prepara el diálogo de impresión. La ventana se abre desde el clic para admitir la impresión en móviles.
- Las ventas pendientes abren el formulario de cobro al seleccionarlas en Inicio.
- La cola local conserva cambios mientras vuelve la conexión y repite la misma operación tras perder una respuesta. Versiones y bloqueos del backend impiden sobrescribir otra edición o autorizar dos cobros de la misma cuenta. Si hay un conflicto, se conserva el borrador y se puede revisar la comanda actual desde su tarjeta.
- La recepción existente consulta las ventas individuales en la misma petición de pedidos, con una revisión independiente. Si no cambiaron, Google devuelve solo la revisión. Un equipo nuevo descarga las cuentas abiertas. Un equipo con borradores antiguos recibe además el identificador y la versión de sus cuentas ya cerradas para impedir que vuelvan a abrirse; no descarga el historial de cierres de todo el negocio.

## Papel y almacenamiento

La comanda individual utiliza el PNG pequeño del negocio, cliente en mayúsculas, sabores debajo del producto y medidas que pueden pasar completas a la siguiente línea. Los importes de productos y cajas aparecen una sola vez al final, seguidos de total y pendiente de cobro. Se probaron los anchos de 58 y 80 mm, incluida la generación del PDF con el logo incorporado.

Las nuevas imágenes de Marca y Carta se comprimen antes de subir cuando el archivo resultante pesa menos; se conserva la transparencia. Límites de dimensión: Marca 1200 px, Carta 2400 px. Las fotografías de productos mantienen su compresión existente a 1400 px. Los archivos únicos tienen caché prolongada. No se borran ni se transforman imágenes ya publicadas.

## Consultas a Supabase

Los cambios por eventos y las acciones explícitas conservan su lectura inmediata. Solo se espacian sondeos de respaldo cuando Realtime está conectado; al fallar el canal se recuperan los intervalos anteriores.

| Respaldo | Realtime conectado, visible | En segundo plano | Canal desconectado |
|---|---:|---:|---:|
| Solicitudes del administrador | 5 s | 30 s | 1 s |
| Cuentas del administrador | 15 s | 60 s | 1,5 s |
| Marca, mesas y catálogo interno | 60 s | 300 s | 5 s |
| Cuenta del cliente | 5 s | 30 s | 1,5 s |
| Chat | 3 s | 15 s | 1,2 s |
| Cambios de reportes | 30 s | 120 s | 1,5 s |

No se trasladan a Supabase las ventas individuales compartidas. Los avisos usan el canal de recepción existente y los datos se leen autenticados en Apps Script. Los tiempos de confirmación dependen de Google y de la conexión; la carta y los cambios locales responden sin esperar a la red.

## Verificación

Pruebas específicas: `individual-shared-backend`, `individual-product-flow-browser`, `supabase-read-budget`, `realtime-reception`, `storage-image-budget` y `checkout-staff`. Cubren dos dispositivos, revisiones y caché sin lecturas repetidas de Sheets, reintentos tras guardar, consecutivos, cierres simultáneos, permisos, envío con impresión, impresión térmica y compresión con transparencia.

`tools/check.cjs`, la preparación de `dist/` y las pruebas específicas pasan. La ejecución amplia de 384 comprobaciones produjo 376 aprobadas y 8 fallidas. Siete fallos se reprodujeron en una copia sin modificar del commit anterior: `client-abonos-sync`, el primer caso de `consumption-stock-freshness`, `inventory-local-status-browser`, `pos-features`, dos casos de `sales-stability-browser` y el primer caso de `visual-details-browser`. El octavo fue un timeout de interacción en el segundo caso de `visual-details-browser`, que había pasado en la ejecución amplia anterior y en la copia original. No se presenta la suite completa como aprobada. Los registros locales están en `artifacts/`.
