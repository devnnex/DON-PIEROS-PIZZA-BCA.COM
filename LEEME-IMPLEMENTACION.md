# Don Pieros Pizza · activación

**Activar v51:** publica los archivos web y actualiza la implementación existente de Apps Script con `appscript/Code.gs` **3.14.0-donpieros**, conservando la URL `/exec`. El mesero tendrá **Venta individual** en su pantalla de servicio: elige productos, tamaños, cajas y notas, indica el cliente si lo necesita y envía la comanda. Caja la recibe en **Pedidos recibidos**, identificada como venta individual y con el mesero responsable; puede imprimir y cobrar. Se conserva el borrador al recargar y se confirma un envío con respuesta perdida sin duplicarlo. El mesero sigue sin permiso para cobrar. No se crea una mesa auxiliar ni se registra una venta hasta cobrar.

Para el acceso de mantenimiento, ejecuta **solo** `supabase/install/08_ACCESO_MANTENIMIENTO.sql` si ya instalaste 01–07. Después ejecuta `node tools/create-maintenance-access.cjs` en tu equipo; genera `artifacts/ACTIVAR_SOPORTE_PRIVADO.sql` con el usuario `soporte_temporal` y un PIN aleatorio de 12 dígitos. Ejecuta ese archivo privado desde el editor SQL de Supabase como propietario. El generador conserva un archivo existente y no cambia el PIN por accidente. El archivo queda excluido de Git y de `dist/`; no lo publiques ni lo compartas con el equipo. El acceso no tiene vencimiento; sus sesiones conservan el límite habitual de 12 horas. Puede ver todos los usuarios, tiene permisos de Jefe y puede eliminar su propia cuenta en **Usuarios → Eliminar**, cerrando su sesión. Debe quedar otro Jefe activo del negocio. Los demás jefes no lo reciben en la lista ni pueden editarlo o eliminarlo por su ID; la validación ocurre en Supabase. Las operaciones de mantenimiento conservan sus responsables en ventas y auditoría. La migración no crea ninguna cuenta automáticamente y ninguna credencial está incrustada en el sitio. Para recuperar el acceso tras eliminarlo se requiere aprovisionarlo otra vez desde SQL como propietario.

**Activar v50:** publica los archivos web y actualiza la implementación existente de Apps Script con `appscript/Code.gs` **3.13.0-donpieros**, conservando la URL `/exec`. La primera ejecución agrega «Pizza combinada» después de La Pamplonita en Pizzas especiales, en la carta del cliente y en la aplicación. Requiere un tamaño y exactamente dos sabores diferentes, mitad y mitad. Se agregan los sabores de pizza existentes en el menú al aplicar esta actualización. Precios confirmados: pizzeta $32.000, Mini $46.000, Mediana $63.000, Maxi $78.000 y Super maxi $96.000; caja aparte para llevar o domicilio. Las dos mitades quedan en el pedido, la edición y la impresión. La actualización no duplica productos ni restablece cambios posteriores de precios, opciones o disponibilidad. No requiere SQL adicional.

**Activar v49:** publica los archivos web y actualiza la implementación existente de Apps Script con `appscript/Code.gs` **3.12.0-donpieros**, conservando la URL `/exec`. Guardar o editar un producto consulta su fila actual, reutiliza el libro abierto y evita cargar el catálogo completo. Las posiciones guardadas se verifican antes de usarse para admitir filas movidas o eliminadas. El panel avisa a los otros equipos después de recibir la confirmación, sin esperar ese aviso para terminar el guardado; los clientes anteriores mantienen el aviso del servidor. Las comandas de mesa se muestran con el resultado confirmado sin esperar otra descarga de la lista. Se conservan permisos, precios actuales, versiones y reintentos sin duplicados. No requiere SQL adicional. La latencia final también depende de Google y de la conexión.

**Activar v48:** publica los archivos web y actualiza la implementación existente de Apps Script con `appscript/Code.gs` **3.11.0-donpieros**, conservando la URL `/exec`. «Editar producto» permite corregir también el nombre, además de cantidad, tamaño, adicionales, precio por unidad y notas. El nombre se conserva al reabrir, reimprimir y cobrar la comanda; cambiarlo no modifica el catálogo ni la caja del producto. Las comandas de mesa también permiten corregir el nombre de sus productos. Guarda los cambios y usa «Imprimir comanda» para sacarla nuevamente. No requiere SQL adicional; Apps Script se publica desde su proyecto.

