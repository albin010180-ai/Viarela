// Viarela | Monero bridge
// Watches monero-wallet-rpc (view-only wallet) and credits XMR invoices.
// Runs locally on the wallet machine (Windows/VPS). Never holds spend keys.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadConfig() {
  const path = process.env.XMR_BRIDGE_CONFIG || join(__dirname, 'config.json');
  if (!existsSync(path)) {
    console.error('[xmr-bridge] config.json bulunamadı. config.example.json kopyalayın.');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return {
    supabaseUrl: process.env.SUPABASE_URL || raw.supabaseUrl || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || raw.supabaseServiceRoleKey || '',
    wallet: {
      rpcUrl: raw.wallet?.rpcUrl || 'http://127.0.0.1:18283',
      username: raw.wallet?.username || '',
      password: raw.wallet?.password || ''
    },
    confirmations: raw.confirmations || 10,
    pollIntervalSec: raw.pollIntervalSec || 300,
    poolTarget: raw.poolTarget || 50,
    poolMin: raw.poolMin || 10,
    explicit: process.argv.includes('--seed') || Boolean(process.env.XMR_BRIDGE_SEED_ONLY)
  };
}

const cfg = loadConfig();

for (const k of ['supabaseUrl', 'supabaseServiceRoleKey']) {
  if (!cfg[k]) {
    console.error(`[xmr-bridge] ${k} boş. config.json / env doldurun.`);
    process.exit(1);
  }
}

const log = (...a) => { const t = new Date().toISOString(); console.log(t, ...a); };
const XMR_DIVISOR = 1e12;

async function rpc(method, params = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'viarela', method, params });
  const r = await fetch(cfg.wallet.rpcUrl, { method: 'POST', headers, body });
  if (!r.ok) throw new Error(`wallet-rpc ${r.status}: ${await r.text()}`);
  const j = await r.json();
  if (j.error) throw new Error(`wallet-rpc ${method} error: ${JSON.stringify(j.error)}`);
  return j.result ?? {};
}

function hdr() {
  return {
    apikey: cfg.supabaseServiceRoleKey,
    Authorization: `Bearer ${cfg.supabaseServiceRoleKey}`,
    'Content-Type': 'application/json'
  };
}

