(function () {
  const root = document.querySelector('[data-pay-desk]');
  if (!root) return;

  const lang = root.dataset.lang || 'tr';
  const t = lang === 'tr' ? {
    creating: 'Fatura oluşturuluyor…',
    newInvoice: 'Yeni Monero faturası',
    noAddress: 'Monero adres havuzu henüz hazır değil (bridge kurulumu gerekli).',
    fail: 'Fatura oluşturulamadı. Lütfen tekrar deneyin.',
    rate: 'Kur: 1 XMR ≈ {r} EUR · {e} EUR karşılığı',
    expiresIn: 'Fatura geçerliliği: ~{m} dk',
    expired: 'Fatura süresi doldu. Yeni fatura oluşturun.',
    waiting: 'Ödeme bekleniyor…',
    partial: 'Ödeme alındı, onay bekleniyor',
    paid: 'Ödendi ve onaylandı ✓',
    copyAddr: 'Adresi kopyala',
    copied: 'Kopyalandı',
    cryptoActivating: 'Çoklu kripto ödemesi aktifleştiriliyor. Şimdilik Monero ile ödeyin.',
    cryptoFails: 'Ödeme şu anda alınamıyor. Lütfen Monero ile ödeyin.',
    cryptoInitiating: 'Ödeme hazırlanıyor…',
    cryptoComplete: 'Ödemeyi tamamla →',
    cryptoNew: 'Yeni sipariş',
    cryptoWaiting: 'Ödeme bekleniyor…',
    cryptoConfirming: 'Ödeme işleniyor…',
    cryptoExpired: 'Siparişin süresi doldu. Yeni sipariş oluşturun.',
    cryptoFailed: 'Ödeme başarısız. Tekrar deneyin.',
    cryptoPaid: 'Ödeme tamamlandı ✓',
    cryptoExpiresIn: 'Sipariş geçerliliği: ~{m} dk'
  } : {
    creating: 'Creating invoice…',
    newInvoice: 'New Monero invoice',
    noAddress: 'The Monero address pool is not ready yet (owner must run the bridge setup).',
    fail: 'Could not create invoice. Please retry.',
    rate: 'Rate: 1 XMR ≈ {r} EUR · covers {e} EUR',
    expiresIn: 'Invoice valid for ~{m} min',
    expired: 'Invoice expired. Create a new one.',
    waiting: 'Waiting for payment…',
    partial: 'Payment received, awaiting confirmations',
    paid: 'Payment credited ✓',
    copyAddr: 'Copy address',
    copied: 'Copied',
    cryptoActivating: 'Multi-crypto payments are being activated. For now, pay with Monero.',
    cryptoFails: 'Payments are unavailable right now. Please pay with Monero.',
    cryptoInitiating: 'Preparing payment…',
    cryptoComplete: 'Complete payment →',
    cryptoNew: 'New order',
    cryptoWaiting: 'Waiting for payment…',
    cryptoConfirming: 'Payment processing…',
    cryptoExpired: 'Order expired. Create a new one.',
    cryptoFailed: 'Payment failed. Please try again.',
    cryptoPaid: 'Payment complete ✓',
    cryptoExpiresIn: 'Order valid for ~{m} min'
  };

  const q = s => root.querySelector(s);
  const els = {
    methods: root.querySelectorAll('[data-method]'),
    panels: { monero: q('[data-panel="monero"]'), crypto: q('[data-panel="crypto"]') },
    xmrCreate: q('[data-xmr-create]'),
    xmrWrap: q('[data-xmr]'),
    eur: q('[data-xmr-eur]'),
    amount: q('[data-xmr-amount]'),
    rate: q('[data-xmr-rate]'),
    qr: q('[data-xmr-qr]'),
    address: q('[data-xmr-address]'),
    copy: q('[data-xmr-copy]'),
    expires: q('[data-xmr-expires]'),
    status: q('[data-xmr-status]'),
    xmrError: q('[data-xmr-error]'),
    cryptoCreate: q('[data-crypto-create]'),
    cryptoNote: q('[data-crypto-note]'),
    cryptoResult: q('[data-crypto-result]'),
    cryptoTotal: q('[data-crypto-total]'),
    cryptoUrl: q('[data-crypto-url]'),
    cryptoStatus: q('[data-crypto-status]'),
    cryptoExpires: q('[data-crypto-expires]'),
    cryptoError: q('[data-crypto-error]')
  };

  let method = 'monero';
  let packId = 'horizon';
  let pspCfg = { provider: 'nowpayments', configured: false, surchargePct: 0 };
  let xmrTick = null;
  let xmrExpireTimer = null;
  let xmrInvoiceId = null;
  let cryptoPoll = null;
  let cryptoExpireTimer = null;
  let cryptoInvoiceId = null;

  function fmt(n, decimals) {
    return n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: decimals || 2 });
  }
  function fmtMoney(n) {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }

  function switchMethod(m) {
    method = m;
    els.methods.forEach(b => b.classList.toggle('is-on', b.dataset.method === m));
    els.panels.monero.hidden = m !== 'monero';
    els.panels.crypto.hidden = m !== 'crypto';
  }

  root.querySelectorAll('[data-pack]').forEach(btn => {
    btn.addEventListener('click', () => {
      packId = btn.dataset.pack;
      root.querySelectorAll('[data-pack]').forEach(b => b.classList.toggle('is-on', b === btn));
      clearCryptoError();
    });
  });
  els.methods.forEach(b => b.addEventListener('click', () => switchMethod(b.dataset.method)));

  async function init() {
    try {
      const r = await fetch('/api/card/config/');
      if (r.ok) pspCfg = { provider: 'nowpayments', configured: false, surchargePct: 0, ...(await r.json()) };
    } catch (e) {}
    if (!pspCfg.configured && els.cryptoCreate) {
      if (els.cryptoNote) els.cryptoNote.textContent = t.cryptoActivating;
      els.cryptoCreate.hidden = true;
    }
  }

  function clearCryptoError() {
    if (els.cryptoError) { els.cryptoError.textContent = ''; els.cryptoError.hidden = true; }
  }

  els.xmrCreate?.addEventListener('click', async () => {
    if (els.xmrError) { els.xmrError.textContent = ''; els.xmrError.hidden = true; }
    els.xmrCreate.disabled = true;
    els.xmrCreate.textContent = t.creating;
    try {
      const resp = await fetch('/api/xmr/invoice/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packId })
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        if (els.xmrError) {
          els.xmrError.textContent = (data && data.error === 'NO_ADDRESS_AVAILABLE') ? t.noAddress : ((data && data.message) || t.fail);
          els.xmrError.hidden = false;
        }
        return;
      }
      renderXmr(data);
    } catch (e) {
      if (els.xmrError) { els.xmrError.textContent = t.fail; els.xmrError.hidden = false; }
    } finally {
      els.xmrCreate.disabled = false;
      els.xmrCreate.textContent = t.newInvoice;
    }
  });

  function renderXmr(inv) {
    xmrInvoiceId = inv.id;
    els.xmrWrap.hidden = false;
    if (els.eur) els.eur.textContent = fmtMoney(inv.amount_eur);
    if (els.amount) els.amount.textContent = fmt(inv.amount_xmr, 6) + ' XMR';
    if (els.rate) els.rate.textContent = t.rate.replace('{r}', fmt(inv.fx_rate, 2)).replace('{e}', fmtMoney(inv.amount_eur));
    if (els.qr) els.qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=4&data=' + encodeURIComponent(inv.qr);
    if (els.address) els.address.textContent = inv.address;
    startXmrExpiry(inv.expires_at);
    startXmrPoll();
  }

  function startXmrExpiry(iso) {
    clearInterval(xmrExpireTimer);
    xmrExpireTimer = setInterval(() => {
      const left = new Date(iso).getTime() - Date.now();
      if (left <= 0) {
        if (els.expires) els.expires.textContent = t.expired;
        if (els.status) els.status.textContent = t.expired;
        clearInterval(xmrExpireTimer);
        stopXmrPoll();
        return;
      }
      if (els.expires) els.expires.textContent = t.expiresIn.replace('{m}', String(Math.ceil(left / 60000)));
    }, 30000);
    if (els.expires) els.expires.textContent = t.expiresIn.replace('{m}', String(Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))));
  }

  async function checkXmr() {
    if (!xmrInvoiceId) return;
    try {
      const r = await fetch('/api/xmr/status/?id=' + encodeURIComponent(xmrInvoiceId));
      if (!r.ok) return;
      const s = await r.json();
      if (!els.status) return;
      if (s.status === 'credited') {
        els.status.textContent = t.paid;
        els.status.classList.add('is-ok');
        stopXmrPoll();
        clearInterval(xmrExpireTimer);
      } else if (s.received_amount_xmr != null) {
        els.status.textContent = t.partial + ' (' + (s.confirmations || 0) + '/10)';
      } else {
        els.status.textContent = t.waiting;
      }
    } catch (e) {}
  }
  function startXmrPoll() {
    stopXmrPoll();
    checkXmr();
    xmrTick = setInterval(checkXmr, 12000);
  }
  function stopXmrPoll() {
    if (xmrTick) { clearInterval(xmrTick); xmrTick = null; }
  }

  els.copy?.addEventListener('click', async () => {
    if (!els.address || !els.address.textContent) return;
    try {
      await navigator.clipboard.writeText(els.address.textContent);
      els.copy.textContent = t.copied;
      setTimeout(() => { els.copy.textContent = t.copyAddr; }, 1600);
    } catch (e) {}
  });

  els.cryptoCreate?.addEventListener('click', async () => {
    clearCryptoError();
    els.cryptoCreate.disabled = true;
    els.cryptoCreate.textContent = t.cryptoInitiating;
    try {
      const r = await fetch('/api/card/order/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packId, method: 'crypto' })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        if (els.cryptoError) {
          els.cryptoError.textContent = (data && (data.error === 'PROVIDER_NOT_CONFIGURED' || data.error === 'NO_ADDRESS_AVAILABLE')) ? t.cryptoActivating : ((data && data.message) || t.cryptoFails);
          els.cryptoError.hidden = false;
        }
        return;
      }
      renderCrypto(data);
    } catch (e) {
      if (els.cryptoError) { els.cryptoError.textContent = t.cryptoFails; els.cryptoError.hidden = false; }
    } finally {
      els.cryptoCreate.disabled = false;
      if (pspCfg.configured) els.cryptoCreate.textContent = t.cryptoNew;
    }
  });

  function renderCrypto(o) {
    cryptoInvoiceId = o.invoice_id;
    els.cryptoResult.hidden = false;
    if (els.cryptoTotal) els.cryptoTotal.textContent = fmtMoney(o.fiat_amount);
    if (els.cryptoUrl) {
      els.cryptoUrl.href = o.payment_url;
      els.cryptoUrl.textContent = t.cryptoComplete;
    }
    startCryptoExpiry(o.expires_at);
    startCryptoPoll();
    if (els.cryptoStatus) { els.cryptoStatus.textContent = t.cryptoWaiting; els.cryptoStatus.classList.remove('is-ok'); }
  }

  function startCryptoExpiry(iso) {
    clearInterval(cryptoExpireTimer);
    cryptoExpireTimer = setInterval(() => {
      const left = new Date(iso).getTime() - Date.now();
      if (left <= 0) {
        if (els.cryptoExpires) els.cryptoExpires.textContent = t.cryptoExpired;
        clearInterval(cryptoExpireTimer);
        return;
      }
      if (els.cryptoExpires) els.cryptoExpires.textContent = t.cryptoExpiresIn.replace('{m}', String(Math.ceil(left / 60000)));
    }, 30000);
    if (els.cryptoExpires) els.cryptoExpires.textContent = t.cryptoExpiresIn.replace('{m}', String(Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))));
  }

  async function checkCrypto() {
    if (!cryptoInvoiceId) return;
    try {
      const r = await fetch('/api/xmr/status/?id=' + encodeURIComponent(cryptoInvoiceId));
      if (!r.ok) return;
      const s = await r.json();
      if (!els.cryptoStatus) return;
      if (s.status === 'credited' || s.status === 'finished') {
        els.cryptoStatus.textContent = t.cryptoPaid;
        els.cryptoStatus.classList.add('is-ok');
        clearInterval(cryptoPoll);
        clearInterval(cryptoExpireTimer);
      } else if (s.status === 'void' || s.status === 'expired') {
        els.cryptoStatus.textContent = s.status === 'void' ? t.cryptoFailed : t.cryptoExpired;
        clearInterval(cryptoPoll);
      } else if (s.card_status === 'confirming' || s.card_status === 'exchanging' || s.card_status === 'sending') {
        els.cryptoStatus.textContent = t.cryptoConfirming;
      } else {
        els.cryptoStatus.textContent = t.cryptoWaiting;
      }
    } catch (e) {}
  }
  function startCryptoPoll() {
    clearInterval(cryptoPoll);
    checkCrypto();
    cryptoPoll = setInterval(checkCrypto, 10000);
  }

  init();
})();