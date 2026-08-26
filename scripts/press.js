// Нажимает кнопку по названию и показывает, что стало со страницей.
// Использование: node scripts/press.js "ПОДАТЬ" [ждать_мс] [--modal]
const path = require('path');
const { attach } = require('./lib/browser');

(async () => {
  const name = process.argv[2];
  const wait = parseInt(process.argv[3] || '6000', 10);
  const inModal = process.argv.includes('--modal');
  const { browser, page } = await attach();

  const scope = inModal ? page.locator('.ant-modal') : page;
  await scope.getByRole('button', { name, exact: false }).first().click({ timeout: 20000 });
  console.log('нажато:', name);
  await page.waitForTimeout(wait);

  console.log('URL:', page.url());
  const txt = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 5000));
  console.log('--- ТЕКСТ ---\n' + txt);
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'press-' + Date.now() + '.png'), fullPage: true });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
