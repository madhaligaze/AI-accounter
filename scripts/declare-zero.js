// Нулевые декларации юрлица на общеустановленном режиме: 200.00 и 100.00.
// Несколько периодов за один запуск, каждая форма — отдельной вкладкой.
//
// Что выяснилось на реальном кабинете (схема ниже прошла проверку и приём ОГД):
//   - суммы оставляем ПУСТЫМИ: ноль форма считает введёнными данными
//     и начинает требовать приложения;
//   - 200.00: численность работников 0/0/0, «в том числе иностранцев» — пусто,
//     в «Представленные приложения» (tree-select) выбрать 200.01 — без него
//     проверка не проходит, а пустое приложение данных не добавляет;
//   - 100.00: приложения не выбираются;
//   - вид декларации «Очередная», резидент РК, во всех полях кода ОГД — свой ОГД.
//
// По умолчанию каждая форма заполняется, проверяется («ПРОВЕРИТЬ ОШИБКИ»)
// и закрывается БЕЗ отправки. Реальная подача — только с флагом --submit.
// При любой ошибке пакет останавливается, чтобы не наделать дублей.
//
// Использование:
//   node scripts/declare-zero.js "200:4 квартал:2023" "100:-:2023"
//   node scripts/declare-zero.js "200:4 квартал:2023" "100:-:2023" --submit
// Нужны ECP_PASSWORD, ECP_KEY_PATH (для подписи) и KNP_OGD.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { CDP } = require('./lib/browser');
const { selectByLabel, readValue } = require('./lib/form');

const SHOTS = path.join(__dirname, '..', 'shots');
const PS = path.join(__dirname, 'nca-sign.ps1');

async function closePopups(page) {
  for (const label of ['Нет, спасибо', 'Закрыть']) {
    const b = page.locator('.ant-modal-wrap').getByRole('button', { name: label }).first();
    if (await b.count().catch(() => 0)) await b.click({ timeout: 3000 }).catch(() => {});
  }
}

async function openForm(page, form, opt, year) {
  await page.goto('https://knp.kgd.gov.kz/document-submit', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await closePopups(page);
  // Каталог фильтруется на клиенте по загруженному списку; если сессия истекла,
  // список пуст и поиск молча ничего не находит.
  const loggedIn = await page.evaluate(() => !!document.querySelector('a[href="/profile"]'));
  if (!loggedIn) throw new Error('сессия кабинета истекла — выполните scripts/login.js');
  const code = form + '.00';
  const row = page.locator('tbody tr td').filter({ hasText: new RegExp('^\\s*' + form + '\\.00\\s') }).first();
  await page.locator('#search-section').fill(code);
  await page.keyboard.press('Enter');
  await row.waitFor({ timeout: 15000 });
  await row.click();
  await page.waitForTimeout(2500);
  if (opt && opt !== '-') {
    await page.locator('.ant-modal .ant-select').first().click();
    await page.waitForTimeout(800);
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: opt }).first().click();
    await page.waitForTimeout(800);
  }
  await page.locator('.ant-modal input[placeholder="Выберите дату"]').first().click();
  await page.waitForTimeout(1200);
  await page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) td.ant-picker-cell-in-view')
    .filter({ hasText: new RegExp('^' + year + '$') }).first().click();
  await page.waitForTimeout(3500);
  // Кнопка остаётся заблокированной, если форма не положена налогоплательщику
  // за этот период (например, 910.00 при общеустановленном режиме).
  const podat = page.locator('.ant-modal').getByRole('button', { name: 'ПОДАТЬ' }).first();
  if (await podat.isDisabled()) throw new Error(`ПОДАТЬ заблокирована для ${code} ${opt} ${year}`);
  await podat.click();
  await page.waitForTimeout(9000);
}

