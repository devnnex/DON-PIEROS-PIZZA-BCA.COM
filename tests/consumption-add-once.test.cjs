const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const section = (from, to) => source.slice(source.indexOf('  const ' + from + ' ='), source.indexOf('  const ' + to + ' =', source.indexOf('  const ' + from + ' =') + 1));
const copy = value => JSON.parse(JSON.stringify(value));

function harness({ realtime = false, lostResponse = false, offline = false } = {}) {
  const old = { id: randomUUID(), session_id: 'account', table_id: 'table', item_name: 'Pizza', quantity: 2, unit_price: 25000, status: 'served' };
  const remote = new Map([[old.id, old]]), inserts = [];
  const account = { id: 'account', table_id: 'table', status: 'open', payer_name: 'Ana', assigned_waiter_id: 'staff', session_items: [old] };
  const state = { currentUser: { id: 'staff' }, sessions: [copy(account)], tables: [{ id: 'table' }], optimisticSessionStates: new Map() };
  const form = { session_id: { value: 'account' }, pending_table_id: { value: '' }, payer_name: { value: 'Ana' } };
  const context = vm.createContext({ state, Map, Date, AbortSignal, uid: randomUUID, REMOTE_CONFIRMATION_HOLD_MS: 1500,
    renderAdminLive() {}, toast() {}, notifyWaiterOrder() {}, isLocalWalkInSession: () => false,
    dbQuiet: async query => (await query).data });
  state.sb = { from(entity) {
    return {
      method: 'GET', url: new URL('https://test/' + entity), body: undefined,
      insert(rows) { this.method = 'POST'; this.body = rows; return this; },
      select() { return this; }, in(key, values) { this.ids = values; return this; }, abortSignal() { return this; },
      async then(resolve, reject) {
        try {
          if (offline) return resolve({ data: null });
          if (this.method === 'GET') return resolve({ data: [...remote.values()].filter(row => this.ids.includes(row.id)) });
          const rows = this.body.map(row => ({ ...copy(row), id: row.id || randomUUID() }));
          inserts.push(copy(this.body));
          for (const row of rows) remote.set(row.id, row);
          if (realtime) state.sessions = context.merge([{ ...account, session_items: [...remote.values()] }]);
          return resolve({ data: lostResponse ? null : rows });
        } catch (error) { return reject(error); }
      }
    };
  } };
  vm.runInContext(section('retryPosMutation', 'retryQuiet') + section('sessionItemMatches', 'isSongRequest')
    + section('addConsumptionBatch', 'confirmConsumptionSelection')
    + ';globalThis.add=addConsumptionBatch;globalThis.merge=mergeOptimisticSessions;', context);
  return { state, form, remote, inserts, add: drafts => context.add(form, drafts), online() { offline = false; } };
}
const drink = () => ({ itemName: 'Gaseosa', quantity: 2, unitPrice: 4000, notes: '' });
const total = rows => rows.reduce((sum, row) => sum + row.quantity * row.unit_price, 0);

test('agregar a una mesa ocupada suma solo los productos nuevos si realtime llega antes de la respuesta', async () => {
  const h = harness({ realtime: true });
  await h.add([drink()]);
  assert.equal(total(h.state.sessions[0].session_items), 58000);
  assert.equal(h.state.sessions[0].session_items.length, 2);
  assert.equal(total([...h.remote.values()]), 58000);
});

test('una respuesta perdida recupera las mismas líneas guardadas sin volver a sumarlas', async () => {
  const h = harness({ lostResponse: true });
  const result = await h.add([drink()]);
  assert.ok(result, 'Debe confirmar leyendo los UUID enviados al guardar.');
  assert.equal(total(h.state.sessions[0].session_items), 58000);
  assert.equal(h.inserts.length, 1);
  assert.equal(h.inserts[0][0].id, result.items[0].id);
});

test('reintentar una selección conserva la identidad y permite dos productos iguales legítimos', async () => {
  const h = harness({ offline: true }), drafts = [drink(), drink()];
  assert.equal(await h.add(drafts), null);
  const ids = drafts.map(row => row.sessionItemId);
  assert.ok(ids.every(id => /^[a-f0-9-]{36}$/.test(id)));
  assert.notEqual(ids[0], ids[1]);
  h.online();
  const saved = await h.add(drafts);
  assert.deepEqual(Array.from(saved.items, row => row.id), ids);
  assert.equal(h.state.sessions[0].session_items.length, 3);
  assert.equal(total(h.state.sessions[0].session_items), 66000);
});
