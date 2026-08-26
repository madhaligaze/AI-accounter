// Печатает весь перехваченный обмен страницы с NCALayer.
const { attach } = require('./lib/browser');

(async () => {
  const { browser, page } = await attach();
  const log = await page.evaluate(() => window.__ncaLog || []);
  console.log('записей:', log.length);
  log.forEach((m, i) => console.log('\n#' + i, m.dir, new Date(m.t).toISOString(), '\n' + m.data.slice(0, 600)));
  await browser.close();
})();
