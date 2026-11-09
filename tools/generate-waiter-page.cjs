// Una sola plantilla conserva los componentes de comandas y los permisos por rol.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const generate = () => fs.readFileSync(path.join(root, 'admin.html'), 'utf8')
  .replace('<body data-page="admin">', '<body data-page="admin" data-staff-entry="waiter">')
  .replace('Don Pieros Pizza · Administración', 'Don Pieros Pizza · Meseros')
  .replace('href="manifest.webmanifest?v=admin-v1"', 'href="mesero.webmanifest?v=1"')
  .replaceAll('images/admin-icon-', 'images/icon-')
  .replace('<span class="eyebrow">Acceso operativo</span>', '<span class="eyebrow">Acceso de meseros</span>')
  .replace('<p>Ingresa con tu usuario y PIN personal.</p>', '<p>Ingresa con tu usuario y PIN de mesero.</p>')
  .replace('<span>Panel operativo</span>', '<span>Servicio de mesas</span>');
if (require.main === module) {
  fs.writeFileSync(path.join(root, 'mesero.html'), generate());
  console.log('mesero.html actualizado desde la plantilla compartida.');
}
module.exports = { generate };
