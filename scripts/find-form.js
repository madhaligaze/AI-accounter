// Ищет форму отчётности в каталоге «Подать документ» по подстроке.
// Ничего не подаёт — только находит и, по флагу --open, открывает.
// Использование: node scripts/find-form.js 910 [--open]
const path = require('path');
const { attach } = require('./lib/browser');

(async () => {
  const q = process.argv[2];
  const open = process.argv.includes('--open');
  const { browser, page } = await attach();

  if (!page.url().includes('/document-submit')) {
    await page.goto('https://knp.kgd.gov.kz/document-submit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }

  // В каталоге есть поиск — он быстрее и надёжнее, чем листать 7 страниц.
  const search = page.locator('#search-section');
  await search.fill(q);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);

  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.innerText.replace(/\n/g, ' | ').slice(0, 200))
  );
  console.log('НАЙДЕНО СТРОК:', rows.length);
  rows.forEach((r, i) => console.log(i, r));

  if (open && rows.length) {
    // Первая строка таблицы — служебная строка фильтров, поэтому ищем
    // ячейку с номером формы по всему тексту таблицы.
    const link = page.locator('tbody tr td').filter({ hasText: /^\s*\d{3}\.\d{2}\s/ }).first();
    await link.click({ timeout: 15000 });
    await page.waitForTimeout(4000);
    console.log('\nURL после открытия:', page.url());
    const t = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 4000));
    console.log('--- ТЕКСТ ---\n' + t);
    await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'form-' + Date.now() + '.png'), fullPage: true });
  }
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