// Переход к разделу по боковой навигации. Курсор после клика уводим:
// при наведении панель шагов раскрывается и перекрывает поля формы.
async function gotoStep(page, which) {
  const steps = page.locator('.ant-steps-item');
  await (which === 'last' ? steps.last() : steps.nth(which)).click();
  await page.mouse.move(1100, 450);
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

// Клик с прокруткой элемента в центр — иначе его закрывает фиксированная шапка.
async function centerClick(page, el) {
  await page.mouse.move(1100, 450);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await el.click();
}

async function selectTreeByLabel(page, labelPart, optionText) {
  const el = (await page.evaluateHandle((needle) => {
    for (const s of document.querySelectorAll('.ant-select')) {
      let n = s;
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement;
        const l = n && n.querySelector('label');
        if (l && l.innerText.includes(needle)) return s;
      }
    }
    return null;
  }, labelPart)).asElement();
  if (!el) throw new Error('не найден селект: ' + labelPart);
  await centerClick(page, el);
  await page.waitForTimeout(1200);
  const dd = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await dd.locator('.ant-select-tree-node-content-wrapper, .ant-select-tree-title')
    .filter({ hasText: optionText }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  return (await el.innerText()).replace(/\s+/g, ' ');
}

// Поля кода ОГД в разделе ответственности идут парами «код / наименование»:
// заполняем селект кода в каждой паре, где ещё не стоит нужный ОГД.
async function fillAllOgd(page, code) {
  for (let pass = 0; pass < 6; pass++) {
    const next = await page.evaluate((c) => {
      const sels = Array.from(document.querySelectorAll('.ant-select')).filter((s) => s.getBoundingClientRect().width > 0);
      const labelOf = (s) => {
        let n = s;
        for (let i = 0; i < 6 && n; i++) {
          n = n.parentElement;
          const l = n && n.querySelector('label, .ant-form-item-label');
          if (l && l.innerText.trim()) return l.innerText;
        }
        return '';
      };
      const groups = new Map();
      sels.forEach((s, i) => {
        const lab = labelOf(s);
        if (/органа государственных доходов|Код ОГД/i.test(lab) && !groups.has(lab)) groups.set(lab, i);
      });
      for (const [, i] of groups) if (!sels[i].innerText.includes(c)) return { i };
      return { done: groups.size };
    }, code);
    if (next.done !== undefined) return next.done;
    const handle = await page.locator('.ant-select').filter({ visible: true }).nth(next.i).elementHandle();
    await centerClick(page, handle);
    await page.waitForTimeout(800);
    await page.keyboard.type(code, { delay: 90 });
    await page.waitForTimeout(1800);
    const o = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: code }).first();
    if (await o.count()) await o.click({ timeout: 8000 });
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
  }
  throw new Error('не удалось проставить код ОГД');
}

async function fullCheck(page) {
  await page.getByRole('button', { name: 'ПРОВЕРИТЬ ОШИБКИ' }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  const err = await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('.ant-modal-wrap'))
      .find((w) => getComputedStyle(w).display !== 'none' && /Список ошибок/.test(w.innerText));
    return m ? m.innerText.trim().replace(/\n/g, ' | ') : '';
  });
  const close = page.locator('.ant-modal-wrap').getByRole('button', { name: 'Закрыть' }).first();
  if (await close.count().catch(() => 0)) await close.click().catch(() => {});
  await page.waitForTimeout(600);
  return err;
}

// Страховка от случайных данных: во всех разделах суммы пусты
// (ноль допустим только в численности работников).
async function nonEmptySums(page) {
  const steps = await page.locator('.ant-steps-item').count();
  let bad = [];
  for (let i = 0; i < steps; i++) {
    await gotoStep(page, i);
    const vals = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[placeholder="Введите значение"]')).map((e) => e.value));
    bad = bad.concat(vals.filter((v) => v !== '' && v !== '0'));
  }
  return bad;
}

async function signAndSend(page) {
  let fnoId = null;
  const onResp = async (res) => {
    if (/form-fno-\d+$/.test(res.url())) { try { fnoId = (await res.text()).trim(); } catch { } }
  };
  page.on('response', onResp);
  const formBtn = page.getByRole('button', { name: 'СФОРМИРОВАТЬ' }).first();
  if (await formBtn.isDisabled()) throw new Error('«СФОРМИРОВАТЬ» заблокирована');
  await formBtn.click();
  await page.waitForTimeout(10000);
  const sendBtn = page.getByRole('button', { name: 'ПОДПИСАТЬ И ОТПРАВИТЬ' }).first();
  if (!(await sendBtn.count())) throw new Error('нет кнопки «ПОДПИСАТЬ И ОТПРАВИТЬ»');
  await sendBtn.click({ timeout: 20000 });
  // Запрос в NCALayer живёт недолго — драйвер диалога запускаем сразу.
  await page.waitForTimeout(1500);
  const nca = await new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', PS], { env: process.env, windowsHide: true });
    p.on('close', (code) => resolve(code));
  });
  const msgs = new Set();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    const m = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ant-message-notice-content, .ant-notification-notice, .ant-modal-wrap'))
        .filter((x) => getComputedStyle(x).display !== 'none' && x.innerText.trim())
        .map((x) => x.innerText.trim().slice(0, 300))).catch(() => []);
    m.forEach((x) => msgs.add(x));
    if (page.url().includes('documents-sent')) break;
  }
  page.off('response', onResp);
  return { nca, fnoId, msgs: [...msgs] };
}

