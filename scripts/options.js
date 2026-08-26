// Показывает варианты ant-select'а, найденного по подстроке метки.
// Использование: node scripts/options.js "Вид декларации"
const { attach } = require('./lib/browser');

(async () => {
  const q = process.argv[2];
  const { browser, page } = await attach();

  const handle = await page.evaluateHandle((needle) => {
    const sels = Array.from(document.querySelectorAll('.ant-select'));
    for (const el of sels) {
      let n = el;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        if (!n) break;
        const lab = n.querySelector('label, .ant-form-item-label');
        if (lab && lab.innerText.includes(needle)) return el;
      }
    }
    return null;
  }, q);

  const el = handle.asElement();
  if (!el) { console.log('селект не найден по метке:', q); await browser.close(); return; }

  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.waitForTimeout(1200);
  const opts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'))
      .map((o) => o.innerText.trim()).slice(0, 60)
  );
  console.log(q, '->', JSON.stringify(opts, null, 1));

  // Некоторые справочники КНП рисуют список другой разметкой —
  // если стандартных опций нет, показываем сырой текст выпадашки.
  if (opts.length === 0) {
    const raw = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ant-select-dropdown'))
        .filter((d) => !d.classList.contains('ant-select-dropdown-hidden'))
        .map((d) => d.innerText.trim().slice(0, 800))
    );
    console.log('  сырой текст выпадашек:', JSON.stringify(raw, null, 1));
  }
  await page.keyboard.press('Escape');
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
