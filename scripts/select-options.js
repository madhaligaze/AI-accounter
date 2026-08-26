// Раскрывает ant-select'ы в открытом модальном окне и печатает их варианты.
// Ничего не выбирает — только разведка доступных значений.
const { attach } = require('./lib/browser');

(async () => {
  const { browser, page } = await attach();

  const selects = page.locator('.ant-modal .ant-select');
  const n = await selects.count();
  console.log('селектов в модалке:', n);

  for (let i = 0; i < n; i++) {
    const s = selects.nth(i);
    const label = await s.evaluate((el) => {
      const row = el.closest('.ant-row, .ant-form-item, div');
      return (row ? row.innerText : '').split('\n')[0].slice(0, 60);
    });
    await s.click();
    await page.waitForTimeout(900);
    const opts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'))
        .map((o) => o.innerText.trim())
    );
    console.log('\n[' + i + '] ' + label + ' -> ' + JSON.stringify(opts));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
