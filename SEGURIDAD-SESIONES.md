El acceso operativo vence cada día a las 02:00 de Colombia. Se conserva también el máximo de 12 horas por sesión. El navegador comprueba el corte al abrir, recuperar el foco, volver de suspensión y antes de operar; Supabase invalida los tokens anteriores al corte.

Para activar en producción:

1. Ejecutar `supabase/migrations/20261109120000_staff_daily_session_security.sql` en el SQL Editor del proyecto `bxyvxbutjlvoconfsjub`. Puede repetirse. No borra ventas, usuarios ni pedidos; acorta la vigencia de sesiones existentes. En instalaciones nuevas, ejecutarlo después de los archivos de `supabase/install/`.
2. Actualizar `appscript/Code.gs` en el proyecto de Google Apps Script y publicar una nueva versión en la implementación existente (Implementar → Administrar implementaciones → Editar → Nueva versión). Mantener la misma URL `/exec`. La validación de caché de usuarios ahora respeta `session_expires_at`, evitando extender hasta 120 segundos una sesión vencida.
3. Publicar los archivos web de esta versión. La actualización pide iniciar sesión nuevamente en dispositivos que tenían sesiones antiguas sin fecha de vencimiento local.

Compartir `mesero.html` con los meseros. El acceso y la aplicación instalada usan esa página, con su usuario y PIN personal. Si un mesero entra por `admin.html`, se lo dirige a `mesero.html#service` antes de mostrar el panel. Administradores y jefes usan `admin.html`. Los tokens de ambas entradas se guardan por separado. Los permisos siguen siendo verificados en Supabase y Apps Script; el nombre de la página no reemplaza esa verificación.

Los PIN creados para compartir accesos permanecen en memoria durante la sesión; ya no se guardan en almacenamiento persistente. Los accesos compartidos de mesero apuntan a `mesero.html`, sin credenciales en la URL.

Los datos para copiar junto a «En vivo» usan los métodos de pago activos del catálogo existente. No hay números bancarios escritos en el código. Las píldoras tienen la misma altura de «En vivo». Al copiar muestran una marca de confirmación y el aviso «dato copiado», conservando visible el número para evitar movimientos en la fila.

Desde v71 la precarga pública comienza mientras se muestra el inicio de sesión. Pagos y carta comparten una sola solicitud en curso y una caché de hasta tres minutos. Los eventos existentes de cambios de catálogo invalidan esa caché. Los botones no agregan temporizadores de sondeo ni consultas o canales de Supabase. Las consultas privadas continúan esperando la autenticación. Una primera carga sin caché necesita conexión; los datos precargados aparecen inmediatamente y las demás cargas continúan en segundo plano.

`mesero.html` se genera desde la plantilla operativa compartida. Después de editar `admin.html`, ejecutar `node tools/generate-waiter-page.cjs`; `node tools/check.cjs` comprueba que ambas estén sincronizadas.
