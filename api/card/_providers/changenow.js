const base = () => process.env.NOW_API_URL || 'https://api.changenow.io/v2';

export function configured() {
  return Boolean(process.env.NOW_API_KEY && process.env.NOW_API_KEY.trim());
}

export function configInfo() {
  return {
    provider: 'changenow',
    configured: configured(),
    surchargePct: Math.max(0, Number(process.env.CARD_SURCHARGE_PCT || 0))
  };
}

async function now(path, opts = {}) {
  const headers = {
    'x-changenow-api-key': process.env.NOW_API_KEY.trim(),
    'Content-Type': 'application/json'
  };
  const r = await fetch(base() + path, { ...opts, headers });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) {
    const err = new Error('provider_error');
    err.status = r.status;
    err.detail = j?.error || (typeof j === 'string' ? j : text);
    throw err;
  }
  return j;
}

function payUrlFor(o) {
  if (o && o.paymentUrl) return o.paymentUrl;
  if (o && o.paymentId) return `https://changenow.io/exchange/payments/${o.paymentId}`;
  if (o && o.id) return `https://changenow.io/exchange/txs/${o.id}`;
  return null;
}

export async function createOrder({ payoutAddress, fiatAmount }) {
  if (!configured()) {
    const err = new Error('provider_not_configured');
    throw err;
  }
  const amount = Number(fiatAmount).toFixed(2);
  const j = await now(`/exchange/eur/xmr/${amount}?fixedRate=true`, {
    method: 'POST',
    body: JSON.stringify({
      payoutAddress,
      type: 'fiat',
      flow: 'fixed-rate'
    })
  });
  return {
    orderId: j.id,
    paymentUrl: payUrlFor(j) || `https://changenow.io/exchange/txs/${j.id}`,
    estimateXmr: Number(j.payoutAmount || j.amount || 0),
    rate: Number(j.rate || 0),
    validUntil: j.validUntil || null
  };
}

const STATUS_MAP = {
  new: 'new',
  waiting: 'waiting',
  confirming: 'confirming',
  exchanging: 'exchanging',
  sending: 'sending',
  finished: 'finished',
  failed: 'failed',
  refunded: 'refunded',
  verifying: 'verifying'
};

export async function getStatus(orderId) {
  const j = await now(`/exchange/by-id/${orderId}`);
  return {
    status: STATUS_MAP[j.status] || 'pending',
    raw: j.status,
    payoutAmountXmr: j.toAmount != null ? Number(j.toAmount) : null,
    payinAmountXmr: j.amountTo != null ? Number(j.amountTo) : null
  };
}

export async function getStatusFromWebhook(body) {
  const id = body && (body.id || body.exchangeId || body.exchange_id);
  if (!id) return null;
  return getStatus(id);
}