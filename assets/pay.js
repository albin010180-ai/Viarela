(function () {
  const root = document.querySelector('[data-pay-desk]');
  if (!root) return;

  const lang = root.dataset.lang || 'tr';
  const t = lang === 'tr' ? {
    payByCard: 'Kartla {x} öde',
    cardNote: 'Visa / Mastercard. Ödeme kart ortağımızca işlenir; üyelik, form veya ek doğrulama istemez.',
    cardActivating: 'Kart ödemeleri aktifleştiriliyor. Lütfen kısa süre sonra tekrar deneyin.',
    cardFails: 'Ödeme şu anda alınamıyor. Lütfen tekrar deneyin.',
    initiating: 'Ödeme hazırlanıyor…',
    completePay: 'Ödemeyi tamamla →',
    cardWaiting: 'Ödeme bekleniyor…',
    cardConfirming: 'Ödeme işleniyor…',
    cardExpired: 'Siparişin süresi doldu. Yeni sipariş oluşturun.',
    cardFailed: 'Ödeme başarısız. Tekrar deneyin.',
    cardPaid: 'Ödeme tamamlandı ✓',
    cardExpiresIn: 'Sipariş geçerliliği: ~{m} dk'
  } : {
    payByCard: 'Pay {x} by card',
    cardNote: 'Visa / Mastercard. Processed securely by our payment partner — no sign-up, no forms, no extra verification.',
    cardActivating: 'Card payments are being activated. Please check back shortly.',
    cardFails: 'Payments are unavailable right now. Please try again.',
    initiating: 'Preparing payment…',
    completePay: 'Complete payment →',
    cardWaiting: 'Waiting for payment…',
    cardConfirming: 'Payment processing…',
    cardExpired: 'Order expired. Create a new one.',
    cardFailed: 'Payment failed. Please try again.',
    cardPaid: 'Payment complete ✓',
    cardExpiresIn: 'Order valid for ~{m} min'
  };

  const q = s => root.querySelector(s);
  const els = {
    cardNote: q('[data-card-note]'),
    cardError: q('[data-card-error]'),
    cardCreate: q('[data-card-create]'),
    cardResult: q('[data-card-result]'),
    cardTotal: q('[data-card-total]'),
    cardUrl: q('[data-card-url]'),
    cardStatus: q('[data-card-status]'),
    cardExpires: q('[data-card-expires]')
  };

  let packId = 'horizon';
  let cardCfg = { configured: false, surchargePct: 0 };
  let cardPoll = null;
  let cardExpireTimer = null;
  let cardInvoiceId = null;

  function fmtMoney(n) {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }
  function fiatDue() {
    const base = { horizon: 7500, continental: 10000, signature: 15000, unity: 20000 }[packId] || 7500;
    return Math.round(base * (1 + cardCfg.surchargePct / 100));
  }

  root.querySelectorAll('[data-pack]').forEach(btn => {
    btn.addEventListener('click', () => {
      packId = btn.dataset.pack;
      root.querySelectorAll('[data-pack]').forEach(b => b.classList.toggle('is-on', b === btn));
      clearCardError();
      refreshCardCreateLabel();
    });
  });

  async function init() {
    try {
      const r = await fetch('/api/card/config/');
      if (r.ok) cardCfg = await r.json();
    } catch (e) {}
    cardCfg = Object.assign({ configured: false, surchargePct: 0 }, cardCfg);
    if (!cardCfg.configured) {
      if (els.cardNote) { els.cardNote.textContent = t.cardActivating; els.cardNote.hidden = false; }
      if (els.cardCreate) els.cardCreate.hidden = true;
    } else {
      if (els.cardNote) { els.cardNote.textContent = t.cardNote; els.cardNote.hidden = false; }
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
    if (els.cardUrl) {
      els.cardUrl.href = o.payment_url;
      els.cardUrl.textContent = t.completePay;
    }
    startCardExpiry(o.expires_at);
    startCardPoll();
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

  init();
})();