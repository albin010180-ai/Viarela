import { supabaseJson } from '../xmr/_lib.js';
import * as providers from './_providers/index.js';

export async function creditInvoice(cfg, invoiceId, opts = {}) {
  const patch = {
    status: 'credited',
    confirmations: opts.confirmations != null ? opts.confirmations : 10,
    ...(opts.received != null ? { received_amount_xmr: opts.received } : {})
  };
  const r = await supabaseJson(cfg.url, `/rest/v1/xmr_invoices?id=eq.${invoiceId}`, {
    method: 'PATCH', key: cfg.key, body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error('credit_patch_failed');
  return r;
}

export async function voidInvoice(cfg, invoiceId) {
  const r = await supabaseJson(cfg.url, `/rest/v1/xmr_invoices?id=eq.${invoiceId}`, {
    method: 'PATCH', key: cfg.key, body: JSON.stringify({ status: 'void' })
  });
  if (!r.ok) throw new Error('void_patch_failed');
  return r;
}

export async function getCardOrder(cfg, invoiceId) {
  const r = await supabaseJson(cfg.url, `/rest/v1/card_orders?invoice_id=eq.${invoiceId}&select=*`, { key: cfg.key });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows && rows[0] ? rows[0] : null;
}

export async function updateCardOrder(cfg, orderId, patch) {
  const r = await supabaseJson(cfg.url, `/rest/v1/card_orders?id=eq.${orderId}`, {
    method: 'PATCH', key: cfg.key, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  return r.ok;
}

export async function refreshCardOrder(cfg, invoiceId) {
  const order = await getCardOrder(cfg, invoiceId);
  if (!order || !order.provider_order_id) return null;
  const pf = providers.provider();
  let st;
  try {
    st = await pf.getStatus(order.provider_order_id);
  } catch (e) {
    return { order, providerStatus: order.status || 'pending', raw: null, amount: null };
  }
  let status = st.status;
  if (status === 'finished' && typeof pf.withdraw === 'function' && order.payout_address && order.status !== 'withdrawing') {
    try {
      await pf.withdraw({ orderId: order.provider_order_id, payoutAddress: order.payout_address });
      await updateCardOrder(cfg, order.id, { status: 'withdrawing', last_provider_status: st.raw || null });
      status = 'withdrawing';
    } catch (e) {
      status = 'finished';
    }
  } else if (st.status !== (order.status || 'pending') || st.raw !== order.last_provider_status) {
    await updateCardOrder(cfg, order.id, { status: st.status, last_provider_status: st.raw || null });
  }
  return { order: { ...order, status, last_provider_status: st.raw || null }, providerStatus: status, raw: st.raw, amount: st.payoutAmountXmr != null ? st.payoutAmountXmr : null };
}