async function fillSection1(page, form) {
  await selectByLabel(page, 'Вид декларации', 'Очередная');
  // В 200.00 подпись «Признак резиденства», в 100.00 — «резидентства».
  await selectByLabel(page, 'Признак резиден', 'Резидент РК');
  let extra = '';
  if (form === '200') {
    const inputs = page.locator('input[placeholder="Введите значение"]:not([disabled])');
    const n = await inputs.count();
    for (let i = 0; i < n; i++) await inputs.nth(i).fill(i < 3 ? '0' : '');
    extra = ' | приложение: ' + (await selectTreeByLabel(page, 'Представленные приложения', '200.01')).slice(0, 40);
  }
  return `вид: ${await readValue(page, 'Вид декларации')} | резидентство: ${(await readValue(page, 'Признак резиден')).replace(/\s+/g, ' ')}${extra}`;
}

(async () => {
  const args = process.argv.slice(2);
  const doSubmit = args.includes('--submit');
  const ogd = process.env.KNP_OGD;
  if (!ogd) { console.error('ERR: не задан KNP_OGD (код ОГД по месту нахождения)'); process.exit(1); }
  const jobs = args.filter((a) => a.split(':').length === 3).map((a) => a.split(':'));
  if (!jobs.length) { console.error('ERR: не заданы периоды, например "200:4 квартал:2023" "100:-:2023"'); process.exit(1); }

  fs.mkdirSync(SHOTS, { recursive: true });
  // Подключаемся по CDP и в конце только выходим: браузер общий и должен жить дальше.
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const results = [];

  for (const [form, opt, year] of jobs) {
    for (const p of ctx.pages()) if (/document-submit\/\d/.test(p.url())) await p.close().catch(() => {});
    const page = await ctx.newPage();
    const tag = `${form}.00 ${opt === '-' ? '' : opt + ' '}${year}`;
    const slug = `${form}-${opt.replace(/\s+/g, '')}-${year}`;
    try {
      await openForm(page, form, opt, year);
      console.log(`[${tag}] ${await fillSection1(page, form)}`);
      await gotoStep(page, 'last');
      const ogdFields = await fillAllOgd(page, ogd);
      const cb = page.locator('input[type="checkbox"]:not([disabled])').last();
      if (!(await cb.isChecked().catch(() => false))) await cb.check({ force: true }).catch(() => {});
      console.log(`[${tag}] полей ОГД: ${ogdFields} (= ${ogd}) | ответственность: ${await cb.isChecked().catch(() => '?')}`);
      const bad = await nonEmptySums(page);
      if (bad.length) throw new Error('непустые суммы: ' + bad.join(','));
      const err = await fullCheck(page);
      if (err) throw new Error('проверка формы: ' + err);
      await gotoStep(page, 'last');
      if (!doSubmit) {
        await page.screenshot({ path: path.join(SHOTS, `dry-${slug}.png`), fullPage: true }).catch(() => {});
        console.log(`[${tag}] проверка без ошибок — НЕ отправлено (нет флага --submit)`);
        results.push({ tag, status: 'dry-ok' });
        await page.close();
        continue;
      }
      const r = await signAndSend(page);
      console.log(`[${tag}] отправлено: fnoId=${r.fnoId} | NCALayer=${r.nca} | ${r.msgs.join(' / ')}`);
      results.push({ tag, status: r.msgs.some((m) => /отправлен/i.test(m)) ? 'sent' : 'unclear', fnoId: r.fnoId });
      await page.close().catch(() => {});
    } catch (e) {
      const msg = e.message.split('\n')[0];
      console.log(`[${tag}] ОШИБКА: ${msg}`);
      await page.screenshot({ path: path.join(SHOTS, `fail-${slug}.png`), fullPage: true }).catch(() => {});
      results.push({ tag, status: 'error', error: msg });
      break;
    }
  }
  console.log('\nИТОГ:\n' + results.map((r) => `  ${r.tag}: ${r.status}${r.fnoId ? ' #' + r.fnoId : ''}${r.error ? ' — ' + r.error : ''}`).join('\n'));
  if (doSubmit) console.log('Статус приёма («Принят» / «Не принят») смотрите в «Мои документы».');
  process.exit(results.some((r) => r.status === 'error') ? 1 : 0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
