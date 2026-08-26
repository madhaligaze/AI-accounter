// Полный проход декларации 910.00 по нулям в одной сессии страницы.
// Форма — SPA: любая навигация сбрасывает введённые данные, поэтому все
// шаги идут подряд без goto.
//
// По умолчанию доходит до финального раздела и ОСТАНАВЛИВАЕТСЯ, ничего не
// отправляя. Реальная подача — только с явным флагом --submit.
//
// Использование:
//   node scripts/declare-910.js "1 полугодие" 2026 "Дополнительная" <ОКЭД>
//   node scripts/declare-910.js "1 полугодие" 2026 "Дополнительная" <ОКЭД> --submit
const path = require('path');
const { spawn } = require('child_process');
const { attach } = require('./lib/browser');
const { selectByLabel, readValue } = require('./lib/form');

const SHOTS = path.join(__dirname, '..', 'shots');

async function shot(page, tag) {
  const f = path.join(SHOTS, tag + '-' + Date.now() + '.png');
  await page.screenshot({ path: f, fullPage: true }).catch(() => {});
  return f;
}

async function zeros(page) {
  const inputs = page.locator('input[placeholder="Введите значение"]:not([disabled])');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    if (!(await el.isEditable().catch(() => false))) continue;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.fill('0').catch(() => {});
    await page.waitForTimeout(120);
  }
  return n;
}

async function next(page) {
  await page.getByRole('button', { name: 'ДАЛЕЕ' }).first().click({ timeout: 20000 });
  await page.waitForTimeout(4000);
}

