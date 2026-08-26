// Помощники для работы с формами КНП (Ant Design).
// Справочники КНП рисуют опции нестандартной разметкой, поэтому выбираем
// значение по видимому тексту внутри открытой выпадашки, а не по .ant-select-item.

async function selectByLabel(page, labelPart, optionText) {
  const handle = await page.evaluateHandle((needle) => {
    for (const el of Array.from(document.querySelectorAll('.ant-select'))) {
      let n = el;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        if (!n) break;
        const lab = n.querySelector('label, .ant-form-item-label');
        if (lab && lab.innerText.includes(needle)) return el;
      }
    }
    return null;
  }, labelPart);

  const el = handle.asElement();
  if (!el) throw new Error('селект не найден: ' + labelPart);

  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.waitForTimeout(900);

  const opt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText(optionText, { exact: false }).first();
  await opt.click({ timeout: 10000 });
  await page.waitForTimeout(700);
  return true;
}

async function readValue(page, labelPart) {
  return page.evaluate((needle) => {
    for (const el of Array.from(document.querySelectorAll('.ant-select'))) {
      let n = el;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        if (!n) break;
        const lab = n.querySelector('label, .ant-form-item-label');
        if (lab && lab.innerText.includes(needle)) return (el.innerText || '').trim().slice(0, 80);
      }
    }
    return '(не найдено)';
  }, labelPart);
}

module.exports = { selectByLabel, readValue };
