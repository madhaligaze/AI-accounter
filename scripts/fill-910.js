// Заполняет раздел 1 декларации 910.00. Ничего не подписывает и не отправляет —
// отправка вынесена в отдельный шаг, чтобы её нельзя было запустить случайно.
// Использование: node scripts/fill-910.js "Дополнительная"
const path = require('path');
const { attach } = require('./lib/browser');
const { selectByLabel, readValue } = require('./lib/form');

(async () => {
  const vid = process.argv[2] || 'Дополнительная';
  const { browser, page } = await attach();

  if (!page.url().includes('/document-submit/910.00')) {
    console.log('форма не открыта, текущий URL:', page.url());
    console.log('сначала: node scripts/open-910.js "1 полугодие" 2026 && node scripts/press.js "ПОДАТЬ" 9000 --modal');
    await browser.close();
    return;
  }

  await selectByLabel(page, 'Вид декларации', vid);
  console.log('вид декларации ->', await readValue(page, 'Вид декларации'));

  // Для ИП на упрощёнке бухучёт по п.2 ст.2 не ведётся — это вариант B.
  await selectByLabel(page, 'Отдельная категория', 'не ведет бухгалтерский учет');
  console.log('категория ->', (await readValue(page, 'Отдельная категория')).slice(0, 40));

  await selectByLabel(page, 'Признак резиденства', 'Резидент РК');
  console.log('резидентство ->', await readValue(page, 'Признак резиденства'));

  await page.waitForTimeout(1500);

  // Смотрим, подставился ли ОКЭД сам из регистрационных данных.
  console.log('вид деятельности A ->', await readValue(page, 'AПрименяемый'));

  const errs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-form-item-explain-error, .ant-form-item-has-error'))
      .map((e) => e.innerText.trim()).filter(Boolean).slice(0, 15)
  );
  console.log('ошибки валидации:', JSON.stringify(errs, null, 1));

  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'fill-' + Date.now() + '.png'), fullPage: true });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
