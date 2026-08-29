# Viarela — Otomatik Monero (XMR) Ödeme Mimarisi

**Yol A seçildi: Müşteri doğrudan Monero öder. Dönüşüm/borsa yok. Para doğrudan ana (final) Monero cüzdanına düşer.**

Kritik tasarım prensibi: **"Kendin izleyebilirsin, dışarıdakiler izleyemez."**

- **Untraceable (dışarıya karşı):** üçüncü taraf gözlemci ne tutarı, ne cüzdanını, ne de iki müşteri ödemesinin aynı işletmeye gittiğini ilişkilendirebilir.
- **Traceable (senin için):** tüm faturalar, adres başına kayıt, tutar (XMR + EUR), zaman, onay sayısı, işlem kimliği admin panelde tam kayıt altındadır (önemli: bu kayıt sizin denetim/GDPR-revizyon zincirinizi de oluşturur).

---

## 1. Genel Bakış (diagram)

```
 Müşteri
   │  pay desk (Vercel) → /api/xmr/invoice → benzersiz subaddress + tutar + QR
   ▼
 Monero ağı (kovulan/izlenemez)
   │  müşteri XMR'i senin subaddress'ine yollar
   ▼
 monerod  (kendi node'un, pruned)        ← işlemler senin node'una gelir, üçüncü node yok
   ▲
 monero-wallet-rpc  (WATCH-ONLY cüzdan)  ← yalnızca GÖRÜNTÜLEME: para hiçbir servis tarafından harcanamaz
   ▲
 xmr-bridge  (Node servis, lokalde/VPS'te) ← wallet-rpc'yi poll eder, eşleşmeyi yapar
   │
   ▼
 Supabase (RLS korumalı)  ← "ödendi / onaylandı" yazar [payment_id, tutar, onay, timestamp]
   ▲
 /admin/ paneli  (realtime toast, fatura listesi, CSV)   |   pay desk (XMR durumunu canlı gösterir)
```

Önemli: **Para sadece** `monero-wallet-cli` ile oluşturduğun **ana cüzdanda** tutulabilir. Bridge, izleme cüzdanı **view-only** olduğu için fonlara asla dokunamaz (spend key'in offline kalır).

---

## 2. Monero Bileşenleri

### 2.1 monerod (nodo)
- Kendi node'unu çalıştır (pruned `--prune-blockchain`): disk ~60-80 GB, RAM 4 GB+.
- **Neden önemli:** Remote node kullanırsan adres-sorgu-IP ilişkisi o node operatörüne görünür. Kendi node'un = bu sızıntı yok.
- İsteğe bağlı Tor: `--proxy socks5://127.0.0.1:9050` P2P trafiğini Tor üzerinden yönlendirerek IP daha da gizlenir.
- `rpc-bind-ip=127.0.0.1` (dışarıya açma).

### 2.2 monero-wallet-rpc (yalnızca okuma)
- `monero-wallet-cli --generate-from-view-key` ile **view-only** cüzdan üret (view key + primary address'ten).
- wallet-rpc'yi bu cüzdanla başlat: `--wallet-file ... --rpc-bind-port 18283 --rpc-login user:pass`.
- Yalnızca `127.0.0.1`'de dinler → dışarıdan erişilemez.
- Fon umutsuz: spend key bu serviste yok.

### 2.3 Ana cüzdan (final / soğuk)
- `monero-wallet-cli` ile oluştur, spend key'i offline kaydet (kağıt/HW).
- Aktif kullanım için bu cüzdanın subaddress'leri **önceden** oluşturulur ve wallet-rpc'ye view-only olarak tanıtılır.

---

## 3. Fatura ↔ Adres Eşleşmesi (traceable taraf)

Her fatura için taze subaddress üretilir → dış gözlemci iki faturanın aynı işletmeye ait olduğunu göremez; sen subaddress index'inden hangi müşterinin ödediğini bilirsin.

### 3.1 Subaddress Havuzu (checkout'u senkron tutar)
wallet-rpc'ye checkout anında ulaşamayız (o yerel/VPS'te). Çözüm → **önceden doldurulmuş havuz**:
1. Wallet makinesinde script, `create_address` ile 100 subaddress üretir ve Supabase `xmr_address_pool` tablosuna yazar (`status=unused`, `index`).
2. Checkout (`/api/xmr/invoice`), havuzdan **transactional** `UPDATE ... WHERE status='unused' LIMIT 1 RETURNING` ile bir adres çeker → senkron yanıt verir.
3. Havuz azalınca bridge, pool'u yeniden doldurur.

### 3.2 Fatura oluşturma (Vercel `/api/xmr/invoice`)
- Girdi: yalnızca paket. Fatura **her zaman paketin tam tutarı** içindir — parçalı (retainer/remainder) akış yok; USDT/TRC20 yöntemi kaldırıldı, XMR tek ödeme kanalıdır.
- CANLI XMR→EUR kuru (public API, örn. CoinGecko), **+ güvenlik payı** (ör. +%2..3) → `xmr_amount`.
- Havuzdan adres çek → fatura kaydı (`xmr_invoices`: invoice_id, address, subaddress_index, amount_eur, amount_xmr, fx_rate, status=pending, expires_at).
- Yanıt: `{address, amount_xmr, amount_eur, qr: "monero:ADDR?tx_amount=XMR..."}` — QR tarayıcıda tutar otomatik dolar.

### 3.3 Ödenmiş sayma (bridge)
- Bridge her N dk: `refresh` → `get_transfers` (in, confirmed/unconfirmed).
- Girişi subaddress index'ine göre `xmr_invoices` ile eşleştir.
- **Onay eşiği:** gereksinim `confirmations >= 10` (XMR ~2 dk/blok → ~20 dk güvenli).
- Eşik aşılınca: fatura `status=credited`, `xmr_payments` satırı yazılır, admin panel realtime bildirim gösterilir, faturalar arası mutabakat güncellenir.

---

## 4. Nerede çalışır (ücretsiz vs ücretli)

| Seçenek | Maliyet | Avantaj | Dezavantaj |
|---|---|---|---|
| **Kendi PC (Windows)** | **Ücretsiz** (0 ¨) | Hiçbir üçüncü taraf yok, %100 kontrol | PC sürekli açık olmalı; disk ~80 GB |
| **VPS (örn. Hetzner/Contabo)** | ~4-8 ¨/ay | 7/24 kesintisiz, Bridge+node aynı makinede | Aylık ücret |

Her iki seçenekte de **kod aynı**: `services/monero/xmr-bridge.js` Node servisi. Vercel/site kısmı zaten bulutta.

- **Ücretsiz mod (önerilen başlangıç):** localStorage + Task Scheduler'da bridge; Supabase yalnızca senkron kanalı (service role anahtarı bridge'de, tarayıcıdan asla).
- **VPS modu:** aynı bridge, `systemd` servisi; node+rpc+bridge tek makinede.

