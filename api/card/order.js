import { PACKAGES, SAFETY_PCT, VALIDITY_MIN, xmrEurRate, supabaseJson, requireEnv, randomInvoiceNo } from '../xmr/_lib.js';
import * as providers from './_providers/index.js';
import { voidInvoice } from './_help.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const p = providers.provider();
  if (!p.configInfo().configured) {
    return res.status(503).json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'Card payments are being activated. Please check back shortly.' });
  }

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
  const surcharge = p.configInfo().surchargePct;
  const fiatAmount = Math.round(amountEur * (1 + surcharge / 100));

  let popped;
  try {
    const r = await supabaseJson(cfg.url, '/rest/v1/rpc/pop_xmr_address', {
      method: 'POST', key: cfg.key, headers: { Prefer: 'return=representation' }, body: '{}'
    });
    if (!r.ok) throw new Error('pool_pop_failed');
    const rows = await r.json();
    popped = rows && rows[0];
  } catch (e) {
    return res.status(503).json({
      error: 'NO_ADDRESS_AVAILABLE',
      message: 'Card payments are being activated on our side. Please check back shortly.'
    });
  }
  if (!popped) return res.status(503).json({ error: 'NO_ADDRESS_AVAILABLE', message: 'Card payments are being activated on our side. Please check back shortly.' });

  const expiresAt = new Date(Date.now() + VALIDITY_MIN * 60000).toISOString();
  const invoiceNo = randomInvoiceNo();

  const ins = await supabaseJson(cfg.url, '/rest/v1/xmr_invoices', {
    method: 'POST', key: cfg.key,
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      invoice_no: invoiceNo,
      address: popped.address,
      subaddress_index: popped.subaddress_index,
      amount_eur: amountEur,
      amount_xmr: Math.round((amountEur * (1 + SAFETY_PCT / 100) / eurPerXmr) * 1000000) / 1000000,
      fx_rate: eurPerXmr,
      safety_pct: SAFETY_PCT,
      package_id: packageId,
      stage: 'full',
      channel: 'card',
      expires_at: expiresAt
    })
  });
  if (!ins.ok) return res.status(502).json({ error: 'Invoice storage failed' });
  const invRow = (await ins.json())[0];

  let created;
  try {
    created = await p.createOrder({ payoutAddress: popped.address, fiatAmount });
  } catch (e) {
    await voidInvoice(cfg, invRow.id);
    if (e.message === 'provider_not_configured') {
      return res.status(503).json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'Card payments are being activated. Please check back shortly.' });
    }
    return res.status(502).json({ error: 'Card provider failed', message: 'Unable to reach the card processor. Please retry in a moment.' });
  }

  const co = await supabaseJson(cfg.url, '/rest/v1/card_orders', {
    method: 'POST', key: cfg.key,
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      invoice_id: invRow.id,
      provider: p.configInfo().provider,
      provider_order_id: created.orderId,
      payment_url: created.paymentUrl,
      fiat_amount: fiatAmount,
      payout_address: popped.address,
      status: 'new'
    })
  });
  if (!co.ok) return res.status(502).json({ error: 'Card order storage failed' });

  return res.status(201).json({
    invoice_id: invRow.id,
    invoice_no: invRow.invoice_no,
    payment_url: created.paymentUrl,
    fiat_amount: fiatAmount,
    surcharge_pct: surcharge,
    estimate_xmr: created.estimateXmr || null,
    fx_rate: eurPerXmr,
    expires_at: expiresAt
  });
}