**Activar v47:** publica los archivos web y actualiza la implementación existente de Apps Script con `appscript/Code.gs` **3.10.0-donpieros**, conservando la URL `/exec`. «Editar producto» en cada línea de un pedido web pendiente permite cambiar cantidad, tamaño, adicionales, precio y notas. Carga los datos guardados, recalcula cajas y total y conserva los demás productos. También restaura opciones de pedidos anteriores desde sus etiquetas cuando es posible. Cancelar no guarda cambios y reintentar una edición no duplica productos. No requiere SQL adicional; Apps Script se publica desde su proyecto.

Archivos web v46: al hacer clic en una mesa desde administración, «Imprimir comanda completa» imprime todos sus consumos y las nuevas comandas aún pendientes de aceptar. Los pendientes se identifican y no duplican productos ya incorporados a la cuenta. La impresión consulta los datos actuales, conserva tamaños y notas y usa el ancho de papel compartido de 58/80 mm. También está disponible en el desglose de la cuenta; no acepta pedidos ni modifica consumos. Solo requiere publicar los archivos web; no cambia Apps Script ni SQL.

**Activar v45:** publica los archivos web y actualiza la implementación existente de Apps Script con `appscript/Code.gs` **3.9.0-donpieros**, conservando la URL `/exec`. Jefe y administrador pueden usar «＋ Agregar producto», junto al estado del pedido web, para abrir la misma carta de las mesas y ventas individuales. Incluye cantidad, tamaños, adicionales, precio por unidad y notas. La entrega se conserva según el pedido; Apps Script calcula las cajas y el total. Los reintentos de una misma adición no duplican productos y un pedido cobrado, eliminado o entregado no admite adiciones. No requiere SQL adicional. El push actualiza el repositorio; Apps Script se publica desde su proyecto.

Archivos web v44: los pedidos web y las comandas de mesa aparecen del más reciente al más antiguo por fecha de llegada. Editar o aceptar una comanda conserva su posición. Los pedidos web activos parpadean en verde durante los primeros dos minutos desde su creación; recargar o editarlos conserva ese límite. El filtro de orden permite ver primero los antiguos y «Limpiar filtros» vuelve a los recientes. Solo requiere publicar los archivos web; no cambia Apps Script ni SQL.

Archivos web v43: «Editar» en una venta individual pendiente incluye tiempo estimado y observaciones generales de la comanda. «Guardar producto y comanda» conserva ambos y vuelve al detalle; cancelar descarta esos cambios. El detalle agrupa cliente, tiempo y observaciones en un bloque propio. Solo requiere publicar los archivos web; no cambia Apps Script ni SQL.

Archivos web v42: el nombre del tamaño elegido se imprime 2 píxeles por encima de la letra mayor de cada producto, tanto en comandas web como de meseros y ventas individuales. Las casillas de ventas individuales tienen un diseño renovado con cliente, total, fecha y estado. Esta revisión solo requiere publicar los archivos web; no cambia Apps Script ni SQL.

Archivos web v41: cada pedido web, comanda de mesa y venta individual pendiente admite tiempo estimado en texto, por ejemplo «25 minutos» o «30 min». El contador comienza al asignar el plazo, conserva su hora al recargar y al cambiar observaciones, y la tarjeta parpadea al vencer con el texto «Tiempo cumplido». Cambiar el plazo inicia un nuevo contador. Las comandas impresas colocan el tamaño sobre el nombre de la pizza. Las observaciones por producto y por pedido se muestran en el consumo actual y los detalles pendientes.

Al vencer, un sonido de reloj acompaña el primer minuto; después continúa el aviso visual. El navegador habilita el audio al hacer clic o usar el teclado en la página. El modal web tiene estado compacto, cobrar e imprimir azules, WhatsApp verde con icono y eliminar rojo con texto blanco; el ancho de papel se configura fuera del modal. En una venta individual, «Agregar otro producto» abre la carta normal con tamaños, adicionales, observaciones y la opción Otro. «Enviar comanda · dejar pendiente» deja su casilla por cliente para cobrar después, sin crear una mesa.