---

## 5. "Untrackable & Traceable" Nasıl Sağlanır

### Dışarıya gizlilik (untrackable)
1. **Kendi node'un** → adres-IP ilişkisi sızmaz.
2. **Fatura başına taze subaddress** → adres kümesi birbirinden ayrıştırılamaz (Monero subaddress'leri aynı hesabın bile olsa ilişkilendirilemez).
3. **View-only watch cüzdan** → harcama imkânı olmadığından bu servis ele geçirilse bile para taşınamaz; ayrıca görüntüleme anahtarı yalnız senin cüzdan dosyanda.
4. **wallet-rpc sadece loopback + şifre** → ağdan erişilemez.
5. İsteğe bağlı **Tor** → node IP'si gizlenir.
6. QR/adres paylaşımında müşteriye üçüncü taraf tarayıcı adresi (orn. block explorer) **ayrıştırma yapmadan** gösterilir (wallets.canmonero ayrıştırma yapar).

### Senin tarafında kayıt (traceable)
- `xmr_invoices` + `xmr_payments`: invoice_id, subaddress, tutar (EUR+XMR), kur, zaman, onay, tx hash.
- Admin panel: fatura listesi, ödeme durumu filtre, realtime toast, **CSV dışa aktarım**.
- Faturalar arası tutar mutabakatı (toplam gelir raporu).

---

## 6. Güvenlik Kontrolleri

- RPC kimlik bilgileri `.env`; service role anahtarı bridge'de (public içine asla).
- Supabase tabloları **RLS**: anon SELECT yok; yalnızca authenticated (admin) okur/yazar; bridge ise service role ile yazar.
- Money/eşik kontrolü: beklenenden **az/çok geldiyse** uyarı (over/under-pay alert) — `xmr_payments.amount_xmr` ile `xmr_invoices.amount_xmr` karşılaştır, ±%2 tolerans.
- Checkout yanıtında **expires_at** (örn. 30 dk) + kur toleransı.
- Tüm id'ler Supabase UUID; geçen veri yalnızca gerekli alanlar (adres, tutar) → şiralık veri yok.

---

## 7. Kod Mimarisi (hangi dosya ne iş yapar)

```
api/xmr/invoice.js      Vercel: fatura oluştur (paket → tam tutar, kur, havuzdan adres)  [POST, anon güvenli]
api/xmr/status.js       Vercel: invoice_id ile durum (pending → credited) — desk tarayıcı poll
api/xmr/rate.js         Vercel: XMR→EUR kuru (bellek cache, ör. 60 sn)
services/monero/xmr-bridge.js  Node: wallet-rpc poll, eşleştirme, onay, pool yenileme, Supabase yazma
services/monero/docker-compose.yml  (opsiyonel) monerod + wallet-rpc
services/monero/README.md      Windows/VPS kurulum adımları, cüzdan üretim, testnet test
supabase/schema-xmr.sql   xmr_address_pool, xmr_invoices, xmr_payments + RLS + realtime
pay/index.html (+tr/)     XMR ödeme kartı (tek tam-paket ödeme): QR (monero: URI), adres kopyala, durum poll
admin/index.html          XMR ödemeler bölümü: liste, realtime, CSV, tutar mutabakatı
```

Doğrulama akışılar iki katmanlı:
1. **Stagenet (XMR) end-to-end:** gerçek kavramlar (subaddress, integrated, confirmations) ücretsiz test ağında test edilir.
2. **Production:** yalnızca wallet-rpc + node, mainnet adresleriyle.

---

## 8. Senden Gerekli Olanlar (build'e başlamak için)

1. **Ana cüzdan**: `monero-wallet-cli` ile oluşturulacak/spend key offline. (İstersen adım adım yönlendireyim.)
2. **Makine kararı**: ücretsiz benim PC'm / VPS — bridge+node orada çalışacak.
3. **View key + primary address**: view-only cüzdan için (ana cüzdandan `address` ve `viewkey`'i export edersin) — bu kişisel; dosyada durur, repoya girmez.
4. **Kur kaynağı onayı**: CoinGecko public API yeterli mi (ücretsiz), yoksa kendi sağladığın kur mu kullanılacak.

---

## 9. Diğer Kripto Kanalı (NowPayments, crypto-direct)

Bu kanal, "müşteri BTC/ETH/USDT ile öder, para Monero cüzdanına düşer" akışını ekler. Kart ve banka havalesi bilinçli olarak yoktur (işletme doğrulaması gerektirir). Detaylı tasarım için `docs/card-payments.md`'e bak. Özet:

- Müşteri pay desk'te **Monero (XMR)** veya **diğer kripto** (BTC/ETH/USDT) seçer. İki yöntem de gizlidir, müşteriden üyelik/belge istenmez; hiçbir sayfada kart/banka ifadesi yoktur.
- `/api/card/order/` `{package_id, method:'crypto'}` → `channel='psp'` fatura + `card_orders` satırı + NowPayments `/v1/invoice` hosted checkout.
- Sağlayıcı ödemeyi `finished` görünce **çekim** (`/v1/withdrawal`, `pay_currency:'xmr'`) o faturanın popped subaddress'ine yapılır. `withdraw` fonksiyonu olan sağlayıcılarda `finished` **anında kredi vermez** — kredi her zaman xmr-bridge'in subaddress'teki onaylı XMR varışını görünce gelir.
- Mevcut **xmr-bridge**, `channel IN ('psp','card')` faturalarında **tutara bakmadan onaylanmış (10 onay) varışı kredi sayar** → fatura `credited` olur, SimpleX/admin bildirimi otomatiktir.
- `NOWPAYMENTS_API_KEY` tanımsızken `/api/card/order/` 503 `PROVIDER_NOT_CONFIGURED` döner; desk kripto panelinde "aktifleştiriliyor" notu gösterir ve Monero paneli çalışmaya devam eder.

---

## 10. Not (uyumluluk)

Bu tasarım finansal gizlilik sağlar (müşteri ödeme verisini korur + **senin kendi denetim kaydını otomatik oluşturur**). Yine de Monero ödemeleri kabul etmenin vergi bildirimi, KYC/AML ve belki ulusal düzenlemeleri sana ait; bridge gelir mutabakatını (tutar+ileşim kimliği+zaman) tam ürettiği için vergi/denetim tarafını da karşılar. Yapılandırma öncesi hukuki rehber önerilir.