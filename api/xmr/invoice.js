import { PACKAGES, SAFETY_PCT, VALIDITY_MIN, xmrEurRate, supabaseJson, requireEnv, randomInvoiceNo } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body || {};
  const packageId = String(b.package_id || '').trim();
  if (!PACKAGES[packageId]) return res.status(400).json({ error: 'Unknown package' });

  let cfg;
  try {
    cfg = requireEnv();
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }

  let eurPerXmr;
  try {
    eurPerXmr = await xmrEurRate();
  } catch (e) {
    return res.status(502).json({ error: 'Rate unavailable, please retry' });
  }

  const amountEur = PACKAGES[packageId];
  const amountXmr = Math.round((amountEur * (1 + SAFETY_PCT / 100) / eurPerXmr) * 1000000) / 1000000;

  // Atomically pop one unused subaddress from the pool (RPC in schema-xmr.sql)
  let popped;
  try {
    const r = await supabaseJson(cfg.url, '/rest/v1/rpc/pop_xmr_address', {
      method: 'POST', key: cfg.key, headers: { Prefer: 'return=representation' }, body: '{}'
    });
    if (!r.ok) throw new Error('pool_pop_failed');
    const rows = await r.json();
    popped = rows && rows[0];
  } catch (e) {
    return res.status(409).json({
      error: 'NO_ADDRESS_AVAILABLE',
      message: 'Monero address pool is empty. Owner must run xmr-bridge on the wallet machine to seed addresses.'
    });
  }
  if (!popped) return res.status(409).json({ error: 'NO_ADDRESS_AVAILABLE', message: 'Address pool empty.' });

  const expiresAt = new Date(Date.now() + VALIDITY_MIN * 60000).toISOString();

  // Insert invoice (unique invoice_no against pool conflicts)
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNo = randomInvoiceNo();
    const ins = await supabaseJson(cfg.url, '/rest/v1/xmr_invoices', {
      method: 'POST', key: cfg.key,
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        invoice_no: invoiceNo,
        address: popped.address,
        subaddress_index: popped.subaddress_index,
        amount_eur: amountEur,
        amount_xmr: amountXmr,
        fx_rate: eurPerXmr,
        safety_pct: SAFETY_PCT,
        package_id: packageId,
        stage: 'full',
        expires_at: expiresAt
      })
    });
    if (ins.ok) {
      const rec = await ins.json();
      const row = rec[0];
      return res.status(201).json({
        id: row.id,
        invoice_no: row.invoice_no,
        address: row.address,
        subaddress_index: row.subaddress_index,
        amount_eur: Number(row.amount_eur),
        amount_xmr: Number(row.amount_xmr),
        fx_rate: Number(row.fx_rate),
        expires_at: row.expires_at,
        qr: `monero:${row.address}?tx_amount=${Number(row.amount_xmr)}&tx_description=${encodeURIComponent(invoiceNo)}`
      });
    }
    // retry on unique invoice_no collision
    if (ins.status !== 409) {
      return res.status(502).json({ error: 'Invoice storage failed' });
    }
  }
  return res.status(502).json({ error: 'Invoice storage failed' });
}