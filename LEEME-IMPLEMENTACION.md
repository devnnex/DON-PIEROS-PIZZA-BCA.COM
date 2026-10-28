# Don Pieros Pizza · activación

Actualización 3.3.0: Barrio permite escribir libremente o elegir una sugerencia. Los barrios configurados mantienen su tarifa; un barrio nuevo queda con domicilio **por confirmar**, tanto en la comanda como en WhatsApp. Para habilitarlo, reemplaza `appscript/Code.gs` y publica una nueva versión desde **Administrar implementaciones**, editando la implementación actual para conservar la misma URL. La actualización agrega `deliveryFeePending` al final de `Ordenes_Web` automáticamente y conserva los pedidos anteriores. No requiere SQL adicional.

Los pedidos web tienen un tono original suave y el anuncio «Una nueva orden ha llegado a Don Pieros Pizza». Las solicitudes de mesas conservan su tono diferente y la voz que identifica la mesa y lo solicitado, como en Nápoles. Comparten una cola para evitar que las voces se superpongan. Se respeta el control de alarma y se prepara el audio con los gestos del usuario; si estaba desactivado, debe volver a activarse desde el administrador.

Servicio por QR: `mesa.html` usa la identidad de la carta, con chat de pizzería y sin canciones. En Marca se controlan Mesero, Ver cuenta, Carta y Chat mediante cuatro interruptores. Aplica `supabase/install/06_OPCIONES_QR.sql` para activar los tres controles nuevos; el control Ver cuenta conserva su ajuste existente. Los cambios se guardan en el negocio y se comparten con los dispositivos de los clientes.

Los nuevos QR incorporan el logo del negocio con margen blanco y corrección de errores alta. El PDF conserva tarjetas de **90 × 90 mm**, con borde y nombre del negocio rojos y un pie grande en negrita. La URL y el código de cada mesa se conservan. Para obtener el nuevo diseño, vuelve a descargar el PDF; no necesitas regenerar el identificador ni cambiar los QR guardados.

Actualización de atención: aplica `supabase/install/05_PEDIDOS_MESERO.sql` para habilitar los avisos de pedidos tomados por meseros. El nombre se obtiene de la sesión validada y se conserva junto al origen de la solicitud. Los reintentos no agregan productos ni reabren cuentas cerradas. No requiere cambios en Code.gs. Los pedidos anteriores conservan sus datos; la identificación de origen se aplica a los nuevos avisos.

El menú coloca Pedidos web y Menú online antes de Inventario en amarillo; el Asistente IA y los puntos sin QR están comentados. Guardar una mesa devuelve el foco a Número. El contador de pedidos vacío no se muestra y la X del turno cierra al primer clic. La alarma conserva la activación al mover el mouse y se prepara desde el gesto de inicio de sesión, respetando la preferencia de sonido apagado. La interfaz y sus mensajes no muestran servicios ni direcciones técnicas.

Actualización de PIN: el primer Jefe y todos los roles admiten de **4 a 12 números**, incluidos ceros iniciales. Si ejecutaste el 03 anterior, aplica únicamente `supabase/install/04_PIN_4_A_12.sql`. No cambia PIN existentes ni requiere actualizar Apps Script.

Las fotos de ejemplo se incluyen en `images/ejemplos/` y se seleccionan por tipo de producto. Las imágenes reales cargadas desde Admin tienen prioridad inmediata; las de ejemplo no se guardan en Sheets ni se suben a Storage. En la carta se identifican como “Foto de referencia”. Si se elimina una foto propia desde Admin, vuelve a aparecer la referencia. No hay que modificar SQL ni Apps Script para esta presentación.

## Actualización final: carta y tamaños (3.2.0)

Para una instalación con los pasos 01 a 06 aplicados, esta actualización no añade SQL. Reemplaza el código de Apps Script por el `appscript/Code.gs` actualizado, publica una **Nueva versión** conservando la URL y abre `/exec`: debe indicar **3.3.0-donpieros**. También puedes ejecutar `CARGAR_MENU_INICIAL_DON_PIEROS` desde el editor después de pegar el código.

