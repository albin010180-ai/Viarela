import * as nowpayments from './nowpayments.js';
import * as changenow from './changenow.js';
import * as guardarian from './guardarian.js';

export function provider() {
  const name = String(process.env.CARD_PROVIDER || 'nowpayments').toLowerCase();
  if (name === 'changenow') return changenow;
  if (name === 'guardarian') return guardarian;
  return nowpayments;
}

export function cardConfig() {
  const p = provider();
  return {
    provider: p.configInfo().provider,
    configured: p.configInfo().configured,
    surchargePct: p.configInfo().surchargePct
  };
}