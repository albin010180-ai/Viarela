import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import makeHash from 'keccak';
import { ed25519 } from '@noble/curves/ed25519';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, '..');
const BIN = join(BASE, 'bin', 'monero-wallet-rpc.exe');
const PORT = 18444;
const RESTORE_HEIGHT = 3200000;
const WALLET_NAME = 'viarela-watch';
const DAEMON = process.env.DAEMON || 'http://node.moneroworld.com:18081';
const L = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_INDEX = [...B58].reduce((m, c, i) => (m[c] = i, m), {});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) {
  return new Promise(res => rl.question(q, res));
}

function askSecret(q) {
  return new Promise(res => {
    process.stdout.write(q);
    const orig = rl._writeToOutput;
    rl._writeToOutput = () => {};
    rl.question('', value => {
      rl._writeToOutput = orig;
      res(value);
    });
  });
}

function keccak256(buf) { return makeHash('keccak256').update(buf).digest(); }

function decodeBlock(group) {
  let num = 0n;
  for (const c of group) {
    const d = B58_INDEX[c];
    if (d === undefined) return null;
    num = num * 58n + BigInt(d);
  }
  const bytes = [];
  while (num > 0n) { bytes.unshift(Number(num & 0xffn)); num >>= 8n; }
  return bytes;
}

function decodeMonero(s) {
  const chars = [...s];
  const out = [];
  let i = 0;
  while (i + 11 <= chars.length) {
    const bytes = decodeBlock(chars.slice(i, i + 11));
    if (!bytes) return null;
    while (bytes.length < 8) bytes.unshift(0);
    out.push(...bytes);
    i += 11;
  }
  if (i < chars.length) {
    const bytes = decodeBlock(chars.slice(i));
    if (!bytes) return null;
    if (bytes.length > 5) return null;
    while (bytes.length < 5) bytes.unshift(0);
    out.push(...bytes);
  }
  return Buffer.from(out);
}

function decodeAddress(addr) {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)) return { error: 'Adres geçersiz karakter içeriyor.' };
  const raw = decodeMonero(addr);
  if (!raw) return { error: 'Base58 çözülemedi — kopyalama bozuk olabilir.' };
  if (raw.length !== 69) return { error: `Tutarsız uzunluk (${raw.length}), Monero adresi 95 karakter olmalı.` };
  const checksum = keccak256(raw.slice(0, 65)).slice(0, 4);
  if (!raw.subarray(65).equals(checksum)) return { error: 'Adres checksum uyuşmadı — kopyalama bozuk veya yanlış karakter.' };
  const net = raw[0];
  const kind = net === 18 ? 'birincil' : net === 42 ? 'subaddress' : net === 53 ? 'stagenet' : net === 63 ? 'testnet' : 'bilinmeyen';
  return { ok: true, raw, net, kind, viewPub: Buffer.from(raw.subarray(33, 65)).toString('hex') };
}

function validScalar(hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const n = BigInt('0x' + hex);
  return n > 0n && n < L;
}

function scalarmultBase(hex) {
  return Buffer.from(ed25519.Point.BASE.multiply(BigInt('0x' + hex)).toRawBytes()).toString('hex');
}

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return r.json();
}

console.log('==============================================================');
console.log(' Viarela — view-only cüzdan üretici (monero-wallet-rpc tabanlı)');
console.log(` Node        : ${DAEMON}`);
console.log(` CüzdanAdı   : ${WALLET_NAME}  (klasör: services/monero)`);
console.log('==============================================================');
console.log('');
console.log('Ana (FINAL) cüzdanından YALNIZCA şu ikisi istenir — hiçbir yere yazılmaz:');
console.log('  1) address (BİRİNCİL adres, 4... ile başlar)');
console.log('  2) viewkey (private view key)');
console.log('');

const address = (process.env.VIR_TEST === '1' ? process.env.VIR_ADDR : (await ask('Birincil adres (4...): '))).trim();
const viewkey = (process.env.VIR_TEST === '1' ? process.env.VIR_VIEW : (await askSecret('Private view key: '))).trim();
console.log('');

const check = decodeAddress(address);
if (!check.ok) { console.log(`[X] ${check.error}`); rl.close(); process.exit(1); }
if (check.net !== 18) {
  console.log(`[X] Bu adres bir "${check.kind}" (${address[0]}...). View-only cüzdan BİRİNCİL (4...) adres gerektirir. Amacın subaddress'se önce birincil adresi şuradan al: monero-wallet-cli "address"`); rl.close(); process.exit(1);
}
if (!validScalar(viewkey)) { console.log('[X] viewkey 64 haneli hex bir sayı olmalı.'); rl.close(); process.exit(1); }

const derivedViewPub = scalarmultBase(viewkey);
if (derivedViewPub !== check.viewPub) {
  console.log('[X] viewkey bu adrese AİT DEĞİL.');
  console.log(`    adres  view pub : ${check.viewPub}`);
  console.log(`    viewkey türetti  : ${derivedViewPub}`);
  console.log('    Yanlış cüzdandan mı kopyaladın? (address ile viewkey aynı cüzdandan olmalı)');
  rl.close(); process.exit(1);
}
console.log('[OK] viewkey ↔ adres tutarlı (view pub doğrulandı).');
rl.close();

if (existsSync(join(BASE, `${WALLET_NAME}.keys`))) {
  console.log(`[X] ${WALLET_NAME}.keys zaten var — önce silmeden tekrar üretme (start.local.bat çalışıyorsa önce durdur).`);
  process.exit(1);
}

console.log('Cüzdan parolası belirle (start.local.bat → WALLET_PAROLASI değeri bu olacak).');
const walletPass = process.env.VIR_TEST === '1' ? process.env.VIR_PASS : (await askSecret('Cüzdan parolası: '));
console.log('');

const child = spawn(BIN, [
  '--wallet-dir', BASE,
  '--rpc-bind-port', String(PORT),
  '--daemon-address', DAEMON,
  '--disable-rpc-login',
]);

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try {
    const v = await rpc(`http://127.0.0.1:${PORT}/json_rpc`, 'get_version', {});
    if (v.result) up = true;
  } catch { /* bekle */ }
  if (!up) await new Promise(r => setTimeout(r, 1000));
}
if (!up) {
  console.log('[X] wallet-rpc başlamadı. Log: services/monero/bin/monero-wallet-rpc.log');
  child.kill(); process.exit(1);
}
console.log('[OK] wallet-rpc ayakta, cüzdan oluşturuluyor...');

let resp;
try {
  resp = await rpc(`http://127.0.0.1:${PORT}/json_rpc`, 'generate_from_keys', {
    filename: WALLET_NAME,
    address,
    spendkey: '',
    viewkey,
    restore_height: RESTORE_HEIGHT,
    password: walletPass,
    autosave_current: true,
    subaddress_lookahead: [2, 500],
  });
} catch (e) {
  console.log(`[X] RPC hatası: ${e.message}`);
  child.kill(); process.exit(1);
}
child.kill();

if (!resp.result || !existsSync(join(BASE, `${WALLET_NAME}.keys`))) {
  console.log(`[X] Oluşturulamadı. RPC: ${JSON.stringify(resp.error || resp)}`);
  process.exit(1);
}

console.log('');
console.log('[OK] viarela-watch.keys hazır (view-only).');
console.log('');
console.log('Sonraki adımlar:');
console.log(`  1) start.local.bat içindeki WALLET_PAROLASI = <az önce girdiğin parola>`);
console.log('  2) npm run doctor');
console.log('  3) npm run seed');
console.log('  4) /pay/ üzerinden canlı test');