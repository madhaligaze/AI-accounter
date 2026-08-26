// Подписывает сформированный документ ЭЦП и отправляет его в КНП.
// Тот же механизм, что и на входе: сайт шлёт запрос в NCALayer,
// нативный диалог проходит nca-sign.ps1.
//
// Это реальное юридически значимое действие — запускается только вручную.
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
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('close', (code) => resolve({ code, out }));
  });
}

(async () => {
  const { browser, page } = await attach();

  const frames = [];
  page.on('websocket', (ws) => {
    if (!ws.url().includes('13579')) return;
    ws.on('framereceived', (f) => frames.push(String(f.payload).slice(0, 200)));
  });

  const btn = page.getByRole('button', { name: 'ПОДПИСАТЬ И ОТПРАВИТЬ' }).first();
  if (!(await btn.count())) {
    console.log('кнопка «ПОДПИСАТЬ И ОТПРАВИТЬ» не найдена — документ не сформирован');
    await browser.close();
    return;
  }
  await btn.click({ timeout: 20000 });
  console.log('нажато: ПОДПИСАТЬ И ОТПРАВИТЬ');
  await page.waitForTimeout(2000);

  const r = await driveNcaDialog();
  console.log('NCALayer:', r.out.trim().split('\n').map((s) => '  ' + s.trim()).join('\n'));

  await page.waitForTimeout(12000);
  console.log('URL:', page.url());

  const txt = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n'));
  const i = txt.indexOf('Раздел. Ответственность');
  console.log('--- СОСТОЯНИЕ ---\n' + txt.slice(i, i + 900));

  const modal = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-modal-wrap'))
      .filter((m) => getComputedStyle(m).display !== 'none')
      .map((m) => m.innerText.trim().slice(0, 600))
  );
  if (modal.length) console.log('--- МОДАЛКА ---\n' + modal.join('\n'));

  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'sent-' + Date.now() + '.png'), fullPage: true });
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
