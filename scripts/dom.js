// Печатает поля ввода/селекты текущей страницы с их атрибутами.
// Нужен, чтобы подобрать корректные селекторы под конкретный экран КНП.
const { attach } = require('./lib/browser');

(async () => {
  const { browser, page } = await attach();
  const els = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input,select,textarea,.ant-select,[role=combobox]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      out.push({
        tag: e.tagName.toLowerCase(),
        type: e.getAttribute('type') || '',
        id: e.id || '',
        name: e.getAttribute('name') || '',
        ph: e.getAttribute('placeholder') || '',
        cls: (e.className || '').toString().slice(0, 70),
        val: (e.value || '').slice(0, 60),
        aria: e.getAttribute('aria-label') || '',
      });
    });
    return out;
  });
  console.log('ПОЛЕЙ:', els.length);
  els.forEach((e, i) => console.log(i, JSON.stringify(e)));
  await browser.close();
})();
