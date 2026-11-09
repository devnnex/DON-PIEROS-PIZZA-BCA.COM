# V74 — Carta inmediata y tamaños/opciones

- El acabado dorado de tarjetas se aplica exclusivamente a **Tamaños y opciones**. Productos, Pagos y Barrios conservan sus estilos anteriores. La navegación del catálogo de V73 se conserva.
- El cuadro **Venta individual** de Mesas recupera su estilo anterior. **Nueva venta** en Inicio conserva el botón azul solicitado.
- `index.html`, `admin.html` y `mesero.html` incluyen una copia del catálogo público: 76 productos y 42 opciones consultados al preparar esta publicación. Se muestra la última copia disponible mientras se consulta el servidor en segundo plano. La caché de clientes y meseros comparte el mismo formato y una sola descarga en curso.
- Menú online muestra inmediatamente la copia disponible, o su caché privada por usuario, mientras realiza su consulta autorizada habitual. Los cambios de versión siguen comprobándose al guardar.
- La carta de imágenes de `mesa.html` precarga la lista y la primera imagen después de identificar la mesa. Abrirla reutiliza esa consulta durante 30 segundos. Las credenciales y el QR siguen delimitando los enlaces de imágenes.
- Bloquear el almacenamiento o fallar el cliente opcional de Supabase ya no detiene el catálogo público. El carrito puede editarse sin almacenamiento; enviar pedidos requiere conservar su identificador para evitar duplicados y muestra una explicación si el navegador lo impide.
- Las consultas públicas tienen tiempo límite, un reintento automático y recuperación visible con **Reintentar**. La copia incluida no habilita por sí sola el envío: se verifica la carta antes de confirmar y el servidor vuelve a validar precios y disponibilidad.

## Publicación

Solo archivos del sitio. Esta actualización no requiere SQL ni publicar Apps Script. Se actualizó la versión de recursos y service worker a `20261109-v74`.

Para renovar la copia de primera visita al preparar otra publicación:

```powershell
node tools/refresh-catalog-snapshot.cjs
```

El comando consulta únicamente `dp_get_catalog`, valida la respuesta y conserva la copia anterior si falla. Incluir la copia actualizada y cambiar su versión de recurso en la siguiente publicación. Las ediciones desde Menú online se siguen descargando normalmente sin ejecutar este comando; la copia incluida es un respaldo para visualización y puede quedar atrás de esas ediciones.

## Verificación

- Comprobación de sintaxis, referencias HTML, página de meseros generada y versión PWA.
- Pruebas de primera visita sin respuesta de Google Sheets, almacenamiento bloqueado, SDK de Supabase ausente, APIs opcionales ausentes y reconexión en Chromium y WebKit. WebKit usa el motor de Safari; no sustituye una prueba física en cada modelo de iPhone.
- Prueba de apertura inmediata de Menú online y comparación de los estilos de Productos con los estilos anteriores: sin diferencias.
- Pruebas de cobro, respuestas perdidas, carta de imágenes, comandas, datos de pago y presupuesto de lecturas. La precarga pública no consulta Supabase.
- Inspección visual a 1440, 390 y 320 píxeles, sin desbordamiento horizontal.

Las pruebas cubren navegadores actuales y fallos concretos; no permiten garantizar todo navegador antiguo, dispositivo o bloqueo externo. La primera visita todavía necesita descargar los archivos del sitio; luego la carta puede mostrarse sin esperar la respuesta del catálogo.
