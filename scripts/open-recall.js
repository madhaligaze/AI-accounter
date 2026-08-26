// Открывает «Налоговое заявление на отзыв налоговой отчетности».
// Только открывает и показывает поля — ничего не отправляет.
const path = require('path');
const { attach } = require('./lib/browser');

(async () => {
  const { browser, page } = await attach();

  await page.goto('https://knp.kgd.gov.kz/document-submit', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const label of ['Нет, спасибо', 'Закрыть']) {
    const b = page.locator('.ant-modal-wrap').getByRole('button', { name: label }).first();
    if (await b.count().catch(() => 0)) await b.click({ timeout: 4000 }).catch(() => {});
  }

  await page.locator('#search-section').fill('отзыв');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  await page.locator('tbody tr td')
    .filter({ hasText: 'Налоговое заявление на отзыв налоговой отчетности' })
    .first().click({ timeout: 15000 });
  await page.waitForTimeout(6000);

  console.log('URL:', page.url());
  const txt = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n'));
  const i = Math.max(0, txt.indexOf('Главная/'));
  console.log('--- ФОРМА ---\n' + txt.slice(i, i + 3000));

  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim()).filter(Boolean));
  console.log('\nкнопки:', JSON.stringify(btns));

  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'recall-' + Date.now() + '.png'), fullPage: true });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