**Activar v41:** publica los archivos web, incluido `order-details.js`, y actualiza la implementación existente de Apps Script con `appscript/Code.gs` **3.8.0-donpieros**, conservando la URL `/exec`. Esto habilita guardar el tiempo y las observaciones de pedidos web (`dp_order_time`). No requiere SQL adicional. Las comandas de mesa usan las notas y los permisos de la instalación actual; los pendientes individuales siguen guardados en el navegador de este equipo.

Archivos web v40: Inicio incorpora filtros de origen, estado, búsqueda y antigüedad. Las ventas individuales pueden guardarse por cliente en casillas pendientes y cobrarse más tarde. Estos pendientes se conservan en el navegador de este equipo, incluso al recargar; las pestañas del mismo navegador se actualizan entre sí. Agregar productos y guardar pendientes conserva el inventario hasta el cobro. Cada comanda en línea muestra e imprime el precio unitario, el importe de productos, las cajas y el total de cada línea. Jefe y administrador pueden editar precios y cajas de pedidos activos; el servidor recalcula los totales y rechaza un cobro abierto con un importe anterior.

**Activar v40:** publica los archivos web (incluido `reception-board.js`) y reemplaza el contenido de `appscript/Code.gs` en Apps Script. En **Implementar → Administrar implementaciones → Editar → Nueva versión**, publica la versión **3.7.0-donpieros** conservando la misma URL `/exec`. Esto habilita `dp_edit_order`; sin actualizar esa implementación no se podrán guardar los cambios de precios y cajas web. No requiere ejecutar SQL adicional. El push de GitHub actualiza los archivos del repositorio; Apps Script se publica desde su propio proyecto.

Verificación: `tools/check.cjs`, `tools/qa-reception-queue.cjs`, `tools/qa-waiter-orders.cjs` y `tests/web-order-edit.test.cjs`.

Archivos web v35: agregar consumos a una mesa abre la misma carta del cliente, con categorías, búsqueda, tamaños y opciones. «Otro producto» permite nombre y precio propios, contador −/＋ y observación, sin crear un producto en la carta ni en inventario. Administración agrega la comanda directamente a la cuenta; las comandas del mesero conservan la aceptación explícita. «Agregar a la mesa» cierra el modal únicamente tras confirmar el guardado.

El precio por unidad es opcional también para meseros: vacío conserva el precio de la carta con sus opciones. En la selección, doble clic sobre el importe edita el precio unitario; Enter o salir del campo guarda y Escape cancela. Doble clic sobre un consumo abre directamente su producto para editar cantidad, precio y notas, sin el resumen de toda la comanda; también funciona con consumos anteriores. Se conserva la identidad de cada línea al guardar y reintentar.

**Activar v35:** vuelve a ejecutar **`supabase/install/07_COMANDAS_MESERO.sql`** en Supabase y publica los archivos web. El SQL se puede repetir y conserva los datos; habilita las comandas creadas desde administración y mantiene estas líneas separadas de inventario. No requiere actualizar Apps Script. Cierra y vuelve a abrir el panel con conexión después de publicar.

Archivos web v34: las columnas derechas de facturas, reimpresiones y precuentas terminan 6 mm antes, dejando 8 mm hasta el borde del papel al generar el PDF. Los datos largos se ajustan dentro de su columna. No requiere actualizar Apps Script ni SQL. Publicar los archivos web y volver a abrir el panel con conexión.

Archivos web v33: la PWA comprueba actualizaciones al abrirse, regresar al primer plano o recuperar conexión. Descarga el marcador `app-release.json` sin caché y recarga cuando no hay formularios, edición de productos ni cobros en curso. Conserva el carrito y los datos guardados en el navegador; no requiere desinstalar. La actualización necesita conexión y que el alojamiento ya haya publicado los archivos. Cierra completamente la app antigua y vuelve a abrirla para recibir por primera vez este mecanismo. No añade cambios de Apps Script ni SQL. El resumen diferencia cajas y domicilio pendiente solo por color de texto. El pago empieza sin seleccionar y se restablece después de confirmar; el carrito confirmado se vacía y se guarda vacío.