(async () => {
  const half = process.argv[2] || '1 полугодие';
  const year = process.argv[3] || '2026';
  const vid = process.argv[4] || 'Дополнительная';
  const oked = process.argv[5] || process.env.KNP_OKED;
  const doSubmit = process.argv.includes('--submit');
  const OGD = process.env.KNP_OGD || '6010';

  const { browser, page } = await attach();

  // Ответы бэкенда на этапе отправки — единственный надёжный источник
  // причины отказа: интерфейс может молча увести на список документов.
  page.on('response', async (res) => {
    const u = res.url();
    if (!/api|sign|send|submit|declaration|document/i.test(u)) return;
    if (res.request().method() === 'GET' && res.status() < 400) return;
    let body = '';
    try { body = (await res.text()).slice(0, 500); } catch { }
    console.log('  <НЕТ> ' + res.status() + ' ' + u.replace('https://knp.kgd.gov.kz', '') + (body ? '\n     ' + body : ''));
  });

  // --- каталог форм ---
  await page.goto('https://knp.kgd.gov.kz/document-submit', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const label of ['Нет, спасибо', 'Закрыть']) {
    const b = page.locator('.ant-modal-wrap').getByRole('button', { name: label }).first();
    if (await b.count().catch(() => 0)) await b.click({ timeout: 4000 }).catch(() => {});
  }
  await page.locator('#search-section').fill('910');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  await page.locator('tbody tr td').filter({ hasText: /^\s*910\.00\s/ }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);

  // --- период ---
  await page.locator('.ant-modal .ant-select').first().click();
  await page.waitForTimeout(800);
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
    .filter({ hasText: half }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.ant-modal input[placeholder="Выберите дату"]').first().click();
  await page.waitForTimeout(1200);
  await page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell-inner')
    .filter({ hasText: new RegExp('^' + year + '$') }).first().click();
  await page.waitForTimeout(1000);
  await page.locator('.ant-modal').getByRole('button', { name: 'ПОДАТЬ' }).first().click({ timeout: 15000 });
  await page.waitForTimeout(8000);
  console.log('[1/5] редактор открыт:', page.url(), '|', half, year);

  // --- раздел 1: общая информация ---
  await selectByLabel(page, 'Вид декларации', vid);
  await selectByLabel(page, 'Отдельная категория', 'не ведет бухгалтерский учет');
  await selectByLabel(page, 'Признак резиденства', 'Резидент РК');

  const actHandle = await page.evaluateHandle(() => {
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
  const actEl = actHandle.asElement();
  if (!actEl) throw new Error('поле вида деятельности не найдено');
  await actEl.scrollIntoViewIfNeeded();
  await actEl.click();
  await page.waitForTimeout(800);
  await page.keyboard.type(oked, { delay: 90 });
  await page.waitForTimeout(1800);
  const opt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
    .filter({ hasText: oked }).first();
  if (await opt.count()) await opt.click({ timeout: 8000 });
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  console.log('[2/5] раздел 1:', vid, '|', await readValue(page, 'Признак резиденства'), '| ОКЭД', oked);
  await next(page);

  // --- раздел 2: исчисленные налоги ---
  const n2 = await zeros(page);
  console.log('[3/5] раздел 2: обнулено полей', n2);
  await next(page);

  // --- раздел 3: социальные платежи ---
  const n3 = await zeros(page);
  console.log('[4/5] раздел 3: обнулено полей', n3);
  await next(page);

  // --- раздел 4: ответственность налогоплательщика ---
  // Код ОГД по месту нахождения: по регистрационным данным это 6010
  // (УГД по Алатаускому району — место нахождения ИП).
  const ogdHandle = await page.evaluateHandle(() => {
    for (const el of Array.from(document.querySelectorAll('.ant-select'))) {
      let n = el;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        if (!n) break;
        const lab = n.querySelector('label, .ant-form-item-label');
        if (lab && lab.innerText.includes('по месту нахождения')) return el;
      }
    }
    return null;
  });
  const ogdEl = ogdHandle.asElement();
  if (ogdEl) {
    await ogdEl.scrollIntoViewIfNeeded();
    await ogdEl.click();
    await page.waitForTimeout(800);
    await page.keyboard.type(OGD, { delay: 90 });
    await page.waitForTimeout(1600);
    const o = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: OGD }).first();
    if (await o.count()) await o.click({ timeout: 8000 });
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    console.log('  код ОГД по месту нахождения:', OGD);
  }

  // Чекбокс об ответственности за достоверность сведений — обязателен.
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.count()) {
    if (!(await cb.isChecked().catch(() => false))) {
      await cb.scrollIntoViewIfNeeded().catch(() => {});
      await cb.check({ force: true }).catch(async () => {
        await page.locator('.ant-checkbox').first().click({ timeout: 8000 });
      });
    }
    console.log('  чекбокс ответственности:', await cb.isChecked().catch(() => '?'));
  }
  await page.waitForTimeout(1200);

  const txt = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n'));
  const tail = txt.slice(txt.indexOf('Раздел. Ответственность'));
  console.log('[5/5] финальный раздел:\n' + tail.slice(0, 1500));

  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim()).filter(Boolean)
  );
  console.log('\nкнопки на экране:', JSON.stringify(buttons));
  console.log('скриншот:', await shot(page, 'final'));

  const errs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map((e) => e.innerText.trim()).filter(Boolean)
  );
  console.log('ошибок валидации:', errs.length, errs.slice(0, 5));

  if (!doSubmit) {
    console.log('\n=== ОСТАНОВЛЕНО ПЕРЕД ОТПРАВКОЙ (нет флага --submit) ===');
    console.log('Декларация заполнена, но НЕ подписана и НЕ подана.');
    await browser.close();
    return;
  }

  // --- формирование печатной формы ---
  await page.getByRole('button', { name: 'СФОРМИРОВАТЬ' }).first().click({ timeout: 20000 });
  await page.waitForTimeout(10000);
  console.log('[6/7] документ сформирован');

  // --- подпись и отправка ---
  // Запрос в NCALayer живёт недолго, поэтому драйвер диалога запускается
  // сразу после клика, без промежуточных шагов.
  const sendBtn = page.getByRole('button', { name: 'ПОДПИСАТЬ И ОТПРАВИТЬ' }).first();
  if (!(await sendBtn.count())) throw new Error('кнопка «ПОДПИСАТЬ И ОТПРАВИТЬ» не появилась');
  await sendBtn.click({ timeout: 20000 });
  console.log('[7/7] нажато «ПОДПИСАТЬ И ОТПРАВИТЬ», запускаю NCALayer...');
  await page.waitForTimeout(1500);

  const nca = await new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'nca-sign.ps1')], { env: process.env, windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('close', (code) => resolve({ code, out }));
  });
  console.log(nca.out.split('\n').map((s) => '   ' + s.trim()).filter((s) => s.trim()).join('\n'));

  // Следим за всплывающими сообщениями: отказ КНП показывает именно так,
  // после чего интерфейс всё равно уходит на список документов.
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    const msgs = await page.evaluate(() => {
      const pick = (sel) => Array.from(document.querySelectorAll(sel))
        .map((e) => e.innerText.trim()).filter(Boolean);
      return [].concat(
        pick('.ant-message-notice-content'),
        pick('.ant-notification-notice'),
        Array.from(document.querySelectorAll('.ant-modal-wrap'))
          .filter((m) => getComputedStyle(m).display !== 'none')
          .map((m) => m.innerText.trim().slice(0, 600))
      );
    }).catch(() => []);
    if (msgs.length) console.log('  СООБЩЕНИЕ:', JSON.stringify(msgs));
    if (page.url().includes('documents-sent')) { console.log('  -> ушли на список документов'); break; }
  }

  console.log('URL после отправки:', page.url());
  console.log('скриншот:', await shot(page, 'submitted'));
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
