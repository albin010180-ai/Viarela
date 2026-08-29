import * as changenow from './changenow.js';
import * as guardarian from './guardarian.js';

export function provider() {
  const name = String(process.env.CARD_PROVIDER || 'changenow').toLowerCase();
  return name === 'guardarian' ? guardarian : changenow;
}

export function cardConfig() {
  const p = provider();
  return {
    provider: p.configInfo().provider,
    configured: p.configInfo().configured,
    surchargePct: p.configInfo().surchargePct
  };
}