Para cada publicación futura: cambia `app-release.json`, las etiquetas `app-version` de index/admin/mesa, la versión de caché del service worker y las URLs de los JS/CSS modificados en la misma publicación. `tools/check.cjs` comprueba que las tres páginas coincidan con el marcador; `tools/package.cjs` lo incluye en dist. `pwa-updates.js` usa la misma URL de service worker con `updateViaCache: none` y comprobaciones explícitas ([referencia de MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updateViaCache)).

Actualización 3.6.1: barrio muestra la ayuda debajo del campo también en móviles. Nombre, teléfono, dirección y barrio indican Obligatorio/Correcto y el borde cambia a verde al completar datos válidos. Teléfono admite exactamente diez dígitos con espacios y se guarda sin espacios. Indicaciones especiales son opcionales. El resumen distingue cajas en azul y domicilio pendiente en ámbar. Se agregan Efectivo, Transferencia Nequi y Bre-B sin reemplazar cuentas existentes ni reactivar métodos deshabilitados. Contactos públicos: 3138367511 y 3185536604, ambos con mensaje predeterminado de WhatsApp; los pedidos se distribuyen entre ambos manteniendo el mismo destinatario para cada pedido y sus reintentos.

Para activar: reemplaza `appscript/Code.gs` y publica una nueva versión de la implementación existente, conservando su URL; `/exec` debe indicar **3.6.1-donpieros**. Publica los archivos web actualizados (incluido `checkout-fields.css`) y recarga. No requiere SQL. Puedes guardar las cuentas o llaves reales de Nequi/Bre-B en el menú de medios de pago; los datos ya configurados se conservan.

Actualización 3.6.0: los pedidos enviados desde la carta se cobran desde **Cobrar pedido** con el flujo de caja de venta individual: efectivo, transferencia, Bre-B, tarjeta, mixto, pre-cuenta y factura. Se retiraron el selector de estado y Guardar estado del modal. Al confirmar el cobro, la orden sale de recepción y aparece en **Ventas → Pedidos en línea**, separada de Ventas individuales y Mesas. Cancelar el cobro conserva la orden. Se confirma el valor del domicilio cuando todavía está pendiente. La confirmación remota es necesaria para cobrar pedidos web; una respuesta perdida se recupera con el mismo identificador y no registra una segunda venta. La comanda web se imprime tres píxeles más pequeña; la del mesero conserva sus tamaños.

En ventas y facturas se guardan por separado **Atendido por** y **Cobrado por**, incluyendo el rol del usuario de caja. La pre-cuenta conserva quién atendió. Editar consumos desde administración conserva al mesero asignado. Los avisos ya reproducidos se recuerdan en este navegador, evitando repetirlos al recargar; los pedidos nuevos siguen avisando.

**Activación de 3.6.0:** vuelve a ejecutar `supabase/install/07_COMANDAS_MESERO.sql` y publica una nueva versión de la implementación existente con `appscript/Code.gs`, conservando la URL. `/exec` debe indicar **3.6.0-donpieros** y `capabilities.webCheckout: true`. Se agregan columnas al final de Ventas para el usuario que cobra, pedido web, operación, entrega y rol; no se reordenan los datos anteriores. Publica los archivos web y recarga el administrador. El SQL también corrige el mesero asignado de cuentas todavía abiertas que tienen comandas y estaban asignadas a administración. Las ventas históricas sin registro de caja muestran «Sin registro».

Corrección de mesas reutilizables (30 de octubre de 2026): una comanda nueva puede abrir otra cuenta cuando la anterior se cerró, se cobró o se eliminó y la mesa está libre. El borrador nuevo conserva los productos seleccionados y actualiza su referencia a la cuenta vigente. Las ediciones de comandas anteriores no se trasladan al siguiente cliente; un reintento de un envío ya guardado tampoco reabre una cuenta cobrada ni duplica productos.

Para activar esta corrección, vuelve a ejecutar **`supabase/install/07_COMANDAS_MESERO.sql`** y publica los archivos web actualizados. No requiere reemplazar Apps Script. Si otro equipo ya abrió una cuenta distinta mientras se enviaba un borrador atrasado, se pide revisar el consumo actual para evitar mezclar clientes.