async function sbGet(path) {
  const r = await fetch(cfg.supabaseUrl + path, { headers: hdr() });
  if (!r.ok) throw new Error(`supabase GET ${path} -> ${r.status}`);
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(cfg.supabaseUrl + path, { method: 'PATCH', headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`supabase PATCH ${path} -> ${r.status}`);
  return r.json();
}

async function sbPost(path, body) {
  const r = await fetch(cfg.supabaseUrl + path, { method: 'POST', headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`supabase POST ${path} -> ${r.status}`);
  return r.json();
}

async function seedPool() {
  const rows = await sbGet('/rest/v1/xmr_address_pool?select=address,status');
  const existing = new Set((rows || []).map(r => r.address));
  const unused = (rows || []).filter(r => r.status === 'unused').length;
  const want = cfg.poolTarget - unused;
  if (want <= 0) { log(`[pool] yeterli (${unused} boş)`); return; }
  log(`[pool] ${want} yeni subaddress üretiliyor…`);
  let res;
  try {
    res = await rpc('create_address', { account_index: 0, count: want, label: 'viarela-pool' });
  } catch (e) {
    log(`[pool] create_address BAŞARISIZ (wallet çalışmıyor olabilir): ${e.message}`);
    return;
  }
  let added = 0;
  for (const a of (res.addresses || [])) {
    if (existing.has(a.address)) continue;
    try {
      await sbPost('/rest/v1/xmr_address_pool', {
        address: a.address,
        subaddress_index: a.address_index,
        status: 'unused'
      });
      added++;
    } catch (e) {
      log(`[pool] kayıt hatası ${a.address}: ${e.message}`);
    }
  }
  log(`[pool] ${added} adres eklendi (toplam boş: ${unused + added})`);
}

async function expireOld() {
  const now = new Date().toISOString();
  const rows = await sbGet(`/rest/v1/xmr_invoices?status=eq.pending&expires_at=lt.${now}&select=id`);
  for (const r of rows || []) {
    await sbPatch(`/rest/v1/xmr_invoices?id=eq.${r.id}`, { status: 'expired' }).catch(() => {});
  }
  if (rows?.length) log(`[expire] ${rows.length} fatura süresi doldu`);
}

async function scanIncoming() {
  let res;
  try {
    res = await rpc('get_transfers', { in: true, pending: true, pool: true, filter_by_height: false });
  } catch (e) {
    log(`[scan] get_transfers BAŞARISIZ: ${e.message}`);
    return;
  }
  const entries = [...(res.in || []), ...(res.pending || [])];
  for (const e of entries) {
    if (e.subaddr_index?.major !== 0) continue;
    const idx = e.subaddr_index.major === 0 ? e.subaddr_index.minor : -1;
    if (idx < 0) continue;
    const amountXmr = Number(e.amount) / XMR_DIVISOR;
    const conf = Number(e.confirmations ?? 0);

    const invs = await sbGet(`/rest/v1/xmr_invoices?subaddress_index=eq.${idx}&or=(status.eq.pending,status.eq.partial)&select=id,amount_xmr,status,confirmations,channel`);
    for (const inv of invs || []) {
      const expected = Number(inv.amount_xmr);
      const within = Math.abs(amountXmr - expected) / expected <= 0.02;
      const arrivedEnough = within || amountXmr >= expected;
      const nextStatus = arrivedEnough ? undefined : 'partial';
      const patch = { confirmations: conf, received_amount_xmr: amountXmr, tx_hash: e.txid };
      if (nextStatus) patch.status = nextStatus;

      if (conf >= cfg.confirmations) {
        patch.status = 'credited';
        await sbPatch(`/rest/v1/xmr_invoices?id=eq.${inv.id}`, patch).catch(e => log(`[credit] patch hata: ${e.message}`));
        await sbPost('/rest/v1/xmr_payments', {
          invoice_id: inv.id, tx_hash: e.txid, amount_xmr: amountXmr, confirmations: conf
        }).catch(() => {}); // unique(row) sağlar, tekrar olursa sessiz geç
        log(`[credit] FATURA ${idx} -> ${amountXmr} XMR onaylandı (tx ${String(e.txid).slice(0, 8)}…)`);
      } else if (patch.status === 'partial') {
        await sbPatch(`/rest/v1/xmr_invoices?id=eq.${inv.id}`, patch).catch(() => {});
        log(`[warn] FATURA ${idx}: beklenen ${expected} XMR, gelen ${amountXmr} XMR -> partial`);
      } else {
        // only bump confirmations occasionally to avoid write spam
        if (conf !== Number(inv.confirmations)) {
          await sbPatch(`/rest/v1/xmr_invoices?id=eq.${inv.id}`, patch).catch(() => {});
          if (conf % 5 === 0) log(`[scan] fatura ${idx}: ${conf}/${cfg.confirmations} onay`);
        }
      }
    }
  }
}

async function tick() {
  try {
    await expireOld();
    await scanIncoming();
    await seedPool();
  } catch (e) {
    log(`[tick] hata: ${e.message}`);
  }
}

const initial = Date.now() + 3000;
setTimeout(async () => {
  await tick();
  if (cfg.explicit) { log('[xmr-bridge] seed-only modu tamamlandı.'); process.exit(0); }
  setInterval(tick, cfg.pollIntervalSec * 1000);
  log(`[xmr-bridge] çalışıyor — her ${cfg.pollIntervalSec}s. RPC: ${cfg.wallet.rpcUrl}`);
}, Math.max(0, initial - Date.now()));

process.on('SIGINT', () => { log('kapatılıyor'); process.exit(0); });
process.on('SIGTERM', () => { log('kapatılıyor'); process.exit(0); });