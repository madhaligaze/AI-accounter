// Раскрывает в профиле блок «Свидетельство о государственной регистрации, ОКЭД»
// и печатает его содержимое. Работает в отдельной вкладке — форма не теряется.
const { attach } = require('./lib/browser');

(async () => {
  const { browser, ctx } = await attach();
  const p = await ctx.newPage();
  await p.goto('https://knp.kgd.gov.kz/profile', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);

  const header = p.getByText('Свидетельство о государственной регистрации, ОКЭД').first();
  if (await header.count()) {
    await header.click({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(2500);
  }

  const txt = await p.evaluate(() => {
    const idx = document.body.innerText.indexOf('ОКЭД');
    return document.body.innerText.slice(Math.max(0, idx - 200), idx + 2500);
  });
  console.log(txt);
  await p.close();
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
