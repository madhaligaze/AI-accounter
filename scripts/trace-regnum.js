// Диагностика: какой запрос КНП делает по регистрационному номеру
// и почему поля «Код/Вид налоговой отчетности» остаются пустыми.
const { attach } = require('./lib/browser');

(async () => {
  const reg = process.argv[2];
  if (!reg) { console.log('использование: node scripts/trace-regnum.js <регистрационный-номер>'); return; }
  const { browser, page } = await attach();

  page.on('response', async (r) => {
    const u = r.url();
    if (!/api/i.test(u)) return;
    let b = '';
    try { b = (await r.text()).slice(0, 400); } catch { }
    console.log(r.status(), u.replace('https://knp.kgd.gov.kz', ''));
    if (b) console.log('    ', b.replace(/\s+/g, ' '));
  });

  const f = page.locator('input[placeholder="Введите значение"]:not([disabled])').first();
  await f.fill('');
  await page.waitForTimeout(1000);
  await f.type(reg, { delay: 60 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(6000);

  const v = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map((e) => ({ v: e.value, d: e.disabled })).filter((x) => x.v));
  console.log('ЗНАЧЕНИЯ:', JSON.stringify(v));

  const errs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map((e) => e.innerText.trim()));
  console.log('ОШИБКИ:', JSON.stringify(errs));
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
