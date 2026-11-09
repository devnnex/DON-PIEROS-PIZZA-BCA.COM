/* Las sesiones operativas terminan a las 02:00 de Colombia (UTC-5). */
(function (root) {
  'use strict';
  const DAY = 86400000, CUTOFF_UTC = 7 * 3600000;
  const nextCutoff = (now = Date.now()) => Math.floor((now - CUTOFF_UTC) / DAY) * DAY + CUTOFF_UTC + DAY;
  const create = ({ storage, waiter = false, now = Date.now, onExpire = () => {} }) => {
    const tokenKey = waiter ? 'don_pieros_waiter_token' : 'don_pieros_admin_token';
    const userKey = waiter ? 'don_pieros_waiter_user_v1' : 'don_pieros_admin_user_v1';
    const expiryKey = tokenKey + '_expiry_v1';
    let active = '', expiry = 0, issued = 0;
    const clear = () => {
      active = ''; expiry = 0; issued = 0;
      [tokenKey, userKey, expiryKey, 'don_pieros_user_credentials_v1'].forEach(key => storage.removeItem(key));
    };
    const valid = (record, token) => Boolean(token && record?.token === token
      && Number.isFinite(record.expiresAt) && Number.isFinite(record.issuedAt)
      && record.issuedAt <= now() && record.expiresAt > now()
      && record.expiresAt <= nextCutoff(record.issuedAt));
    const restore = () => {
      const token = storage.getItem(tokenKey) || '';
      let record;
      try { record = JSON.parse(storage.getItem(expiryKey) || 'null'); } catch (_) {}
      if (!valid(record, token)) { clear(); return ''; }
      active = token; expiry = record.expiresAt; issued = record.issuedAt;
      return token;
    };
    const save = session => {
      const role = session?.user?.role;
      if (!session?.token || !['boss', 'admin', 'waiter'].includes(role)) throw Error('Sesión no válida.');
      const start = now(), remoteExpiry = Date.parse(session.expires_at);
      const end = Math.min(nextCutoff(start), start + 12 * 3600000, Number.isFinite(remoteExpiry) ? remoteExpiry : Infinity);
      if (end <= start) throw Error('La sesión venció. Inicia sesión de nuevo.');
      storage.setItem(tokenKey, session.token);
      storage.setItem(userKey, JSON.stringify(session.user));
      storage.setItem(expiryKey, JSON.stringify({ token: session.token, issuedAt: start, expiresAt: end }));
      active = session.token; expiry = end; issued = start;
    };
    const ensureActive = () => {
      if (!active) return false;
      if (storage.getItem(tokenKey) !== active) {
        active = ''; onExpire(); return false;
      }
      if (now() < issued || now() >= expiry) {
        clear(); onExpire(); return false;
      }
      return true;
    };
    return { tokenKey, userKey, restore, save, clear, ensureActive };
  };
  const api = { nextCutoff, create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DonPierosStaffSession = api;
})(typeof window === 'object' ? window : globalThis);
