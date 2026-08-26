// Открывает поданный документ из «Мои документы» по номеру строки
// и печатает его содержимое. Только чтение.
// Использование: node scripts/open-sent.js 3
const path = require('path');
const { attach } = require('./lib/browser');

(async () => {
  const idx = parseInt(process.argv[2] || '0', 10);
  const { browser, page } = await attach();

  await page.goto('https://knp.kgd.gov.kz/documents-sent', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  const rows = page.locator('tbody tr').filter({ hasText: '910.00' });
  const n = await rows.count();
  console.log('строк 910.00:', n);
  if (idx >= n) { console.log('нет такой строки'); await browser.close(); return; }

  await rows.nth(idx).click({ timeout: 15000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());

  const txt = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 6000));
  console.log('--- ДОКУМЕНТ ---\n' + txt);
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'sent-' + Date.now() + '.png'), fullPage: true });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
