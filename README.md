# Don Pieros Pizza

Carta digital, pedidos en línea y atención de mesas para Don Pieros Pizza.

- `index.html`: carta, selección de tamaños y adicionales, carrito y confirmación del pedido.
- `mesa.html`: atención mediante QR, chat con el equipo, carta y consulta de la cuenta.
- `admin.html`: caja, inventario, ventas, pedidos, usuarios y personalización de la marca.
- `supabase/install/`: instalación y actualizaciones ordenadas.
- `appscript/Code.gs`: integración con el archivo único de inventario, ventas y pedidos.

La guía completa de configuración está en [LEEME-IMPLEMENTACION.md](LEEME-IMPLEMENTACION.md). Los alcances y las comprobaciones están en [VERIFICACION-DON-PIEROS.md](VERIFICACION-DON-PIEROS.md).

Para una instalación ya actualizada hasta el paso 05, aplica `supabase/install/06_OPCIONES_QR.sql` para habilitar los nuevos interruptores de Marca. Los QR impresos mantienen el tamaño de 9 × 9 cm; vuelve a descargar el PDF para obtener el logo y el diseño rojo sin cambiar el identificador de la mesa.

Abre `VISTA-PREVIA.cmd` para revisar el sitio localmente. `PUBLICAR.ps1` o `npm run build` preparan la carpeta `dist/` con los archivos web. El repositorio conserva el proyecto fuente completo; las dependencias instaladas, archivos de entorno, paquetes ZIP y resultados generados quedan excluidos.
