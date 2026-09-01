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
    copied: 'Kopyalandı'
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
    copied: 'Copied'
  };

  const q = s => root.querySelector(s);
  const els = {
    create: q('[data-xmr-create]'),
    wrap: q('[data-xmr]'),
    eur: q('[data-xmr-eur]'),
    amount: q('[data-xmr-amount]'),
    rate: q('[data-xmr-rate]'),
    qr: q('[data-xmr-qr]'),
    address: q('[data-xmr-address]'),
    copy: q('[data-xmr-copy]'),
    expires: q('[data-xmr-expires]'),
    status: q('[data-xmr-status]'),
    error: q('[data-xmr-error]')
  };

  const FEES = { horizon: 7500, continental: 10000, signature: 15000, unity: 20000 };
  let packId = 'horizon';
  let invoiceId = null;
  let pollTick = null;
  let expireTimer = null;

  function fmt(n, decimals) {
    return n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: decimals || 2 });
  }
  function fmtMoney(n) {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }

  const packBtns = [...root.querySelectorAll('[data-pack]')];
  const packEur = q('[data-pack-eur]');

  function selectPack(id) {
    if (!FEES[id]) id = 'horizon';
    packId = id;
    try { localStorage.setItem('viarela_selected_package', packId); } catch (e) {}
    packBtns.forEach(b => b.classList.toggle('is-on', b.dataset.pack === packId));
    if (packEur) packEur.textContent = fmtMoney(FEES[packId]);
  }

  packBtns.forEach(btn => {
    btn.addEventListener('click', () => selectPack(btn.dataset.pack));
  });

  const urlPack = new URLSearchParams(window.location.search).get('package');
  const storedPack = (() => { try { return localStorage.getItem('viarela_selected_package'); } catch (e) { return null; } })();
  selectPack(urlPack || storedPack || 'horizon');

  els.create.addEventListener('click', async () => {
    if (els.error) { els.error.textContent = ''; els.error.hidden = true; }
    els.create.disabled = true;
    els.create.textContent = t.creating;
    try {
      const resp = await fetch('/api/xmr/invoice/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packId })
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        if (els.error) {
          els.error.textContent = (data && data.error === 'NO_ADDRESS_AVAILABLE') ? t.noAddress : ((data && data.message) || t.fail);
          els.error.hidden = false;
        }
        return;
      }
      render(data);
    } catch (e) {
      if (els.error) { els.error.textContent = t.fail; els.error.hidden = false; }
    } finally {
      els.create.disabled = false;
      els.create.textContent = t.newInvoice;
    }
  });

  function render(inv) {
    invoiceId = inv.id;
    els.wrap.hidden = false;
    if (els.eur) els.eur.textContent = fmtMoney(inv.amount_eur);
    if (els.amount) els.amount.textContent = fmt(inv.amount_xmr, 6) + ' XMR';
    if (els.rate) els.rate.textContent = t.rate.replace('{r}', fmt(inv.fx_rate, 2)).replace('{e}', fmtMoney(inv.amount_eur));
    if (els.qr) els.qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=4&data=' + encodeURIComponent(inv.qr);
    if (els.address) els.address.textContent = inv.address;
    startExpiry(inv.expires_at);
    startPoll();
  }

  function startExpiry(iso) {
    clearInterval(expireTimer);
    expireTimer = setInterval(() => {
      const left = new Date(iso).getTime() - Date.now();
      if (left <= 0) {
        if (els.expires) els.expires.textContent = t.expired;
        if (els.status) els.status.textContent = t.expired;
        clearInterval(expireTimer);
        stopPoll();
        return;
      }
      if (els.expires) els.expires.textContent = t.expiresIn.replace('{m}', String(Math.ceil(left / 60000)));
    }, 30000);
    if (els.expires) els.expires.textContent = t.expiresIn.replace('{m}', String(Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))));
  }

  async function check() {
    if (!invoiceId) return;
    try {
      const r = await fetch('/api/xmr/status/?id=' + encodeURIComponent(invoiceId));
      if (!r.ok) return;
      const s = await r.json();
      if (!els.status) return;
      if (s.status === 'credited') {
        els.status.textContent = t.paid;
        els.status.classList.add('is-ok');
        stopPoll();
        clearInterval(expireTimer);
      } else if (s.received_amount_xmr != null) {
        els.status.textContent = t.partial + ' (' + (s.confirmations || 0) + '/10)';
      } else {
        els.status.textContent = t.waiting;
      }
    } catch (e) {}
  }
  function startPoll() {
    stopPoll();
    check();
    pollTick = setInterval(check, 12000);
  }
  function stopPoll() {
    if (pollTick) { clearInterval(pollTick); pollTick = null; }
  }

  els.copy.addEventListener('click', async () => {
    if (!els.address || !els.address.textContent) return;
    try {
      await navigator.clipboard.writeText(els.address.textContent);
      els.copy.textContent = t.copied;
      setTimeout(() => { els.copy.textContent = t.copyAddr; }, 1600);
    } catch (e) {}
  });

  const fiatToggle = root.querySelector('.pay-fiat-toggle');
  const fiatAns = root.querySelector('.pay-fiat-ans');
  if (fiatToggle && fiatAns) {
    fiatToggle.addEventListener('click', () => {
      const open = fiatAns.hidden;
      fiatAns.hidden = !open;
      fiatToggle.setAttribute('aria-expanded', String(open));
      const s = fiatToggle.querySelector('span');
      if (s) s.textContent = open ? '–' : '+';
    });
  }
})();