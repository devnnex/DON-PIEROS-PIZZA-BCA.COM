const test=require('node:test'),assert=require('node:assert/strict');
const dates=require('../date-format.js');
test('fechas visibles usan el mismo formato colombiano de fecha y hora',()=>{
 assert.equal(dates.dateTime('2026-10-29T00:30:00Z'),'Mié 28 oct 2026 - 7:30 PM');
 assert.equal(dates.date('2026-10-28'),'Mié 28 oct 2026');
 assert.equal(dates.time('2026-10-29T00:30:00Z'),'7:30 PM');
 assert.equal(dates.dateTime('2026-10-28T19:30'),'Mié 28 oct 2026 - 7:30 PM');
 assert.equal(dates.dateTime('2026-10-28T05:00:00Z'),'Mié 28 oct 2026 - 12:00 AM');
 assert.equal(dates.dateTime('2026-10-28T17:00:00Z'),'Mié 28 oct 2026 - 12:00 PM');
});
test('fechas sin hora conservan el día y las inválidas no inventan otro',()=>{
 for(const value of ['2026-01-01','2026-12-31','2028-02-29'])assert.ok(!dates.date(value).includes('Sin fecha'));
 for(const value of [null,undefined,'','no es fecha','2026-02-30','2026-13-01'])assert.equal(dates.date(value),'Sin fecha');
 assert.equal(dates.date(0),'Mié 31 dic 1969');
});
