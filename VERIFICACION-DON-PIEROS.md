# Verificación de Don Pieros Pizza · 27 octubre 2026

Respuesta de la interfaz: las pruebas de escritorio y móvil mantuvieron la navegación y la escritura operativas con consultas detenidas, con y sin conexión; los controles medidos respondieron entre 1 y 75 ms en el entorno de prueba. Se eliminó la espera fija de 2,2 segundos tras confirmar consumos. La cuenta disponible y el chat se abren sin esperar una lectura adicional; una consulta tardía no vuelve a abrir una cuenta cerrada. La disponibilidad cambia visualmente al tocar y se restaura si el servidor rechaza el cambio. Guardar productos reutiliza el resultado confirmado y no espera otra consulta del catálogo ni la limpieza de la foto anterior. Las confirmaciones de escritura siguen dependiendo de la respuesta real del servicio.

Servicio por QR: vista de pizzería revisada en móvil y escritorio; Chat enfoca el campo en el mismo clic, y se comprobaron pedidos, llamado al mesero, cuenta y carta sin mostrar canciones. Se verificaron los cuatro interruptores de Marca guardando, ocultando y volviendo a mostrar cada opción desde otro navegador. `06_OPCIONES_QR.sql` se comprobó localmente con lectura del cliente y permisos del Jefe; queda por aplicarlo en la instalación real.

QR personalizados: se decodificaron seis imágenes con logo a 420, 720 y 1000 px para dos direcciones de mesa. Se conservaron la URL, la corrección de errores alta y el margen blanco. El PDF mantiene tarjetas de 90 × 90 mm, marco y nombre en rojo, y pie grande en negrita. La impresión física debe hacerse a escala 100 %.

Última actualización: navegación, cierre del turno con un clic, foco tras guardar una mesa y separación de pedidos de mesero/cliente comprobados en Chrome. La actualización `05_PEDIDOS_MESERO.sql` se comprobó localmente con sesiones reales: nombre verificado, permisos, reintentos sin duplicados y aviso demorado sin reabrir una cuenta cerrada. El usuario confirmó su ejecución en la instalación real. La interfaz también se comprobó con errores técnicos simulados para verificar mensajes claros sin nombres de servicios ni direcciones de conexión.

Carta del cliente: las opciones pendientes se resaltan en rojo al intentar agregar, y las selecciones completas muestran borde verde y «✓ Correcto». El carrito inferior es amarillo y destella al agregar, manteniendo el contador negro. El aviso entra desde arriba con una breve sacudida horizontal y deja libre la navegación inferior. Se comprobó también la preferencia de movimiento reducido. Las tarjetas de ubicación e información del negocio usan fondos cálidos y bordes dorados, con un acento rojo.

Implementación local completada: duplicación de caja, servicio de mesas, carta y pedidos, marca, catálogo editable, fotografías en Storage, selección de tamaños, combinaciones de pizza sencilla y comandas térmicas.

- 302 comprobaciones de regresión de caja y backend aprobadas antes de incorporar la carta inicial.
- 9 pruebas específicas de pedidos y catálogo aprobadas: precios de servidor, permisos, domicilio, versiones, recuperación de respuesta perdida, paginación, carga inicial y conservación de cambios.
- Los tres SQL se instalaron en PostgreSQL local con pgcrypto real. Se comprobaron primer Jefe único, bcrypt, inicio de sesión, configuración y políticas RLS de fotografías. Solo los servicios propios de Supabase se simularon.
- Chrome: carta, carrito, checkout, loader, turno, mensaje WhatsApp, recuperación tras recargar, detalle, estado, recibo 58 mm, subida de foto y edición de precio.
- Carta inicial: filtro por categoría, tamaño obligatorio, segunda mitad repetida permitida, mediana sencilla $56.000 y producto agotado bloqueado.
- Inicio de sesión revisado en escritorio y móvil: logo Don Pieros, fondo atenuado y recorrido rojo con letra blanca.
- Verificación real: los tres SQL ya responden en Supabase. Apps Script responde con el ID de la hoja correcta y el catálogo se puede leer desde el navegador.

**Implementación real confirmada:** la URL conservada ya responde `3.2.0-donpieros`, con 51 productos y 15 opciones. El ID de Sheets coincide con la hoja de Don Pieros Pizza. Las actualizaciones posteriores de PIN y pedidos del mesero se detallan en `LEEME-IMPLEMENTACION.md`.

**Fotografías de ejemplo:** se añadieron 12 fotografías optimizadas locales, seleccionadas por tipo de producto, con fuentes en `images/ejemplos/FUENTES.md`. La carta marca las fotografías temporales como referencia. Se comprobó en navegador que una imagen propia de Supabase reemplaza la referencia en la tarjeta y el detalle, sin modificar las imágenes iniciales en Sheets.

Las pruebas de pedidos y fotos usaron datos temporales simulados; no crearon ventas ni pedidos reales. La comprobación física de impresión y la publicación en el alojamiento siguen pendientes. El menú web no registra automáticamente pagos ni descuenta inventario de caja.
