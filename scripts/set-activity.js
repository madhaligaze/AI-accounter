// Подставляет код вида деятельности (ОКЭД) в строку A декларации.
// Справочник большой, поэтому значение ищем набором в поиске селекта.
// Использование: node scripts/set-activity.js <ОКЭД>
const path = require('path');
const { attach } = require('./lib/browser');

(async () => {
  const code = process.argv[2] || process.env.KNP_OKED;
  if (!code) { console.log('укажите ОКЭД аргументом или в KNP_OKED'); return; }
  const { browser, page } = await attach();

  // В строке A два селекта — «Код» и «Наименование». Берём первый по порядку
  // в DOM: опираться на текст нельзя, он меняется после ввода.
  const handle = await page.evaluateHandle(() => {
    const inRow = [];
    for (const el of Array.from(document.querySelectorAll('.ant-select'))) {
      let n = el;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        if (!n) break;
        const lab = n.querySelector('label, .ant-form-item-label');
        if (lab && lab.innerText.includes('AПрименяемый')) { inRow.push(el); break; }
      }
    }
    return inRow[0] || null;
  });

  const el = handle.asElement();
  if (!el) { console.log('селект кода деятельности не найден'); await browser.close(); return; }

  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.waitForTimeout(800);
  await page.keyboard.type(code, { delay: 90 });
  await page.waitForTimeout(1800);

  const opts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'))
      .map((d) => d.innerText.trim().slice(0, 300))
  );
  console.log('варианты после поиска:', JSON.stringify(opts));

  // В выпадашке есть скрытый a11y-список с role=option — кликать нужно
  // именно по видимому .ant-select-item-option, иначе клик уходит в никуда.
  const opt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
    .filter({ hasText: code }).first();
  if (await opt.count()) {
    await opt.click({ timeout: 8000 });
    console.log('код выбран кликом:', code);
  } else {
    await page.keyboard.press('Enter');
    console.log('код выбран через Enter:', code);
  }
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => {
    const out = {};
    for (const el of Array.from(document.querySelectorAll('.ant-select'))) {
      let n = el;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        if (!n) break;
        const lab = n.querySelector('label, .ant-form-item-label');
        if (lab && lab.innerText.includes('AПрименяемый')) {
          out[(el.innerText || '').includes('Наименование') ? 'наименование' : 'код'] = (el.innerText || '').trim().slice(0, 60);
          break;
        }
      }
    }
    const errs = Array.from(document.querySelectorAll('.ant-form-item-explain-error'))
      .map((e) => e.innerText.trim()).filter(Boolean);
    return { A: out, ошибок: errs.length };
  });
  console.log(JSON.stringify(state, null, 1));

  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'act-' + Date.now() + '.png'), fullPage: true });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