Actualización 3.5.0 (30 de octubre de 2026): cajas y papel térmico. Los pedidos para recoger o domicilio suman $2.000 por Mini, Mediana o Pizzeta y $4.000 por Maxi o Super maxi, por cada unidad. «Comer en el local» no cobra caja. En ventas individuales y consumo de mesas, elige «Para llevar» y el tamaño de caja; el precio manual sigue siendo el precio del producto. El total incluye caja y la factura la desglosa. Las notas y la preparación se conservan en el historial para reimprimir. Los avisos de pedidos web usan verde.

Publica una **Nueva versión** de la implementación existente con `appscript/Code.gs` para obtener **3.5.0-donpieros**, conservando la URL `/exec`. Se agregan `packagingFee` en Ordenes_Web y `notas` en Detalle_Ventas sin cambiar sus columnas anteriores. Este cambio de cajas no requiere SQL adicional; el SQL 07 sigue siendo necesario si aún falta la actualización anterior de comandas.

Corrección de impresión: comandas y facturas se convierten a PDF antes de solicitar imprimir. El PDF tiene el ancho del rollo y la altura del contenido; no imprime una página HTML, por lo que no incorpora la fecha/título automáticos del navegador ni el enlace de la web al pie. Se captura el documento a 300 dpi en franjas para conservar la nitidez sin crear un lienzo enorme en pedidos largos. Comandas de cocina conservan su marco y no llevan publicidad. **Devnex Soluciones Tecnologicas 3246394689** aparece únicamente en las facturas. Si el visor no abre automáticamente el diálogo, utiliza su botón Imprimir. Selecciona el rollo de 58/80 mm correspondiente y tamaño real/100 %. El controlador debe permitir papel continuo o longitud variable; un tamaño fijo A4/carta o un avance configurado en la impresora puede seguir expulsando papel adicional. El programa no puede cambiar esos ajustes del controlador. Se validan PDF y navegador; la prueba con la impresora física queda en el equipo del negocio. Esta corrección solo requiere publicar los archivos web actualizados; no añade cambios a SQL ni a Apps Script.

Actualización 3.4.0 (30 de octubre de 2026): eliminación inmediata de pedidos web, productos del menú y comandas de mesero. La intención de eliminar se guarda por usuario y negocio en el navegador antes de ocultar el registro. Si se pierde la conexión o la respuesta, el registro permanece oculto y la operación se reintenta sin límite de intentos, con pausas de 1 a 30 segundos. Las operaciones pendientes sobreviven a una recarga y al reinicio del navegador; se reanudan con la sesión iniciada y conexión. No borres los datos del navegador mientras haya operaciones pendientes. Los conflictos de versión se consultan y se reintentan con la versión actual. Los pedidos web eliminados conservan su identificador internamente para impedir que un reintento del cliente los cree otra vez.

Para activar esta actualización: vuelve a ejecutar **`supabase/install/07_COMANDAS_MESERO.sql`**, reemplaza **`appscript/Code.gs`** y publica una **Nueva versión** de la implementación existente conservando la URL. `/exec` debe indicar **`3.5.0-donpieros`**, `capabilities.orderDeletion: true` y `capabilities.fastOrderReception: true`. Publica también los archivos web actualizados, incluido **`pending-deletions.js`**. El SQL se puede repetir y conserva los datos.

“Aceptar” una notificación del mesero abre la comanda para revisar e imprimir; **Agregar a la mesa** aplica sus productos una sola vez. Las comandas sin productos se retiran del inicio. Un retiro de comanda aceptada conserva las validaciones de abonos de la cuenta: si todavía no puede aplicarse, queda pendiente y continúa reintentando. Disponible, imprimir y los avisos del mesero usan verde; Agotado usa gris.

Apps Script avisa al administrador después de guardar el pedido y antes de responder al cliente. La recepción consulta únicamente la fila del pedido mediante una conexión autenticada. La carta escucha el acuse del administrador antes de mostrar el éxito, con una espera máxima adicional de 1,8 segundos si su conexión en vivo está activa. Si el administrador está desconectado o la red tarda más, el pedido sigue confirmado en Sheets y llega mediante la recepción automática al recuperar conexión; no se promete simultaneidad cuando un dispositivo no está conectado.

