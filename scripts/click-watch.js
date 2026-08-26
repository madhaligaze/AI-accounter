// Кликает и одновременно слушает консоль, ошибки страницы, запросы и
// WebSocket-кадры через CDP — чтобы увидеть, почему шаг не срабатывает.
// Использование: node scripts/click-watch.js "Выбрать ЭЦП" [ждать_мс]
const { attach } = require('./lib/browser');

(async () => {
  const target = process.argv[2];
  const wait = parseInt(process.argv[3] || '6000', 10);
  const { browser, page } = await attach();

  page.on('console', (m) => console.log('CONSOLE[' + m.type() + ']', m.text().slice(0, 300)));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
  page.on('requestfailed', (r) => console.log('REQFAIL', r.url().slice(0, 120), r.failure()?.errorText));
  page.on('websocket', (ws) => {
    console.log('WS OPEN', ws.url());
    ws.on('framesent', (f) => console.log('WS OUT', String(f.payload).slice(0, 1000)));
    ws.on('framereceived', (f) => console.log('WS IN ', String(f.payload).slice(0, 1000)));
    ws.on('socketerror', (e) => console.log('WS ERR', e));
    ws.on('close', () => console.log('WS CLOSE', ws.url()));
  });

  if (target) {
    const loc = page.getByRole('button', { name: target }).first();
    await loc.click({ timeout: 15000 }).catch(async () => {
      await page.getByText(target, { exact: false }).first().click({ timeout: 15000 });
    });
    console.log('clicked:', target);
  }
  await page.waitForTimeout(wait);
  console.log('URL now:', page.url());
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
