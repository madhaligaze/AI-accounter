// Проставляет 0 во все доступные числовые поля текущего раздела формы.
// Именно это означает «нулевая отчётность»: суммы явно равны нулю,
// а не оставлены пустыми.
const { attach } = require('./lib/browser');

(async () => {
  const { browser, page } = await attach();

  const inputs = page.locator('input[placeholder="Введите значение"]:not([disabled])');
  const n = await inputs.count();
  console.log('числовых полей:', n);

  let filled = 0;
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    if (!(await el.isEditable().catch(() => false))) continue;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.fill('0').catch(() => {});
    await page.waitForTimeout(150);
    filled++;
  }
  console.log('проставлено нулей:', filled);

  const vals = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[placeholder="Введите значение"]')).map((e) => e.value)
  );
  console.log('значения:', JSON.stringify(vals));
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
