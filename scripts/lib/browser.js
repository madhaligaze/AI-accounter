// Общая обвязка: подключаемся к уже запущенному Chromium по CDP.
// Браузер живёт отдельным долгоживущим процессом, чтобы сессия в кабинете
// не терялась между шагами скриптов.
const { chromium } = require('playwright');

const CDP = 'http://127.0.0.1:9222';

async function attach() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => !p.url().startsWith('devtools://')) || (await ctx.newPage());
  return { browser, ctx, page };
}

module.exports = { attach, CDP };
