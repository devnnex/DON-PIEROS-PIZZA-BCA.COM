const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const slice = (a, b) => source.slice(source.indexOf('  const ' + a + ' ='), source.indexOf('  const ' + b + ' =', source.indexOf('  const ' + a + ' =') + 1));
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };

function harness(savedStorage) {
  const state = { soundEnabled: true, soundPrimed: false, announcedRequestIds: new Set(), alertAnnouncementQueue: [], requests: [] };
  const events = new Map(), timers = new Map(), storage = savedStorage||new Map(), calls = [], voices = [];
  let blocked = true, timerId = 0;
  class Audio {
    constructor() { this.volume = 1; this.handlers = new Map(); }
    async play() { calls.push({ audio: this, volume: this.volume, blocked }); if (blocked) throw Error('NotAllowedError'); }
    pause() {}
    addEventListener(name, fn) { this.handlers.set(name, fn); }
    removeEventListener(name) { this.handlers.delete(name); }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const alarm = new Audio();
  const webOrderAudio = new Audio();
  const window = { SpeechSynthesisUtterance: Utterance,
    speechSynthesis: { resume() {}, getVoices: () => [{ lang: 'es-CO' }], speak: u => voices.push(u), cancel() {} },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id) };
  const context = vm.createContext({ state, Audio, RECEIPT_SOUND: 'receipt.mp3', window, SpeechSynthesisUtterance: Utterance,
    document: { addEventListener(name, fn, options) { events.set(name, { fn, options }); } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    getAlarmAudio: () => alarm, getWebOrderAudio: () => webOrderAudio, updateAlarmButton() {}, toast() {}, hasOpenAdminChatForRequest: () => false,
    activeRequests: () => state.requests.filter(r => r.status === 'pending'), requestTableName: r => 'Mesa ' + r.table_id,
    requestOrigin: () => ({kind:'client'}), isSongRequest: () => false, normalizeText: value=>String(value).toLowerCase(),
    Date, Map, Set });
  vm.runInContext(slice('getReceiptAudio', 'latestClientBill') + slice('requestVoiceText', 'disableAlarm')
    + slice('primeAlertVoice', 'startAlarmLoop')
    + ';globalThis.api={playReceiptSound,playClientChatReceipt,playAdminChatReceipt,armClientSoundsOnFirstGesture,armAlarmOnFirstGesture,playAlarm,announceWebOrders};', context);
  return { state, calls, voices, storage, api: context.api, alarm,webOrderAudio,
    unblock() { blocked = false; }, block() { blocked = true; },
    async gesture(name) { const event = events.get(name); assert.ok(event); assert.equal(event.options.capture, true); event.fn({ target: { closest: () => null } }); await settle(); },
    async finishUnlock() { for (const [id, timer] of [...timers]) if (timer.ms === 450 || timer.ms === 1100) { timers.delete(id); timer.fn(); } await settle(); },
    async finishTone(web=false) { (web?webOrderAudio:alarm).handlers.get('ended')?.(); await settle(); },
    async finishVoice() { voices.at(-1)?.onend?.(); await settle(); }
  };
}

test('recargar conserva los pedidos web y comandas de mesero ya reproducidos',async()=>{
 const first=harness();first.unblock();first.state.soundPrimed=true;
 const request={id:'waiter-comanda',table_id:'1',request_type:'other',status:'pending'};first.state.requests=[request];
 first.api.announceWebOrders([{id:'DP-persisted',status:'nueva'}]);first.api.playAlarm();
 await settle();await first.finishTone(true);await first.finishVoice();await first.finishTone();await first.finishVoice();
 const refreshed=harness(first.storage);refreshed.unblock();refreshed.state.soundPrimed=true;refreshed.state.requests=[request];
 refreshed.api.announceWebOrders([{id:'DP-persisted',status:'nueva'}]);refreshed.api.playAlarm();await settle();assert.equal(refreshed.calls.length,0);
 refreshed.api.announceWebOrders([{id:'DP-new',status:'nueva'}]);await settle();assert.ok(refreshed.calls.length>0,'Los pedidos nuevos sí avisan');
});

test('Admin conserva solicitudes anteriores al gesto y anuncia tono y voz al terminar el deslizamiento', async () => {
  const h = harness(); h.api.armAlarmOnFirstGesture();
  h.state.requests = [{ id: 'a', table_id: '12', status: 'pending' }];
  h.api.playAlarm(); await settle();
  assert.equal(h.calls.length, 0); assert.equal(h.state.alertAnnouncementQueue.length, 1);
  await h.gesture('touchstart'); assert.equal(h.state.soundPrimed, false);
  h.unblock(); await h.gesture('touchend'); assert.equal(h.state.soundPrimed, true);
  await h.finishUnlock(); await h.finishTone();
  assert.ok(h.voices.some(u => u.volume === 0), 'Prepara la voz dentro del gesto.');
  assert.equal(h.voices.filter(u => u.volume === 1).length, 1);
  h.api.playAlarm(); await settle(); assert.equal(h.voices.filter(u => u.volume === 1).length, 1);
});

test('Pedidos web usan su tono y frase de marca; mesa y web se escuchan en orden y sin repetir',async()=>{
 const h=harness();h.unblock();h.api.armAlarmOnFirstGesture();await h.gesture('pointerup');await h.finishUnlock();
 h.state.requests=[{id:'mesa',table_id:'7',request_type:'waiter',status:'pending'}];
 h.api.playAlarm();await settle();
 assert.equal(h.calls.at(-1).audio,h.alarm);await h.finishTone();
 assert.equal(h.voices.at(-1).text,'Mesa 7 solicita al mesero.');
 const order={id:'DP-1',status:'nueva'};h.api.announceWebOrders([order]);h.api.announceWebOrders([order]);
 await settle();assert.equal(h.state.alertAnnouncementQueue.length,1);
 assert.equal(h.calls.at(-1).audio,h.alarm,'No superpone el pedido a la voz de la mesa.');
 await h.finishVoice();assert.equal(h.calls.at(-1).audio,h.webOrderAudio);await h.finishTone(true);
 assert.equal(h.voices.at(-1).text,'Una nueva orden ha llegado a Don Pieros Pizza.');
 await h.finishVoice();assert.equal(h.state.alertAnnouncementQueue.length,0);
 const count=h.calls.length;h.api.announceWebOrders([order]);await settle();assert.equal(h.calls.length,count);
 h.state.requests.push({id:'bill',table_id:'9',request_type:'bill',status:'pending'});h.api.playAlarm();await settle();await h.finishTone();
 assert.equal(h.voices.at(-1).text,'Mesa 9 solicita la cuenta.');
});

test('Pedido web anterior al gesto se anuncia al habilitar sonido, pero apagado no habla',async()=>{
 const h=harness();h.api.armAlarmOnFirstGesture();h.api.announceWebOrders([{id:'DP-2',status:'nueva'}]);
 assert.equal(h.state.alertAnnouncementQueue.length,1);h.unblock();await h.gesture('touchend');await h.finishUnlock();await h.finishTone(true);
 assert.equal(h.voices.at(-1).text,'Una nueva orden ha llegado a Don Pieros Pizza.');await h.finishVoice();
 h.state.soundEnabled=false;const calls=h.calls.length;h.api.announceWebOrders([{id:'DP-3',status:'nueva'}]);await settle();assert.equal(h.calls.length,calls);
});

test('Si se bloquea el tono web, el siguiente gesto recupera tono y voz una sola vez',async()=>{
 const h=harness();h.unblock();h.api.armAlarmOnFirstGesture();await h.gesture('pointerup');await h.finishUnlock();
 h.block();h.api.announceWebOrders([{id:'DP-4',status:'nueva'}]);await settle();
 assert.equal(h.state.soundPrimed,false);assert.equal(h.state.webOrderSoundPrimed,false);assert.equal(h.state.alertAnnouncementQueue.length,1);
 h.unblock();await h.gesture('touchend');await h.finishUnlock();await h.finishTone(true);
 assert.equal(h.voices.filter(voice=>voice.volume===1).length,1);assert.equal(h.voices.at(-1).text,'Una nueva orden ha llegado a Don Pieros Pizza.');
});

test('Un bloqueo posterior del tono conserva la solicitud para el siguiente toque sin anunciarla dos veces', async () => {
  const h = harness(); h.api.armAlarmOnFirstGesture(); h.unblock(); await h.gesture('pointerup');
  h.state.requests = [{ id: 'a', table_id: '20', status: 'pending' }];
  h.block(); h.api.playAlarm(); await settle();
  assert.equal(h.state.soundPrimed, false); assert.equal(h.state.alertAnnouncementQueue.length, 1);
  h.unblock(); await h.gesture('click'); await h.finishUnlock(); await h.finishTone();
  assert.equal(h.voices.filter(u => u.volume === 1).length, 1); assert.equal(h.state.alertAnnouncementQueue.length, 0);
});

test('Index recupera el sonido de atención y cuenta bloqueados al terminar el gesto usando el mismo audio', async () => {
  const h = harness(); h.api.armClientSoundsOnFirstGesture();
  await h.api.playClientChatReceipt('atendida'); await h.api.playReceiptSound('cuenta');
  assert.equal(h.state.pendingReceiptSounds.size, 2);
  h.unblock(); await h.gesture('touchend');
  assert.equal(h.state.pendingReceiptSounds.size, 0); assert.equal(h.storage.get('receipt_sound_cuenta'), '1');
  assert.equal(new Set(h.calls.map(c => c.audio)).size, 1, 'Reutiliza el elemento desbloqueado en móvil.');
  const count = h.calls.length; await h.api.playReceiptSound('cuenta'); assert.equal(h.calls.length, count);
});

test('Los gestos no reactivan una alarma que el administrador desactivó', async () => {
  const h = harness(); h.state.soundEnabled = false; h.api.armAlarmOnFirstGesture();
  h.unblock(); await h.gesture('touchend'); assert.equal(h.calls.length, 0); assert.equal(h.voices.length, 0);
});

test('Index reintenta un aviso pendiente si el navegador vuelve a bloquear el audio', async () => {
  const h = harness(); h.api.armClientSoundsOnFirstGesture(); h.unblock(); await h.gesture('pointerup');
  h.block(); await h.api.playClientChatReceipt('atendida'); assert.equal(h.state.receiptSoundPrimed, false);
  h.unblock(); await h.gesture('click'); assert.equal(h.state.pendingReceiptSounds.size, 0);
});
