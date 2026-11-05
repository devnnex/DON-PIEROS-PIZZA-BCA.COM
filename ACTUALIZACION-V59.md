# Actualización v59 · empaque y ventas de meseros

## Cambios

- Empaque por unidad para pedidos para llevar y a domicilio: porciones **$500**, lasañas y panzerottis **$1.500**, pizzetas **$2.000**, Mini y Mediana **$2.000**, Maxi y Super maxi **$4.000**.
- En pedidos para consumir en el local no se cobra empaque.
- Se aplican los importes en la carta web, administración, pedidos de meseros, mesas, ventas individuales y al editar pedidos. Los recibos muestran el empaque por producto.
- Las comandas enviadas por meseros aparecen en **Inicio → Ventas individuales pendientes**, con su nombre, y quedan separadas del listado de pedidos de la página. Desde ahí se puede revisar, imprimir o cobrar la comanda.

## Publicación

1. Copia el contenido completo de `appscript/Code.gs` en el proyecto de Apps Script existente.
2. Publica como nueva versión de la implementación actual, conservando la URL `/exec`, la ejecución como propietario y los permisos actuales. El servicio debe informar `3.19.0-donpieros`.
3. Publica la web v59 desde `dist/`.

No requiere cambios SQL. El push de GitHub no publica Apps Script automáticamente; hay que actualizar la implementación existente.

## Verificación

La cobertura incluye las tarifas en carta, meseros, caja manual, edición e impresión, y la separación de comandas de meseros del listado web. Comandos ejecutados: chequeo de sintaxis y referencias, empaquetado y pruebas específicas de pedidos, empaque y recepción.
