// Прямая проверка справочника КНП, который подтягивает данные отзываемой
// отчётности по регистрационному номеру. Запрос идёт из контекста страницы,
// поэтому уходит с рабочей сессией и куками.
const { attach } = require('./lib/browser');

// Номера отзываемых документов передаются аргументами:
//   node scripts/probe-dict.js <номер> [<номер> ...]
const NUMBERS = process.argv.slice(2);

const TAXPAYER = process.env.KNP_TAXPAYER_CODE; // ИИН/БИН
const TYPE = process.env.KNP_TAXPAYER_TYPE || 'IP';

(async () => {
  if (!TAXPAYER) { console.log('задайте KNP_TAXPAYER_CODE (ИИН/БИН)'); return; }
  if (!NUMBERS.length) { console.log('передайте хотя бы один регистрационный номер'); return; }

  const { browser, page } = await attach();

  for (const n of NUMBERS) {
    const res = await page.evaluate(async ({ num, taxpayer, type }) => {
      const url = '/services/isnafno/api/report-dictionary?requestCode=NZ_007_FNO_REG_NUMBER'
        + '&registrationNumber=' + encodeURIComponent(num)
        + '&taxpayerCode=' + encodeURIComponent(taxpayer)
        + '&taxpayerType=' + encodeURIComponent(type);
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        const t = await r.text();
        return { status: r.status, body: t.slice(0, 300) };
      } catch (e) {
        return { status: 'fetch-error', body: String(e) };
      }
    }, { num: n, taxpayer: TAXPAYER, type: TYPE });
    console.log((n || '(пусто)') + ' -> ' + res.status + '\n    ' + res.body.replace(/\s+/g, ' '));
  }
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
