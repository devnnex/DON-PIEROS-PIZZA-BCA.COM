const test = require('node:test'), assert = require('node:assert/strict');
const { nextCutoff, create } = require('../staff-session.js');
const time = value => Date.parse(value);
function harness(waiter = false) {
  const values = new Map(); let now = time('2026-11-09T01:59:00-05:00'), expired = 0;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const options = { storage, waiter, now: () => now, onExpire: () => expired++ };
  return { values, storage, options, guard: create(options), setTime: value => { now = time(value); }, expired: () => expired };
}
test('corte Colombia: antes, exactamente a las 02:00, después, y cambio de año', () => {
  for (const [start, end] of [
    ['2026-11-09T01:59:59-05:00', '2026-11-09T02:00:00-05:00'],
    ['2026-11-09T02:00:00-05:00', '2026-11-10T02:00:00-05:00'],
    ['2026-11-09T23:00:00-05:00', '2026-11-10T02:00:00-05:00'],
    ['2026-12-31T23:00:00-05:00', '2027-01-01T02:00:00-05:00']
  ]) assert.equal(nextCutoff(time(start)), time(end));
});
test('administradores y meseros: al reabrir después de las 02:00 deben autenticarse', () => {
  for (const waiter of [false, true]) {
    const h = harness(waiter);
    h.guard.save({ token: 'secret', expires_at: '2026-11-09T13:59:00-05:00', user: { role: waiter ? 'waiter' : 'admin' } });
    assert.equal(create(h.options).restore(), 'secret');
    h.setTime('2026-11-09T02:00:00-05:00');
    assert.equal(create(h.options).restore(), '');
    assert.equal(h.storage.getItem(h.guard.tokenKey), null);
  }
});
test('una pantalla suspendida vence antes de aceptar otra operación; respeta vencimiento remoto', () => {
  const h = harness();
  h.guard.save({ token: 'secret', expires_at: '2026-11-09T01:59:30-05:00', user: { role: 'boss' } });
  assert.equal(h.guard.ensureActive(), true);
  h.setTime('2026-11-09T01:59:30-05:00');
  assert.equal(h.guard.ensureActive(), false); assert.equal(h.expired(), 1);
  assert.equal(h.guard.ensureActive(), false); assert.equal(h.expired(), 1);
});
test('credenciales antiguas, metadatos manipulados y reloj atrasado no restauran acceso', () => {
  const h = harness(); h.storage.setItem(h.guard.tokenKey, 'legacy');
  assert.equal(h.guard.restore(), '');
  h.guard.save({ token: 'secret', user: { role: 'admin' } });
  const key = h.guard.tokenKey + '_expiry_v1', record = JSON.parse(h.storage.getItem(key));
  h.storage.setItem(key, JSON.stringify({ ...record, expiresAt: record.expiresAt + 86400000 }));
  assert.equal(create(h.options).restore(), '');
  h.guard.save({ token: 'secret', user: { role: 'admin' } });
  h.setTime('2026-11-09T01:58:00-05:00'); assert.equal(h.guard.ensureActive(), false);
});
test('cerrar o cambiar sesión en otra pestaña bloquea el token previo y conserva la sesión nueva', () => {
  const h = harness(); h.guard.save({ token: 'first', user: { role: 'admin' } });
  const other = create(h.options); other.save({ token: 'second', user: { role: 'admin' } });
  assert.equal(h.guard.ensureActive(), false); assert.equal(h.expired(), 1);
  assert.equal(create(h.options).restore(), 'second');
  assert.notEqual(create({ ...h.options, waiter: true }).tokenKey, h.guard.tokenKey);
});
