(function () {
  const root = document.querySelector('[data-pay-desk]');
  if (!root) return;

  const lang = root.dataset.lang || 'tr';
  const t = lang === 'tr' ? {
    payByCard: 'Kartla {x} öde',
    cardNote: 'Visa / Mastercard. Ödeme kart ortağımızca işlenir ve otomatik olarak Viarela\'nın Monero cüzdanına aktarılır.',
    cardActivating: 'Kart ödemeleri aktifleştiriliyor. Şimdilik Monero\'yu kullanın.',
    cardFails: 'Kart ödemesi alınamıyor. Lütfen Monero\'yu kullanın.',
    initiating: 'Kart ödemesi hazırlanıyor…',
    completePay: 'Ödemeyi tamamla →',
    cardWaiting: 'Ödeme bekleniyor…',
    cardConfirming: 'Ödeme işleniyor…',
    cardExpired: 'Ödeme süresi doldu. Yeni sipariş oluşturun.',
    cardFailed: 'Ödeme başarısız. Yeni deneyin veya Monero kullanın.',
    cardPaid: 'Ödeme tamamlandı ✓',
    cardExpiresIn: 'Sipariş geçerliliği: ~{m} dk',
    settleNote: 'Tutar Monero cüzdanına düşer (tahmini {x} XMR)',
    creating: 'Fatura oluşturuluyor…',
    newInvoice: 'Yeni Monero faturası',
    noAddress: 'Monero adres havuzu henüz hazır değil (bridge kurulumu gerekli).',
    fail: 'Fatura oluşturulamadı. Lütfen tekrar deneyin.',
    rate: 'Kur: 1 XMR ≈ {r} EUR · fatura {e} EUR karşılığı',
    expiresIn: 'Fatura geçerliliği: ~{m} dk',
    expired: 'Fatura süresi doldu. Yeni fatura oluşturun.',
    waiting: 'Ödeme bekleniyor…',
    partial: 'Ödeme alındı, onay bekleniyor',
    paid: 'Ödendi ve onaylandı ✓',
    copyAddr: 'Adresi kopyala',
    copied: 'Kopyalandı'
  } : {
    payByCard: 'Pay {x} by card',
    cardNote: 'Visa / Mastercard. The payment is processed by our card partner and settles into Viarela\'s Monero wallet automatically.',
    cardActivating: 'Card payments are being activated. For now, use Monero.',
    cardFails: 'Card payments are unavailable right now. Please use Monero.',
    initiating: 'Preparing card payment…',
    completePay: 'Complete payment →',
    cardWaiting: 'Waiting for payment…',
    cardConfirming: 'Payment processing…',
    cardExpired: 'Order expired. Please create a new one.',
    cardFailed: 'Payment failed. Retry or use Monero.',
    cardPaid: 'Payment complete ✓',
    cardExpiresIn: 'Order valid for ~{m} min',
    settleNote: 'Settles into the Monero wallet (est. {x} XMR)',
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
    copied: 'Copied'
  };

  const q = s => root.querySelector(s);
  const els = {
    methods: root.querySelectorAll('[data-method]'),
    panels: { card: root.querySelector('[data-panel="card"]'), xmr: root.querySelector('[data-panel="xmr"]') },
    cardNote: root.querySelector('[data-card-note]'),
    cardError: root.querySelector('[data-card-error]'),
    cardCreate: root.querySelector('[data-card-create]'),
    cardResult: root.querySelector('[data-card-result]'),
    cardTotal: root.querySelector('[data-card-total]'),
    cardSettle: root.querySelector('[data-card-settle]'),
    cardUrl: root.querySelector('[data-card-url]'),
    cardStatus: root.querySelector('[data-card-status]'),
    cardExpires: root.querySelector('[data-card-expires]'),
    xmrCreate: root.querySelector('[data-xmr-create]'),
    xmrWrap: root.querySelector('[data-xmr]'),
    eur: root.querySelector('[data-xmr-eur]'),
    amount: root.querySelector('[data-xmr-amount]'),
    rate: root.querySelector('[data-xmr-rate]'),
    qr: root.querySelector('[data-xmr-qr]'),
    address: root.querySelector('[data-xmr-address]'),
    copy: root.querySelector('[data-xmr-copy]'),
    expires: root.querySelector('[data-xmr-expires]'),
    status: root.querySelector('[data-xmr-status]'),
    xmrError: root.querySelector('[data-xmr-error]')
  };

  let method = 'card';
  let packId = 'horizon';
  let cardCfg = { configured: false, surchargePct: 0 };
  let cardPoll = null;
  let cardExpireTimer = null;
  let cardInvoiceId = null;
  let xmrTick = null;
  let xmrExpireTimer = null;
  let xmrInvoiceId = null;

  function fmt(n, decimals) {
    return n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: decimals || 2 });
  }
  function fmtMoney(n) {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }
  function fiatDue() {
    const base = { horizon: 7500, continental: 10000, signature: 15000, unity: 20000 }[packId] || 7500;
    return Math.round(base * (1 + cardCfg.surchargePct / 100));
  }

  function switchMethod(m) {
    method = m;
    els.methods.forEach(b => b.classList.toggle('is-on', b.dataset.method === m));
    els.panels.card.hidden = m !== 'card';
    els.panels.xmr.hidden = m !== 'xmr';
  }

  root.querySelectorAll('[data-pack]').forEach(btn => {
    btn.addEventListener('click', () => {
      packId = btn.dataset.pack;
      root.querySelectorAll('[data-pack]').forEach(b => b.classList.toggle('is-on', b === btn));
      clearCardError();
      refreshCardCreateLabel();
    });
  });
  els.methods.forEach(b => b.addEventListener('click', () => switchMethod(b.dataset.method)));

  async function init() {
    try {
      const r = await fetch('/api/card/config/');
      if (r.ok) cardCfg = await r.json();
    } catch (e) {}
    cardCfg = Object.assign({ configured: false, surchargePct: 0 }, cardCfg);
    if (!cardCfg.configured) {
      if (els.cardNote) { els.cardNote.textContent = t.cardActivating; els.cardNote.hidden = false; }
      if (els.cardCreate) els.cardCreate.hidden = true;
      switchMethod('xmr');
    } else {
      refreshCardCreateLabel();
    }
  }

  function refreshCardCreateLabel() {
    if (els.cardCreate && cardCfg.configured) {
      els.cardCreate.textContent = t.payByCard.replace('{x}', fmtMoney(fiatDue()));
    }
  }

  function clearCardError() {
    if (els.cardError) { els.cardError.textContent = ''; els.cardError.hidden = true; }
  }

  els.cardCreate?.addEventListener('click', async () => {
    clearCardError();
    els.cardCreate.disabled = true;
    els.cardCreate.textContent = t.initiating;
    try {
      const r = await fetch('/api/card/order/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packId })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        if (els.cardError) {
          els.cardError.textContent = (data && data.error === 'PROVIDER_NOT_CONFIGURED') ? t.cardActivating : ((data && data.message) || t.cardFails);
          els.cardError.hidden = false;
        }
        return;
      }
      renderCard(data);
    } catch (e) {
      if (els.cardError) { els.cardError.textContent = t.cardFails; els.cardError.hidden = false; }
    } finally {
      els.cardCreate.disabled = false;
      refreshCardCreateLabel();
    }
  });

  function renderCard(o) {
    cardInvoiceId = o.invoice_id;
    els.cardResult.hidden = false;
    if (els.cardTotal) els.cardTotal.textContent = fmtMoney(o.fiat_amount);
    if (els.cardSettle) els.cardSettle.textContent = t.settleNote.replace('{x}', fmt(o.estimate_xmr || 0, 6));
    if (els.cardUrl) {
      els.cardUrl.href = o.payment_url;
      els.cardUrl.textContent = t.completePay;
    }
    startCardExpiry(o.expires_at);
    startCardPoll(o.invoice_id);
    if (els.cardStatus) { els.cardStatus.textContent = t.cardWaiting; els.cardStatus.classList.remove('is-ok'); }
  }

  function startCardExpiry(iso) {
    clearInterval(cardExpireTimer);
    cardExpireTimer = setInterval(() => {
      const left = new Date(iso).getTime() - Date.now();
      if (left <= 0) {
        if (els.cardExpires) els.cardExpires.textContent = t.cardExpired;
        clearInterval(cardExpireTimer);
        return;
      }
      if (els.cardExpires) els.cardExpires.textContent = t.cardExpiresIn.replace('{m}', String(Math.ceil(left / 60000)));
    }, 30000);
    if (els.cardExpires) els.cardExpires.textContent = t.cardExpiresIn.replace('{m}', String(Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))));
  }

  async function checkCard() {
    if (!cardInvoiceId) return;
    try {
      const r = await fetch('/api/xmr/status/?id=' + encodeURIComponent(cardInvoiceId));
      if (!r.ok) return;
      const s = await r.json();
      if (!els.cardStatus) return;
      if (s.status === 'credited' || s.card_status === 'finished') {
        els.cardStatus.textContent = t.cardPaid;
        els.cardStatus.classList.add('is-ok');
        clearInterval(cardPoll);
        clearInterval(cardExpireTimer);
      } else if (s.status === 'void') {
        els.cardStatus.textContent = t.cardFailed;
        clearInterval(cardPoll);
      } else if (s.status === 'expired') {
        els.cardStatus.textContent = t.cardExpired;
        clearInterval(cardPoll);
      } else if (s.card_status === 'confirming' || s.card_status === 'exchanging' || s.card_status === 'sending') {
        els.cardStatus.textContent = t.cardConfirming;
      } else {
        els.cardStatus.textContent = t.cardWaiting;
      }
    } catch (e) {}
  }
  function startCardPoll() {
    clearInterval(cardPoll);
    checkCard();
    cardPoll = setInterval(checkCard, 10000);
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

  init();
})();