// Запускает долгоживущий Chromium с открытым CDP-портом и профилем на диске.
// Профиль сохраняется, чтобы не логиниться заново на каждом шаге.
const path = require('path');
const { chromium } = require('playwright');

const PROFILE = path.join(__dirname, '..', '.browser-profile');

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: null,
    ignoreHTTPSErrors: true,
    args: ['--remote-debugging-port=9222', '--start-maximized'],
  });

  // Логируем весь трафик к NCALayer: это и есть протокол подписи, который
  // использует сайт. Нужен, чтобы понять, что именно подписывается.
  await ctx.addInitScript(() => {
    const Orig = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      const ws = protocols ? new Orig(url, protocols) : new Orig(url);
      if (String(url).includes('13579')) {
        const log = (dir, data) => {
          try {
            window.__ncaLog = window.__ncaLog || [];
            window.__ncaLog.push({ dir, t: Date.now(), data: String(data).slice(0, 20000) });
          } catch (e) {}
        };
        const send = ws.send.bind(ws);
        ws.send = (d) => { log('OUT', d); return send(d); };
        ws.addEventListener('message', (e) => log('IN', e.data));
      }
      return ws;
    };
    window.WebSocket.prototype = Orig.prototype;
    Object.assign(window.WebSocket, Orig);
  });

  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://knp.kgd.gov.kz/signin', { waitUntil: 'domcontentloaded' });
  console.log('BROWSER READY on CDP 9222 ::', page.url());

  // держим процесс живым
  await new Promise(() => {});
})();
