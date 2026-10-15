// Полный вход в кабинет налогоплательщика через ЭЦП.
// Схема: клик по «Выбрать ЭЦП» -> сайт шлёт запрос в NCALayer по wss://127.0.0.1:13579
// -> открывается нативный диалог -> его проходит nca-sign.ps1 -> подпись
// возвращается на сайт -> редирект в кабинет.
const path = require('path');
const { spawn } = require('child_process');
const { attach } = require('./lib/browser');

const PS = path.join(__dirname, 'nca-sign.ps1');

function driveNcaDialog() {
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', PS], {
      env: process.env,
      windowsHide: true,
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write('[NCA] ' + d); });
    p.stderr.on('data', (d) => process.stdout.write('[NCA:err] ' + d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

(async () => {
  const { browser, page } = await attach();

  let signResult = null;
  page.on('websocket', (ws) => {
    if (!ws.url().includes('13579')) return;
    ws.on('framereceived', (f) => {
      const s = String(f.payload);
      if (s.includes('"body"') || s.includes('signature') || s.includes('status')) {
        signResult = s.slice(0, 400);
      }
    });
  });

  if (!page.url().includes('/signin')) {
    await page.goto('https://knp.kgd.gov.kz/signin', { waitUntil: 'domcontentloaded' });
  }

  // Сайт периодически показывает баннер опроса поверх формы входа —
  // он перехватывает клики, поэтому закрываем его первым.
  for (const label of ['Нет, спасибо', 'Закрыть']) {
    const b = page.locator('.ant-modal-wrap').getByRole('button', { name: label }).first();
    if (await b.count().catch(() => 0)) {
      await b.click({ timeout: 5000 }).then(() => console.log('закрыт попап:', label)).catch(() => {});
    }
  }
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Выбрать ЭЦП' }).first().click({ timeout: 20000 });
  console.log('клик по «Выбрать ЭЦП»');

  await page.waitForTimeout(1500);
  const r = await driveNcaDialog();
  console.log('драйвер NCALayer завершился, код', r.code);

  // Ждём ухода со страницы входа — это признак успешной авторизации.
  // Запрос авторизации (user-by-eds) сайт шлёт не сразу, а примерно через
  // 45 секунд после подписи, поэтому ждём с запасом.
  try {
    await page.waitForURL((u) => !u.toString().includes('/signin'), { timeout: 120000 });
    console.log('УСПЕХ: вход выполнен ->', page.url());
  } catch {
    console.log('вход не подтверждён, URL:', page.url());
  }
  if (signResult) console.log('ответ подписи:', signResult);

  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
