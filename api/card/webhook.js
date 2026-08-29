import { requireEnv, supabaseJson } from '../xmr/_lib.js';
import * as providers from './_providers/index.js';
import { creditInvoice, voidInvoice, getCardOrder, updateCardOrder } from './_help.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let cfg;
  try {
    cfg = requireEnv();
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }

  const b = req.body || {};
  let order = null;
  if (b.invoice_id || b.invoiceId) {
    order = await getCardOrder(cfg, b.invoice_id || b.invoiceId);
  } else {
    const pid = b.id || b.exchangeId || b.exchange_id || b.order_id || b.orderId;
    if (pid) {
      const r = await supabaseJson(cfg.url, `/rest/v1/card_orders?provider_order_id=eq.${encodeURIComponent(pid)}&select=*`, { key: cfg.key });
      if (r.ok) {
        const rows = await r.json();
        order = rows && rows[0] ? rows[0] : null;
      }
    }
  }
  if (!order) return res.status(404).json({ error: 'Order not found' });

  let st;
  try {
    st = await providers.provider().getStatus(order.provider_order_id);
  } catch (e) {
    return res.status(502).json({ error: 'Provider unreachable' });
  }

  await updateCardOrder(cfg, order.id, { status: st.status, last_provider_status: st.raw || null });

  if (st.status === 'finished') {
    await creditInvoice(cfg, order.invoice_id, { received: st.payoutAmountXmr != null ? st.payoutAmountXmr : undefined });
  } else if (['failed', 'refunded'].includes(st.status)) {
    await voidInvoice(cfg, order.invoice_id);
  }

  return res.status(200).json({ ok: true, status: st.status });
}