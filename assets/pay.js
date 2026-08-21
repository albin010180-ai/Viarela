(function () {
  const cfg = window.VIARELA_PAY;
  const root = document.querySelector('[data-pay-desk]');
  if (!cfg || !root) return;

  const lang = root.dataset.lang || 'tr';
  const t = lang === 'tr' ? {
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    waiting: 'Adres, yazılı sözleşme sonrası bu kutuda görünür.',
    locked: 'Ödeme adresi henüz açık değil. Önce vaka özeti ve sözleşme.',
    paid: 'Ödeme bildiriminiz hazır. SimpleX’ten dekontu gönderin.',
    rateFail: 'Kur alınamadı. Faturadaki USDT tutarını kullanın.'
  } : {
    copy: 'Copy',
    copied: 'Copied',
    waiting: 'The settlement address appears here after the written engagement.',
    locked: 'The pay-to address is not live yet. Complete assessment and the written agreement first.',
    paid: 'Your payment notice is ready. Send the receipt on SimpleX.',
    rateFail: 'Rate unavailable. Use the USDT amount on your invoice.'
  };

  const els = {
    address: root.querySelector('[data-pay-address]'),
    qr: root.querySelector('[data-pay-qr]'),
    amountEur: root.querySelector('[data-pay-eur]'),
    amountUsdt: root.querySelector('[data-pay-usdt]'),
    rate: root.querySelector('[data-pay-rate]'),
    lock: root.querySelector('[data-pay-lock]'),
    live: root.querySelector('[data-pay-live]'),
    name: root.querySelector('[name=pay_name]'),
    notice: root.querySelector('[data-pay-notice]'),
    done: root.querySelector('[data-pay-done]')
  };

  let eurUsd = 1.08;
  let stage = 'retainer';
  let packId = 'horizon';
  const ready = typeof cfg.address === 'string' && cfg.address.trim().length > 20;

  function pack() {
    return cfg.packages.find(p => p.id === packId) || cfg.packages[0];
  }
  function eurDue() {
    const fee = pack().eur;
    if (stage === 'retainer') return Math.round(fee * cfg.retainerPct);
    if (stage === 'remainder') return fee - Math.round(fee * cfg.retainerPct);
    return fee;
  }
  function usdtDue() {
    return Math.round(eurDue() * eurUsd);
  }
  function moneyEur(n) {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0
    }).format(n);
  }
  function moneyUsdt(n) {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
      maximumFractionDigits: 0
    }).format(n) + ' USDT';
  }

  function render() {
    if (els.amountEur) els.amountEur.textContent = moneyEur(eurDue());
    if (els.amountUsdt) els.amountUsdt.textContent = moneyUsdt(usdtDue());
    if (els.rate) {
      els.rate.textContent = lang === 'tr'
        ? `1 € ≈ ${eurUsd.toFixed(2)} USDT · tutarı faturanızla karşılaştırın`
        : `1 € ≈ ${eurUsd.toFixed(2)} USDT · match this to your invoice`;
    }
    if (els.address) els.address.textContent = ready ? cfg.address.trim() : t.waiting;
    if (els.lock) els.lock.hidden = ready;
    if (els.live) els.live.hidden = !ready;
    if (els.qr) {
      if (ready) {
        els.qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(cfg.address.trim());
        els.qr.hidden = false;
      } else {
        els.qr.hidden = true;
      }
    }
  }

  async function loadRate() {
    try {
      const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
      const j = await r.json();
      if (j && j.rates && j.rates.USD) eurUsd = Number(j.rates.USD);
    } catch (e) {
      if (els.rate) els.rate.textContent = t.rateFail;
    }
    render();
  }

  async function copy(text, btn) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const prev = btn.textContent;
      btn.textContent = t.copied;
      setTimeout(() => { btn.textContent = prev; }, 1600);
    } catch (e) {}
  }

  root.querySelectorAll('[data-pack]').forEach(btn => {
    btn.addEventListener('click', () => {
      packId = btn.dataset.pack;
      root.querySelectorAll('[data-pack]').forEach(b => b.classList.toggle('is-on', b === btn));
      render();
    });
  });
  root.querySelectorAll('[data-stage]').forEach(btn => {
    btn.addEventListener('click', () => {
      stage = btn.dataset.stage;
      root.querySelectorAll('[data-stage]').forEach(b => b.classList.toggle('is-on', b === btn));
      render();
    });
  });
  root.querySelector('[data-copy-address]')?.addEventListener('click', e => {
    if (!ready) return;
    copy(cfg.address.trim(), e.currentTarget);
  });
  root.querySelector('[data-copy-amount]')?.addEventListener('click', e => {
    copy(String(usdtDue()), e.currentTarget);
  });
  root.querySelector('[data-copy-network]')?.addEventListener('click', e => {
    copy(cfg.network, e.currentTarget);
  });

  root.querySelector('[data-confirm-pay]')?.addEventListener('click', () => {
    const name = (els.name?.value || '').trim();
    if (!name) {
      els.name?.reportValidity();
      els.name?.focus();
      return;
    }
    const lines = lang === 'tr' ? [
      'VIARELA ÖDEME BİLDİRİMİ',
      `Ad soyad: ${name}`,
      `Paket: ${pack().name}`,
      `Aşama: ${stage}`,
      `Euro: ${moneyEur(eurDue())}`,
      `Gönderilen: ${moneyUsdt(usdtDue())}`,
      `Ağ: ${cfg.networkHint} (${cfg.network})`,
      'Dekont / işlem ekran görüntüsü bu mesajın altına eklenir.'
    ] : [
      'VIARELA PAYMENT NOTICE',
      `Name: ${name}`,
      `Package: ${pack().name}`,
      `Stage: ${stage}`,
      `Euro: ${moneyEur(eurDue())}`,
      `Sent: ${moneyUsdt(usdtDue())}`,
      `Network: ${cfg.networkHint} (${cfg.network})`,
      'Attach the transfer screenshot below this message.'
    ];
    const summary = lines.join('\n');
    if (els.notice) {
      els.notice.textContent = summary;
      els.done.hidden = false;
      els.done.classList.add('show');
    }
    navigator.clipboard.writeText(summary).catch(() => {});
  });

  render();
  loadRate();
})();
