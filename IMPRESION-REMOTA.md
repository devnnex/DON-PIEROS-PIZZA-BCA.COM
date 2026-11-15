# Impresión remota de Don Pieros Pizza

Esta función envía las comandas y comprobantes que usan la impresión térmica del sistema a **un solo receptor de Windows**. No abre el cajón. La impresión habitual del navegador sigue disponible cuando no hay receptor listo.

## Activación (una sola vez)

1. En el proyecto Supabase de Don Pieros, abre SQL Editor y ejecuta [la migración de impresión remota](https://github.com/devnnex/DON-PIEROS-PIZZA-BCA.COM/blob/main/supabase/migrations/20261114220000_remote_printing.sql). Un push de GitHub Pages no ejecuta SQL.
2. En el **Windows de 64 bits conectado a la impresora**, instala el controlador del fabricante. La conexión puede ser USB, red o Bluetooth: no basta con que la impresora esté conectada a la corriente.
3. Descarga y ejecuta [INSTALAR-RECEPTOR.cmd](impresion/INSTALAR-RECEPTOR.cmd). Elige la impresora física de la lista. Descarga SumatraPDF portable desde su sitio oficial y comprueba su SHA-256; no cambia la impresora predeterminada ni las asociaciones PDF.
4. Configura el papel de 58 u 80 mm en las preferencias de la impresora de Windows y elige ese mismo ancho al imprimir desde el sistema. La compatibilidad depende de que el controlador acepte impresión PDF por Windows; no se garantiza cualquier modelo sin probarlo.
5. Mantén abierto `admin.html` o `mesero.html` con sesión iniciada en el PC receptor. Si el navegador solicita permiso de acceso a la red local, concédelo a este sitio. En Inicio → **Impresión** puedes consultar los navegadores activos y receptores disponibles.

El receptor se inicia oculto al entrar a Windows. Tras instalarlo, no se imprime ninguna página de prueba. Para actualizarlo, cierra el receptor anterior desde el Administrador de tareas (el proceso PowerShell de `RECEPTOR.ps1`), vuelve a ejecutar el instalador e inicia sesión de nuevo en el sitio.

## Entrega y confirmación

- La cola valida la sesión de cada usuario y protege cada receptor con una identidad y secreto local. Los datos de impresión no se transmiten mediante canales públicos de notificaciones.
- Los navegadores se registran cada 15 segundos; los receptores dejan de seleccionarse tras 45 segundos sin señal. Las pestañas del mismo navegador comparten identidad; distintos navegadores se cuentan por separado. El receptor permite reconocer un mismo PC aunque tenga varias pestañas o navegadores.
- Cada clic genera un identificador único y el servidor elige un receptor disponible; prefiere el local si está listo. Nunca envía el mismo trabajo a todas las impresoras.
- El receptor reserva el identificador **antes** de enviar el PDF al controlador y guarda el resultado en disco. Los reintentos del mismo trabajo consultan ese resultado. Una interrupción con resultado incierto requiere comprobar la impresora antes de reimprimir: no se reenvía a otro equipo automáticamente.
- “Confirmado” significa que el controlador de Windows aceptó el trabajo. No prueba que haya salido papel: revisa papel, tapa y errores de la impresora.
- Si no hay receptor disponible, se abre la impresión habitual del navegador. Una vez enviado un trabajo remoto, no se abre una segunda impresión local al perder una confirmación.
- Los trabajos pendientes vencen a los dos minutos. Los PDF se borran al confirmar o vencer; el historial del servidor se conserva siete días. La limpieza se realiza en lotes pequeños durante la actividad, sin añadir consultas a pedidos o inventario.

## Desactivación

Para detener un receptor, elimina `Don Pieros - Impresora.lnk` de la carpeta Inicio de Windows y cierra su proceso PowerShell. Dejará de aparecer disponible al vencer su señal. No borres el registro local de trabajos mientras existan impresiones pendientes. La desactivación general también puede hacerse retirando `remote-print.js` del sitio en una actualización.

## Componentes

El receptor escucha únicamente en `127.0.0.1:8767`, acepta peticiones del origen del sitio y usa una cabecera obligatoria y un secreto para imprimir. No abre puertos en la red ni requiere permisos de administrador. Se instala en `%LOCALAPPDATA%\DonPierosPrint`.

Documentación del motor: [SumatraPDF: impresión por línea de comandos](https://www.sumatrapdfreader.org/docs/Command-line-arguments). El navegador por sí solo [abre un diálogo de impresión](https://developer.mozilla.org/en-US/docs/Web/API/Window/print); el receptor local permite el envío automático al controlador de Windows.
