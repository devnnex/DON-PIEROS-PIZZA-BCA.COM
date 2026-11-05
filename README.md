# Don Pieros Pizza

**Actualización v58:** ventas individuales compartidas en Google Sheets mediante Apps Script **3.18.0**, con cola local, reintentos y protección frente a cobros simultáneos. Nueva venta abre la carta; **Enviar e imprimir comanda** confirma y prepara la impresión desde el producto. Comanda compacta con logo PNG, cliente en mayúsculas, sabores bajo el producto e importes solo al final. Menos sondeos a Supabase con Realtime conectado e imágenes nuevas comprimidas. Publica la nueva versión de `Code.gs` conservando `/exec`; no requiere SQL. Pasos en [ACTUALIZACION-V58.md](ACTUALIZACION-V58.md).

Carta digital, pedidos en línea y atención de mesas para Don Pieros Pizza.

**Actualización v53:** nombre del cliente obligatorio con foco y aviso rojo al enviar la venta individual. Los dos sabores se muestran juntos y la entrega puede corregirse al editar, recalculando cajas. Los avisos aparecen desde cualquier sección: «Ver comanda» abre Inicio y el detalle; negro para web, verde para mesas y azul para individuales. El cobro web retira el pedido tras proteger el intento y confirma/reintenta en segundo plano sin errores de conexión ni botones manuales; no vuelve a registrar ventas confirmadas. Publica Apps Script **3.16.0** y los archivos web v53; no requiere SQL adicional. Se conservan las cajas y el domicilio **Por confirmar**.

**Actualización v51:** los meseros pueden tomar ventas individuales y enviar sus comandas a la recepción compartida para imprimir y cobrar desde caja. Publica Apps Script **3.14.0** conservando `/exec`. El acceso privado de mantenimiento se habilita mediante `supabase/install/08_ACCESO_MANTENIMIENTO.sql` y el generador local de credenciales; no vence y permite eliminar la propia cuenta. Consulta los pasos en [LEEME-IMPLEMENTACION.md](LEEME-IMPLEMENTACION.md).

**Actualización de mesas:** ejecuta `supabase/install/07_COMANDAS_MESERO.sql` después de 01–06. El mesero toma pedidos con categorías, fotografías, tamaños y notas. Enviar deja la comanda pendiente; aceptar desde administración agrega sus productos al consumo de la mesa una sola vez. Administración y el mesero pueden corregir la misma comanda antes o después de aceptarla. Los consumos aceptados se cobran con la caja existente; la venta de artículos del inventario se conserva. Esta actualización no requiere volver a publicar Code.gs.

El icono de administración lleva un aro rojo y una etiqueta amarilla **ADMIN**. La aplicación de pedidos conserva su icono original. Si el teléfono conserva el icono anterior de administración, vuelve a añadirla a la pantalla de inicio.

Los domicilios admiten barrio escrito o seleccionado; si no existe una tarifa, queda por confirmar. Pedidos web y solicitudes de mesa tienen sonidos distintos y anuncios por voz. Para habilitar el barrio libre en una instalación existente, publica `appscript/Code.gs` versión **3.3.0** conservando la URL. No se añade SQL para esta actualización.

- `index.html`: carta, selección de tamaños y adicionales, carrito y confirmación del pedido.
- `mesa.html`: atención mediante QR, chat con el equipo, carta y consulta de la cuenta.
- `admin.html`: caja, inventario, ventas, pedidos, usuarios y personalización de la marca.
- `supabase/install/`: instalación y actualizaciones ordenadas.
- `appscript/Code.gs`: integración con el archivo único de inventario, ventas y pedidos.

La guía completa de configuración está en [LEEME-IMPLEMENTACION.md](LEEME-IMPLEMENTACION.md). Los alcances y las comprobaciones están en [VERIFICACION-DON-PIEROS.md](VERIFICACION-DON-PIEROS.md).

Para una instalación ya actualizada hasta el paso 05, aplica `supabase/install/06_OPCIONES_QR.sql` para habilitar los nuevos interruptores de Marca. Los QR impresos mantienen el tamaño de 9 × 9 cm; vuelve a descargar el PDF para obtener el logo y el diseño rojo sin cambiar el identificador de la mesa.

Abre `VISTA-PREVIA.cmd` para revisar el sitio localmente. `PUBLICAR.ps1` o `npm run build` preparan la carpeta `dist/` con los archivos web. El repositorio conserva el proyecto fuente completo; las dependencias instaladas, archivos de entorno, paquetes ZIP y resultados generados quedan excluidos.
