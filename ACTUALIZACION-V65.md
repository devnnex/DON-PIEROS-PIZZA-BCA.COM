# Comandas y direcciones — v65

- Imprimir o reimprimir una comanda de mesa conserva abierto su detalle y el botón **Agregar a la mesa**. La impresión no acepta productos ni cambia consumos.
- Al agregar un producto desde una mesa, la entrega comienza en **Para comer en el local**. Sin mesa comienza vacía y exige selección; editar conserva la entrega guardada.
- Las ventas individuales del mesero permiten escribir la dirección y la envían a caja. Las ventas individuales de caja conservan la dirección al agregar productos y al guardar la comanda compartida.
- Los productos de mesa a domicilio guardan su dirección en las opciones existentes. Las comandas individuales y completas la imprimen; productos con destinos distintos no se agrupan.
- La impresión web muestra barrio y dirección disponibles, conservando saltos de línea y referencias largas. Pasar a caja conserva esos datos para la pre-cuenta y la factura local.

Publicar los archivos web v65. No requiere SQL ni actualizar Apps Script; utiliza los campos y servicios existentes. Se actualizó la versión de la aplicación y su caché.

Validación: 10 pruebas específicas aprobadas para selección de entrega, envío de dirección, edición, impresión repetida antes de aceptar, ventas compartidas, PDF de 58/80 mm, conservación al pasar a caja y agrupación por destino. Sintaxis, referencias HTML y empaquetado correctos. Suite general: 381 aprobadas y 12 fallos que también se reproducen en el commit `0b004c0`; ningún fallo nuevo frente a esa base. Los fallos anteriores se mantienen fuera de esta corrección. No se realizó impresión física.