Actualización 3.3.0: Barrio permite escribir libremente o elegir una sugerencia. Los barrios configurados mantienen su tarifa; un barrio nuevo queda con domicilio **por confirmar**, tanto en la comanda como en WhatsApp. Para habilitarlo, reemplaza `appscript/Code.gs` y publica una nueva versión desde **Administrar implementaciones**, editando la implementación actual para conservar la misma URL. La actualización agrega `deliveryFeePending` al final de `Ordenes_Web` automáticamente y conserva los pedidos anteriores. No requiere SQL adicional.

Los pedidos web tienen un tono original suave y el anuncio «Una nueva orden ha llegado a Don Pieros Pizza». Las solicitudes de mesas conservan su tono diferente y la voz que identifica la mesa y lo solicitado, como en Nápoles. Comparten una cola para evitar que las voces se superpongan. Se respeta el control de alarma y se prepara el audio con los gestos del usuario; si estaba desactivado, debe volver a activarse desde el administrador.

Servicio por QR: `mesa.html` usa la identidad de la carta, con chat de pizzería y sin canciones. En Marca se controlan Mesero, Ver cuenta, Carta y Chat mediante cuatro interruptores. Aplica `supabase/install/06_OPCIONES_QR.sql` para activar los tres controles nuevos; el control Ver cuenta conserva su ajuste existente. Los cambios se guardan en el negocio y se comparten con los dispositivos de los clientes.

Los nuevos QR incorporan el logo del negocio con margen blanco y corrección de errores alta. El PDF conserva tarjetas de **90 × 90 mm**, con borde y nombre del negocio rojos y un pie grande en negrita. La URL y el código de cada mesa se conservan. Para obtener el nuevo diseño, vuelve a descargar el PDF; no necesitas regenerar el identificador ni cambiar los QR guardados.

Actualización de atención: aplica `supabase/install/05_PEDIDOS_MESERO.sql` para habilitar los avisos de pedidos tomados por meseros. El nombre se obtiene de la sesión validada y se conserva junto al origen de la solicitud. Los reintentos no agregan productos ni reabren cuentas cerradas. No requiere cambios en Code.gs. Los pedidos anteriores conservan sus datos; la identificación de origen se aplica a los nuevos avisos.

El menú coloca Pedidos web y Menú online antes de Inventario en amarillo; el Asistente IA y los puntos sin QR están comentados. Guardar una mesa devuelve el foco a Número. El contador de pedidos vacío no se muestra y la X del turno cierra al primer clic. La alarma conserva la activación al mover el mouse y se prepara desde el gesto de inicio de sesión, respetando la preferencia de sonido apagado. La interfaz y sus mensajes no muestran servicios ni direcciones técnicas.

Actualización de PIN: el primer Jefe y todos los roles admiten de **4 a 12 números**, incluidos ceros iniciales. Si ejecutaste el 03 anterior, aplica únicamente `supabase/install/04_PIN_4_A_12.sql`. No cambia PIN existentes ni requiere actualizar Apps Script.

Las fotos de ejemplo se incluyen en `images/ejemplos/` y se seleccionan por tipo de producto. Las imágenes reales cargadas desde Admin tienen prioridad inmediata; las de ejemplo no se guardan en Sheets ni se suben a Storage. En la carta se identifican como “Foto de referencia”. Si se elimina una foto propia desde Admin, vuelve a aparecer la referencia. No hay que modificar SQL ni Apps Script para esta presentación.

## Actualización final: carta y tamaños (3.2.0)

Para una instalación con los pasos 01 a 06 aplicados, esta actualización no añade SQL. Reemplaza el código de Apps Script por el `appscript/Code.gs` actualizado, publica una **Nueva versión** conservando la URL y abre `/exec`: debe indicar **3.5.0-donpieros**. También puedes ejecutar `CARGAR_MENU_INICIAL_DON_PIEROS` desde el editor después de pegar el código.

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
5. En instalaciones nuevas copia la URL **`/exec`**; en instalaciones existentes conserva la URL editando la implementación actual. Ábrela una vez. Debe responder `ok: true`, `version: "3.5.0-donpieros"`, el ID anterior y `capabilities.onlineOrders: true`.

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
