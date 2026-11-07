# Verificación v66 — 6 de noviembre de 2026

Al agregar productos a una mesa ocupada, la respuesta del guardado podía llegar después de la actualización en tiempo real. La confirmación añadía nuevamente las filas recibidas, inflando el total local. Además, los INSERT del lote no enviaban UUID, por lo que una respuesta perdida no podía recuperarse mediante la lectura de confirmación existente.

Ahora cada línea conserva su UUID durante la selección, el guardado y los reintentos. La confirmación sustituye las líneas por identidad, conservando los consumos anteriores y las adiciones de otros equipos. Dos productos iguales elegidos por separado siguen siendo dos líneas válidas.

El NIT queda inmediatamente debajo del nombre o logo, con menor espacio vertical. La impresión espera a que las imágenes terminen de cargar antes de medir el contenido; si fallan o exceden cinco segundos, informa el error sin generar un comprobante incompleto. Imprimir la comanda completa mantiene el bloqueo hasta terminar la preparación y permite reintentar tras un error.

## Comprobaciones satisfactorias

- Comando del proyecto equivalente a `npm test`: 14/14 pruebas.
- Regresión y flujos relacionados: 18/18 pruebas, incluidos `consumption-add-once`, `receipt-header-browser`, `table-comanda`, `consumption-confirm-ui`, `optimistic-account-sync`, `admin-requested-flows` e `individual-product-flow-browser`.
- Caso reproducido antes del cambio: $50.000 existentes + $8.000 nuevos mostraban $66.000. Con el cambio: $58.000 y dos líneas, tanto en la cuenta local como en el servidor simulado.
- Respuesta perdida: recuperación por los UUID enviados, sin un segundo INSERT. Reintento de selección conserva sus UUID.
- Navegador Chrome: facturas y precuentas, papel de 58/80 mm y ventanas de 500/1200 px. Una página PDF con altura ajustada al contenido, sin depender de la ventana. Logo con carga demorada 1200 ms: la generación espera su carga.
- Venta individual, persistencia, empaques, comanda e impresión: prueba de navegador aprobada.
- `node tools/check.cjs`, `node tools/package.cjs` y `git diff --check`: aprobados.
- Revisión independiente de código: sin hallazgos pendientes.

## Fallos previos comprobados

La ejecución ampliada produjo 34 aprobaciones y siete fallos. Los mismos siete fallos se reprodujeron en una copia temporal del commit original `4580ca8`, sin estos cambios:

| Archivo | Prueba / fallo |
| --- | --- |
| `tests/consumption-stock-freshness.test.cjs` | «BCA actualiza Agregar consumo al recibir existencias, sin cerrar el modal ni perder la cantidad escrita»: el fixture no presenta el selector esperado y vence el tiempo de espera. |
| `tests/consumption-stock-freshness.test.cjs` | «el cobro comprueba existencias actuales antes de rechazar por reposicion remota»: falla la extracción del bloque de código (`stop > 0`). |
| `tests/consumption-stock-freshness.test.cjs` | «el cobro comprueba existencias actuales antes de rechazar por agotamiento real»: mismo fallo de extracción. |
| `tests/consumption-stock-freshness.test.cjs` | «el cobro comprueba existencias actuales antes de rechazar por sin red»: mismo fallo de extracción. |
| `tests/pos-features.test.cjs` | El contexto VM del fixture no define `URL`, usado para resolver el logo de la factura. |
| `tests/sales-stability-browser.test.cjs` | «Hoy/Ayer/semana conservan sus cifras al navegar, las horas del turno se pueden editar y solo datos nuevos cambian los KPI»: el fixture no carga el módulo de fechas (`date` de undefined). |
| `tests/sales-stability-browser.test.cjs` | «Hoy selecciona el turno automáticamente, conserva los KPI a medianoche y cambia al cierre o al nuevo turno de las 00:00»: mismo módulo de fechas ausente. |

El diagnóstico anterior `tools/qa-invoice-layout.cjs` tampoco inicia sus casos porque resuelve el logo desde `about:blank` (`Invalid URL`). La nueva prueba de recibos usa un servidor local y verifica la generación PDF real.

No se modificaron datos de cuentas existentes. La validación cubre el PDF y el navegador; no se probó una impresora física. Esta versión no requiere cambios en SQL ni Apps Script.
