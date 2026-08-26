// Открывает «Мои документы» в отдельной вкладке (чтобы не потерять
// заполняемую форму) и показывает разметку строк — ищем, чем открывается
// поданный документ на просмотр.
const { attach } = require('./lib/browser');

(async () => {
  const needle = process.argv[2];
  if (!needle) { console.log('использование: node scripts/peek-sent.js <регистрационный-номер>'); return; }

  const { browser, ctx } = await attach();
  const p = await ctx.newPage();
  await p.goto('https://knp.kgd.gov.kz/documents-sent', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);

  const info = await p.evaluate((num) => {
    const row = Array.from(document.querySelectorAll('tbody tr')).find((r) => r.innerText.includes(num));
    if (!row) return { found: false };
    return {
      found: true,
      links: Array.from(row.querySelectorAll('a')).map((a) => ({ t: a.innerText.trim(), href: a.getAttribute('href') })),
      buttons: Array.from(row.querySelectorAll('button')).map((b) => b.getAttribute('class')),
      svgs: row.querySelectorAll('svg').length,
      html: row.innerHTML.slice(0, 1500),
    };
  }, needle);
  console.log(JSON.stringify(info, null, 1));
  await p.close();
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
