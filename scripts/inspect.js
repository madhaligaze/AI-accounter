// Снимает состояние текущей страницы: url, заголовок, все кликабельные
// элементы и скриншот. Основной инструмент разведки по сайту.
const path = require('path');
const fs = require('fs');
const { attach } = require('./lib/browser');

const SHOTS = path.join(__dirname, '..', 'shots');

(async () => {
  const { browser, page } = await attach();
  fs.mkdirSync(SHOTS, { recursive: true });

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());

  const els = await page.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    };
    const out = [];
    document.querySelectorAll('a,button,input,select,textarea,[role=button],[onclick]').forEach((e) => {
      if (!vis(e)) return;
      out.push({
        tag: e.tagName.toLowerCase(),
        type: e.getAttribute('type') || '',
        id: e.id || '',
        name: e.getAttribute('name') || '',
        cls: (e.className || '').toString().slice(0, 60),
        text: (e.innerText || e.value || e.placeholder || '').trim().slice(0, 80),
        href: (e.getAttribute('href') || '').slice(0, 100),
      });
    });
    return out;
  });
  console.log('\n--- INTERACTIVE (' + els.length + ') ---');
  els.forEach((e, i) => console.log(i, JSON.stringify(e)));

  const name = 'shot-' + Date.now() + '.png';
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
  console.log('\nSHOT:', path.join(SHOTS, name));

  const nca = await page.evaluate(() => window.__ncaLog || []);
  if (nca.length) {
    console.log('\n--- NCALayer traffic (' + nca.length + ') ---');
    nca.forEach((m) => console.log(m.dir, m.data.slice(0, 800)));
  }
  await browser.close();
})();
