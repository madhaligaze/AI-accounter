// Кликает по элементу с заданным текстом и ждёт. Универсальный шаг сценария.
// Использование: node scripts/click.js "Выбрать ЭЦП" [ждать_мс]
const { attach } = require('./lib/browser');

(async () => {
  const target = process.argv[2];
  const wait = parseInt(process.argv[3] || '3000', 10);
  const { browser, page } = await attach();

  const loc = page.getByText(target, { exact: false }).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click({ timeout: 15000 });
  console.log('clicked:', target);

  await page.waitForTimeout(wait);
  console.log('URL now:', page.url());

  const nca = await page.evaluate(() => window.__ncaLog || []);
  console.log('--- NCALayer traffic (' + nca.length + ') ---');
  nca.forEach((m) => console.log(m.dir, m.data.slice(0, 1000)));

  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
