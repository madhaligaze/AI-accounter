// Показывает текст открытого модального окна и, по флагу, закрывает его.
// Использование: node scripts/modal.js [текст_кнопки_для_клика]
const { attach } = require('./lib/browser');

(async () => {
  const btn = process.argv[2];
  const { browser, page } = await attach();

  const modals = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-modal-wrap, [role=dialog]'))
      .filter((m) => m.offsetParent !== null || getComputedStyle(m).display !== 'none')
      .map((m) => ({
        text: m.innerText.trim().slice(0, 1200),
        buttons: Array.from(m.querySelectorAll('button')).map((b) => b.innerText.trim()),
      }))
  );
  console.log(JSON.stringify(modals, null, 2));

  if (btn) {
    await page.locator('.ant-modal-wrap').getByRole('button', { name: btn }).first().click({ timeout: 10000 });
    console.log('нажато:', btn);
  }
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
