// Переход по адресу внутри кабинета с последующим осмотром страницы.
// Использование: node scripts/goto.js /document-submit
const path = require('path');
const fs = require('fs');
const { attach } = require('./lib/browser');

const SHOTS = path.join(__dirname, '..', 'shots');

(async () => {
  const dest = process.argv[2];
  const { browser, page } = await attach();
  fs.mkdirSync(SHOTS, { recursive: true });

  const url = dest.startsWith('http') ? dest : 'https://knp.kgd.gov.kz' + dest;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 6000));
  console.log('--- ТЕКСТ СТРАНИЦЫ ---\n' + text);

  const name = 'page-' + Date.now() + '.png';
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  console.log('\nSHOT:', path.join(SHOTS, name));
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
