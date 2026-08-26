// Прощупываем локальный NCALayer: какие модули/методы он принимает и
// требует ли GUI-диалог, если передать путь к хранилищу и пароль явно.
const WebSocket = require('ws');

const URL = 'wss://127.0.0.1:13579';
const P12 = process.env.ECP_KEY_PATH;
const PASS = process.env.ECP_PASSWORD;

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { rejectUnauthorized: false });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function call(ws, payload, label, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ label, result: '<<TIMEOUT — вероятно ждёт GUI>>' }), timeoutMs);
    const onMsg = (data) => {
      clearTimeout(t);
      ws.off('message', onMsg);
      resolve({ label, result: data.toString().slice(0, 1500) });
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify(payload));
  });
}

(async () => {
  const ws = await connect();
  console.log('connected to', URL);

  const probes = [
    ['version', { module: 'kz.gov.pki.knca.commonUtils', method: 'getApiVersion' }],
    ['basics.getKeyInfo(no-gui?)', {
      module: 'kz.gov.pki.knca.basics',
      method: 'getKeyInfo',
      args: { storageType: 'PKCS12', storagePath: P12, password: PASS },
    }],
    ['commonUtils.getKeyInfo', {
      module: 'kz.gov.pki.knca.commonUtils',
      method: 'getKeyInfo',
      args: { alias: 'PKCS12', path: P12, password: PASS },
    }],
  ];

  for (const [label, payload] of probes) {
    const r = await call(ws, payload, label);
    console.log('\n### ' + label + '\n' + r.result);
  }
  ws.close();
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
