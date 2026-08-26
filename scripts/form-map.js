// Строит карту полей открытой формы отчётности: метка -> тип контрола,
// текущее значение, обязательность. Основа для автозаполнения деклараций.
const { attach } = require('./lib/browser');

(async () => {
  const { browser, page } = await attach();

  const fields = await page.evaluate(() => {
    // Метку ищем вверх по дереву: КНП использует ant-form-item / ant-row.
    const labelOf = (el) => {
      let n = el;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        if (!n) break;
        const lab = n.querySelector('label, .ant-form-item-label, .form-label');
        if (lab && lab.innerText.trim()) return lab.innerText.trim().slice(0, 90);
      }
      const item = el.closest('.ant-form-item, .ant-row');
      return item ? item.innerText.trim().split('\n')[0].slice(0, 90) : '';
    };

    const out = [];
    document.querySelectorAll('.ant-select, input:not(.ant-select-selection-search-input), textarea').forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const isSelect = el.classList.contains('ant-select');
      const shown = isSelect ? (el.innerText || '').trim().slice(0, 50) : el.value;
      out.push({
        i: idx,
        kind: isSelect ? 'select' : (el.tagName.toLowerCase() + ':' + (el.getAttribute('type') || 'text')),
        label: labelOf(el),
        value: shown,
        ph: el.getAttribute('placeholder') || '',
        required: !!el.closest('.ant-form-item-has-error, .ant-form-item-required') ||
                  (el.closest('.ant-form-item, .ant-row') || {}).innerText?.includes('Обязательное поле') || false,
        disabled: el.disabled === true || el.classList.contains('ant-select-disabled'),
      });
    });
    return out;
  });

  console.log('ПОЛЕЙ:', fields.length);
  fields.forEach((f) => console.log(JSON.stringify(f)));
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