La inicialización carga en Sheets los **51 productos de las cartas entregadas**, con precios, ingredientes indicados, seis categorías y 15 opciones. No crea ventas ni pedidos. La carga es única y no sobrescribe precios, disponibilidad ni nombres que posteriormente edites. `menu-inicial.json` permite revisar el listado completo.

Pizzas especiales y sencillas: Mini 27 × 27 cm, Mediana 37 × 37 cm, Maxi 45 × 45 cm y Super maxi 54 × 54 cm. El tamaño es obligatorio y recalcula el total. Las pizzetas tienen 24 × 24 cm. En sencillas, la tarjeta define la primera mitad y el selector la segunda; ambas pueden ser del mismo sabor. Gaseosa de 1,5 litros: $9.000.

Admin → **Menú online** agrupa los productos por categoría y permite filtrarlos. El botón Disponible/Agotado cambia la disponibilidad; el cliente ve Agotado y no puede agregarlo. En **Tamaños y opciones** se editan nombres, medidas y valores. Esos valores se suman al precio base de cada producto: por ejemplo, Mediana especial añade $17.000 a la base Mini de $46.000, para un total de $63.000. Las fotos se gestionan desde Editar producto y quedan en Supabase.

Nápoles se duplicó en esta carpeta sin modificar el proyecto original. La carta reutiliza el flujo de [Juanelos](https://github.com/devnnex/JUANELOS-FRESERIA.COM), con el logo entregado y tema blanco/negro. No se copian usuarios, PIN, inventario, ventas ni clientes.

## 1. SQL: ejecutar en este orden

En el SQL Editor del proyecto **bxyvxbutjlvoconfsjub**, que confirmaste como exclusivo y vacío:

1. `supabase/install/01_BASE.sql`: esquema base. **Solo una vez**, en una base vacía.
2. `supabase/install/02_ACTUALIZACIONES_NAPOLES.sql`: todas las migraciones originales, en orden cronológico.
3. `supabase/install/03_DON_PIEROS.sql`: marca inicial, primer Jefe, imágenes y permisos de Storage.
4. `supabase/install/04_PIN_4_A_12.sql`: compatibilidad del primer Jefe con PIN de 4 a 12 números.
5. `supabase/install/05_PEDIDOS_MESERO.sql`: origen y nombre verificado en los avisos de pedidos tomados por meseros.
6. `supabase/install/06_OPCIONES_QR.sql`: interruptores de Mesero, Carta y Chat para la vista por QR; Ver cuenta conserva el control existente.
7. `supabase/install/07_COMANDAS_MESERO.sql`: carta visual del mesero, comandas pendientes, aceptación que agrega el consumo y edición por administración/mesero sobre la misma comanda. Se puede repetir; conserva datos y evita aplicar dos veces los productos. Requiere haber ejecutado 05 y 06.

Si los pasos 1 a 3 ya están instalados, aplica únicamente las actualizaciones 04 a 07 que falten. Para esta última mejora, si ya ejecutaste 06, basta con 07. `supabase/schema.sql` ya está incluido en el paso 2. No importes los respaldos de datos ni los roles de Nápoles. El esquema inicia sin productos, mesas, pedidos ni ventas. Marca y Efectivo son configuración inicial.

## 2. Google Sheets y Apps Script

Hoja: **1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E**.

1. Abre [la hoja nueva](https://docs.google.com/spreadsheets/d/1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E/edit) → **Extensiones → Apps Script**. Usa un proyecto nuevo de este negocio.
2. Reemplaza todo el contenido de `Code.gs` con **`appscript/Code.gs`**. No pegues otro `.gs` ni necesitas HTML.
3. **Implementar → Nueva implementación → Aplicación web**.
4. **Ejecutar como: Yo** y **Acceso: Cualquier persona**. Autoriza la cuenta propietaria de la hoja.
5. En instalaciones nuevas copia la URL **`/exec`**; en instalaciones existentes conserva la URL editando la implementación actual. Ábrela una vez. Debe responder `ok: true`, `version: "3.3.0-donpieros"`, el ID anterior y `capabilities.onlineOrders: true`.

Google no ejecuta todas las funciones al pulsar Implementar. La inicialización está conectada a `doGet` y `doPost`: **abrir `/exec` después de implementar, o recibir la primera petición del sitio, crea automáticamente todas las pestañas y encabezados**. No crea ventas ni productos. Ese es el [funcionamiento de las aplicaciones web de Apps Script](https://developers.google.com/apps-script/guides/web).

Si quieres la estructura antes de implementar, ejecuta `CONFIGURAR_SISTEMA` desde el editor y autoriza. Se puede repetir sin vaciar los datos.

Se preparan: Configuracion, Inventario, Auditoria, Turnos_Caja, Ventas, Detalle_Ventas, Pagos, Movimientos_Inventario, Ingresos_Diarios, Operaciones_Sync, POS_Operaciones, Menu_Web, Adicionales_Web, Pagos_Web, Barrios_Web y Ordenes_Web.

Para editar celdas directamente, usa el Apps Script vinculado a esa hoja. Si prefieres un proyecto independiente, ejecuta opcionalmente `ACTIVAR_EDICIONES_DIRECTAS` para que las ediciones manuales actualicen las revisiones. Las ediciones desde el panel no necesitan ese disparador.

## 3. Una URL compartida por todo el proyecto

La URL que proporcionaste ya quedó guardada en **`config.js`** y su implementación respondió correctamente con la hoja indicada. Para cambiarla más adelante, edita esta línea:

```js
const APPS_SCRIPT_URL = 'PEGA_AQUI_LA_NUEVA_URL_TERMINADA_EN_EXEC';
```

Supabase y tu anon key ya están configurados. Se usa el origen sin `/rest/v1/`, porque la biblioteca añade esa ruta.

No reutilices las implementaciones de Nápoles o Juanelos. Puedes probar la conexión desde Admin → Menú online; ese valor se guarda solo en ese navegador. **Para los celulares de todos los clientes, guarda la URL en `config.js` y vuelve a publicar.**

Si cambias Apps Script después, actualiza su implementación a una Nueva versión conservando la URL. Guardar el código no actualiza por sí solo la aplicación web.

## 4. Publicar e iniciar

- `index.html`: carta y pedidos de clientes.
- `admin.html`: panel original más Pedidos web y Menú online.
- `mesa.html`: solicitudes, chat, carta y cuenta originales. Los QR de mesas apuntan aquí.

Publica por HTTPS el contenido de **`dist/`**. Genera esa carpeta y su ZIP con **`PUBLICAR.ps1`**, o usa `npm run build` con Node instalado. La aplicación es estática y no necesita Node en producción. El paquete publicable excluye SQL, Apps Script, pruebas y documentación.

Para vista local en Windows, haz doble clic en **`VISTA-PREVIA.cmd`** y conserva su ventana abierta: carta en `http://127.0.0.1:5500/index.html`, panel en `http://127.0.0.1:5500/admin.html`. No requiere instalar Node ni una extensión. También puedes usar Live Server o, con Node instalado, `npm run dev`. La instalación PWA requiere HTTPS o localhost. Carta y panel tienen manifiestos separados.

Después de los SQL, abre Admin: aparecerá **Crear primer Jefe** si no hay usuarios. Elige nombre, usuario y PIN de 4 a 12 dígitos. Los demás accesos se crean desde Usuarios. Crea el primer Jefe antes de compartir el panel.

## 5. Cargar el menú

1. **Menú online → Productos**: revisa los 51 productos de tu carta y edita o agrega productos con categoría, precio y descripción. No se inventaron precios ni productos.
2. Sube, reemplaza o quita fotos desde el formulario. Se optimizan y guardan en `product-images` de Supabase. Los datos del producto quedan en Sheets. Si falla borrar una imagen anterior, el panel informa el error y conserva el producto guardado.
3. **Adicionales**: crea opciones con un grupo, como Extra, Tamaño o Salsa, y su precio adicional.
4. En el producto abre **Opciones del producto** y configura qué grupos puede escoger el cliente, mínimos/máximos y si suman precio. También puedes crear un producto distinto por tamaño.
5. **Pagos**: configura cuentas y llaves reales. Efectivo viene listo; no se copiaron cuentas ajenas.
6. **Barrios**: agrega los barrios atendidos y la tarifa de domicilio. Hasta configurarlos, se puede usar Recoger.
7. **Marca** conserva las funciones de Nápoles para la caja y las mesas. La carta de clientes usa el logo entregado y su tema propio.

El Menú online y el inventario de caja son catálogos separados. Una orden web guarda una comanda y **no registra automáticamente un pago ni descuenta inventario**. Para contabilizar el cobro se usa el flujo de ventas de caja. Los estados de preparación/entrega no acreditan un pago.

## 6. Recepción y turno

Apps Script valida disponibilidad, precio, cantidades, adicionales, pago y domicilio contra la hoja antes de guardar. Un cambio de precio requiere revisar el total.

Cada orden recibe un consecutivo único y un puesto de cola bajo bloqueo de escritura. Cuentan delante los pedidos Nueva, En preparación y Lista; Despachada y Cancelada salen de la cola. El turno es la posición **al confirmar**, no un tiempo estimado ni un seguimiento continuo.

El loader termina cuando el servidor confirma el guardado. Entonces muestra número, turno y pedidos delante; después abre WhatsApp **573102241444** con un mensaje preparado y emojis. El cliente debe pulsar Enviar en WhatsApp. También tiene un botón para abrirlo manualmente.

Ante una respuesta perdida, el navegador conserva el mismo pedido y ofrece **Verificar y continuar**. La verificación recupera la orden guardada sin duplicarla.

Los pedidos aparecen en Inicio debajo de las solicitudes de mesas y en **Pedidos web**. Las solicitudes normales conservan Supabase. Las órdenes conservan Sheets como fuente de verdad: una señal Realtime acelera el aviso y una revisión cada 6 segundos recupera avisos perdidos. El panel debe estar abierto y conectado. La latencia real depende de Google y de la red.

## 7. Comanda térmica

Abre la orden para ver cliente, productos, cantidades, opciones, notas, entrega y pago por verificar. Puedes cambiar su estado, contactar al cliente e imprimir en **58 mm u 80 mm**.

Selecciona tu impresora térmica en el diálogo del navegador, el tamaño de papel correcto, escala 100 %, sin encabezados ni pies. Requiere impresora instalada. Es una comanda interna, no factura fiscal ni impresión silenciosa.

## 8. Verificación de entrega

1. `/exec` responde `ok: true` con el ID correcto.
2. Admin permite crear el Jefe y conectar Sheets.
3. Un producto real y su foto aparecen en la carta.
4. Un pedido llega a Ordenes_Web y al panel; WhatsApp apunta al número correcto.
5. Se imprime una comanda física y el estado Despachada retira el pedido de la cola.
6. Otro celular recibe la carta y puede instalar su PWA.

Se verificaron localmente SQL, bcrypt, inicio de sesión, políticas de imágenes, reglas de precios/permisos, reintentos, carta y administración en Chrome. Las pruebas funcionales usaron datos temporales y servicios simulados; no crearon pedidos ni ventas en tu Supabase ni en tu hoja. En PostgreSQL local se simularon únicamente servicios exclusivos de Supabase. También se verificó en vivo la respuesta de tu Apps Script y el ID de la hoja. La publicación del sitio, velocidad real e impresión física requieren tus cuentas y equipos.
