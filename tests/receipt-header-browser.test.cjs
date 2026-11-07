const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const section = (from, to) => source.slice(source.indexOf('  const ' + from + ' ='), source.indexOf('  const ' + to + ' =', source.indexOf('  const ' + from + ' =') + 1));

test('precuentas y facturas mantienen el NIT junto al negocio y el papel termina con el contenido', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/images/don-pieros-invoice-logo.png') {
      res.setHeader('Content-Type', 'image/png');
      // A cold printer popup must wait for the same header as a cached one.
      return setTimeout(() => res.end(fs.readFileSync(path.join(root, 'images/don-pieros-invoice-logo.png'))), 1200);
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head></head><body></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.addScriptTag({ content: `
      const state={business:{business_name:'Don Pieros Pizza'}};
      const escapeHTML=String, sessionTotals=()=>({subtotal:58000,total:58000});
      const tipsEnabled=()=>false, sessionPaid=()=>0, sessionLabel=()=> 'Mesa 1', sessionReference=()=> '123';
      const money=value=>'$'+value, roleLabel=String, paymentMethodLabel=String;
      window.DonPierosDates={date:()=> '06/11/2026',time:()=> '18:00'};
      ${section('thermalReceiptHtml', 'printThermalReceipt')}
      window.receipt=thermalReceiptHtml;
    ` });
    const session = { id: 'account', customer_phone: '3001234567', session_items: [{ item_name: 'Pizza', quantity: 2, unit_price: 25000 }, { item_name: 'Gaseosa', quantity: 2, unit_price: 4000 }] };
    const heights = new Map();
    for (const paid of [false, true]) for (const width of [80, 58]) for (const viewportHeight of [500, 1200]) {
      await page.setViewportSize({ width: 420, height: viewportHeight });
      const html = await page.evaluate(({ session, paid }) => receipt(session, paid ? { number: 'F-1', totals: { subtotal: 58000, total: 58000 }, payments: [] } : null), { session, paid });
      const popup = await browser.newPage({ viewport: { width: 420, height: viewportHeight } });
      await popup.goto('http://127.0.0.1:' + server.address().port);
      await popup.setContent(html, { waitUntil: 'domcontentloaded' });
      await popup.addScriptTag({ path: path.join(root, 'vendor/jspdf.umd.min.js') });
      await popup.addScriptTag({ path: path.join(root, 'thermal-print.js') });
      const result = await popup.evaluate(async width => {
        const { pdf, height } = await DonPierosThermal.createPdf(window, width);
        const brand = document.querySelector('.invoice-logo,.logo').getBoundingClientRect();
        const nit = [...document.querySelectorAll('div')].find(node => node.textContent.startsWith('NIT.')).getBoundingClientRect();
        const title = document.querySelector('.subtitle').getBoundingClientRect();
        const body = document.body.getBoundingClientRect(), last = document.body.lastElementChild.getBoundingClientRect();
        return { height, pages: pdf.getNumberOfPages(), logoReady: !document.querySelector('.invoice-logo') || document.querySelector('.invoice-logo').naturalWidth > 0, nitGap: nit.top - brand.bottom, titleGap: title.top - nit.bottom,
          trailing: height - (last.bottom - body.top) * 25.4 / 96,
          pageHeight: pdf.internal.pageSize.getHeight() };
      }, width);
      const label = `${paid ? 'factura' : 'precuenta'} ${width}mm / pantalla ${viewportHeight}`;
      assert.ok(result.logoReady, label + ': logo cargado antes de medir y crear el PDF');
      assert.match(await popup.locator('.meta').first().innerText(),/Teléfono:\s*3001234567/,label+': teléfono impreso');
      assert.ok(result.nitGap >= -0.1 && result.nitGap <= 8, label + ': NIT inmediatamente debajo del negocio');
      assert.ok(result.titleGap >= 0 && result.titleGap <= 8, label + ': título junto al NIT');
      assert.equal(result.pages, 1, label + ': una sola tira');
      assert.ok(result.trailing >= 0 && result.trailing < 5, label + ': sin papel vacío al final');
      assert.ok(Math.abs(result.pageHeight - result.height) < 0.1, label + ': PDF ajustado al contenido');
      const key = `${paid}:${width}`;
      if (heights.has(key)) assert.equal(result.height, heights.get(key), label + ': altura independiente de la pantalla');
      heights.set(key, result.height);
      await popup.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
