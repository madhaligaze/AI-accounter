// Открывает 910.00, выбирает период (полугодие + год) и нажимает ПОДАТЬ,
// что ведёт в редактор самой формы. Реальной отправки на этом шаге нет —
// подпись и отправка происходят уже внутри редактора.
// Использование: node scripts/open-910.js "1 полугодие" 2026
const path = require('path');
const { attach } = require('./lib/browser');

(async () => {
  const half = process.argv[2] || '1 полугодие';
  const year = process.argv[3] || '2026';
  const { browser, page } = await attach();

  await page.goto('https://knp.kgd.gov.kz/document-submit', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  for (const label of ['Нет, спасибо', 'Закрыть']) {
    const b = page.locator('.ant-modal-wrap').getByRole('button', { name: label }).first();
    if (await b.count().catch(() => 0)) await b.click({ timeout: 4000 }).catch(() => {});
  }

  await page.locator('#search-section').fill('910');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  await page.locator('tbody tr td').filter({ hasText: /^\s*910\.00\s/ }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  console.log('форма 910.00 открыта');

  // Полугодие — обычный ant-select.
  await page.locator('.ant-modal .ant-select').first().click();
  await page.waitForTimeout(800);
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
    .filter({ hasText: half }).first().click();
  await page.waitForTimeout(600);
  console.log('полугодие:', half);

  // Год — датапикер с панелью годов.
  await page.locator('.ant-modal input[placeholder="Выберите дату"]').first().click();
  await page.waitForTimeout(1200);
  const cell = page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell-inner')
    .filter({ hasText: new RegExp('^' + year + '$') }).first();
  if (await cell.count()) {
    await cell.click();
    console.log('год:', year);
  } else {
    const cells = await page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell-inner')
      .allInnerTexts();
    console.log('год не найден напрямую, доступно:', JSON.stringify(cells.slice(0, 30)));
  }
  await page.waitForTimeout(1200);

  const txt = await page.evaluate(() => {
    const m = document.querySelector('.ant-modal');
    return m ? m.innerText.slice(0, 800) : '(модалка не найдена)';
  });
  console.log('--- СОСТОЯНИЕ МОДАЛКИ ---\n' + txt);

  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'f910-' + Date.now() + '.png') });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
