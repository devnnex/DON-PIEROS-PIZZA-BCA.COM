# Don Pieros Pizza

Carta digital, pedidos en línea y atención de mesas para Don Pieros Pizza.

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
