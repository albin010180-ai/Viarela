const base = () => process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';

export function configured() {
  return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_API_KEY.trim());
}

export function configInfo() {
  return {
    provider: 'nowpayments',
    configured: configured(),
    surchargePct: Math.max(0, Number(process.env.CARD_SURCHARGE_PCT || 0))
  };
}

async function np(path, opts = {}) {
  const headers = {
    'x-api-key': process.env.NOWPAYMENTS_API_KEY.trim(),
    'Content-Type': 'application/json'
  };
  const r = await fetch(base() + path, { ...opts, headers });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) {
    const err = new Error('provider_error');
    err.status = r.status;
    err.detail = (j && (j.message || j.error)) || text;
    throw err;
  }
  return j;
}

export async function createOrder({ payoutAddress, fiatAmount }) {
  if (!configured()) {
    const err = new Error('provider_not_configured');
    throw err;
  }
  const j = await np('/invoice', {
    method: 'POST',
    body: JSON.stringify({
      price_amount: Number(fiatAmount),
      price_currency: 'eur',
      is_fixed_rate: true,
      order_description: 'Viarela engagement fee'
    })
  });
  const paymentId = String(j.payment_id || j.id || '');
  return {
    orderId: paymentId,
    paymentUrl: j.invoice_url || (paymentId ? `https://nowpayments.io/payment/?paymentId=${paymentId}` : null),
    estimateXmr: null,
    rate: null,
    validUntil: null
  };
}

const STATUS_MAP = {
  waiting: 'waiting',
  confirming: 'confirming',
  confirming_secure: 'confirming',
  exchanging: 'exchanging',
  sending: 'sending',
  partially_paid: 'partial',
  finished: 'finished',
  refunded: 'refunded',
  expired: 'expired',
  failed: 'failed'
};

export async function getStatus(orderId) {
  const j = await np(`/payment/${orderId}`);
  return {
    status: STATUS_MAP[j.payment_status] || 'pending',
    raw: j.payment_status,
    payoutAmountXmr: null,
    payinAmountXmr: j.actually_paid != null ? Number(j.actually_paid) : null
  };
}

export async function getStatusFromWebhook(body) {
  const id = body && (body.payment_id || body.id);
  if (!id) return null;
  return getStatus(id);
}

export async function withdraw({ orderId, payoutAddress }) {
  await np('/withdrawal', {
    method: 'POST',
    body: JSON.stringify({
      payment_id: orderId,
      address: payoutAddress,
      pay_currency: 'xmr',
      is_subtract: true
    })
  });
}