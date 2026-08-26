// Отзыв поданной налоговой отчётности: форма 007.00.
// Достаточно регистрационного номера — остальные поля КНП подтягивает сам.
//
// По умолчанию доходит до финального раздела и останавливается.
// Реальная подача заявления — только с флагом --submit.
//
// Использование:
//   node scripts/recall.js <регистрационный-номер>
//   node scripts/recall.js <регистрационный-номер> --submit
const path = require('path');
const { spawn } = require('child_process');
const { attach } = require('./lib/browser');

const SHOTS = path.join(__dirname, '..', 'shots');

(async () => {
  const regNum = process.argv[2];
  const doSubmit = process.argv.includes('--submit');
  if (!regNum) { console.log('нужен регистрационный номер отзываемого документа'); return; }

  const { browser, page } = await attach();

  page.on('response', async (res) => {
    const u = res.url();
    if (!/api\/(send|form)/i.test(u)) return;
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch { }
    console.log('  <ОТВЕТ> ' + res.status() + ' ' + u.replace('https://knp.kgd.gov.kz', '') + (body ? '\n     ' + body : ''));
  });

  // --- открываем форму отзыва ---
  await page.goto('https://knp.kgd.gov.kz/document-submit', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const label of ['Нет, спасибо', 'Закрыть']) {
    const b = page.locator('.ant-modal-wrap').getByRole('button', { name: label }).first();
    if (await b.count().catch(() => 0)) await b.click({ timeout: 4000 }).catch(() => {});
  }
  await page.locator('#search-section').fill('отзыв');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  await page.locator('tbody tr td')
    .filter({ hasText: 'Налоговое заявление на отзыв налоговой отчетности' })
    .first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.locator('.ant-modal').getByRole('button', { name: 'ПОДАТЬ' }).first().click({ timeout: 15000 });
  await page.waitForTimeout(8000);
  console.log('[1/4] форма отзыва открыта:', page.url());

  // --- регистрационный номер: остальные поля заполнятся сами ---
  const reg = page.locator('input[placeholder="Введите значение"]:not([disabled])').first();
  await reg.fill(regNum);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(6000);

  const filled = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map((e) => e.value).filter(Boolean));
  console.log('[2/4] номер введён, подтянулось:', JSON.stringify(filled));

  // --- проходим оставшиеся разделы ---
  for (let step = 0; step < 3; step++) {
    const next = page.getByRole('button', { name: 'ДАЛЕЕ' }).first();
    if (!(await next.count())) break;
    await next.click({ timeout: 15000 });
    await page.waitForTimeout(4000);

    // Раздел про способ отзыва и чекбокс ответственности.
    const cb = page.locator('input[type="checkbox"]');
    const cn = await cb.count();
    for (let i = 0; i < cn; i++) {
      if (!(await cb.nth(i).isChecked().catch(() => true))) {
        await cb.nth(i).check({ force: true }).catch(() => {});
      }
    }
    const txt = await page.evaluate(() => document.body.innerText);
    const i = txt.indexOf('Раздел.');
    console.log('  раздел:', txt.slice(i, i + 120).split('\n')[0]);
  }

  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim()).filter(Boolean));
  console.log('[3/4] кнопки:', JSON.stringify(btns.slice(6)));

  const errs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map((e) => e.innerText.trim()).filter(Boolean));
  console.log('     ошибок валидации:', errs.length, errs.slice(0, 5));

  await page.screenshot({ path: path.join(SHOTS, 'recall-ready-' + Date.now() + '.png'), fullPage: true });

  if (!doSubmit) {
    console.log('\n=== ОСТАНОВЛЕНО ПЕРЕД ОТПРАВКОЙ (нет флага --submit) ===');
    await browser.close();
    return;
  }

  // --- формирование, подпись, отправка ---
  const gen = page.getByRole('button', { name: 'СФОРМИРОВАТЬ' }).first();
  if (await gen.count()) {
    await gen.click({ timeout: 20000 });
    await page.waitForTimeout(10000);
    console.log('[4/4] заявление сформировано');
  }

  const send = page.getByRole('button', { name: 'ПОДПИСАТЬ И ОТПРАВИТЬ' }).first();
  if (!(await send.count())) throw new Error('кнопка «ПОДПИСАТЬ И ОТПРАВИТЬ» не появилась');
  await send.click({ timeout: 20000 });
  console.log('     нажато «ПОДПИСАТЬ И ОТПРАВИТЬ», запускаю NCALayer...');
  await page.waitForTimeout(1500);

  const nca = await new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'nca-sign.ps1')], { env: process.env, windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('close', (code) => resolve({ code, out }));
  });
  console.log(nca.out.split('\n').map((s) => '     ' + s.trim()).filter((s) => s.trim()).join('\n'));

  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    const msgs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ant-message-notice-content, .ant-notification-notice'))
        .map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
    if (msgs.length) console.log('     СООБЩЕНИЕ:', JSON.stringify(msgs));
    if (page.url().includes('documents-sent')) break;
  }
  console.log('URL после отправки:', page.url());
  await page.screenshot({ path: path.join(SHOTS, 'recall-sent-' + Date.now() + '.png'), fullPage: true });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
