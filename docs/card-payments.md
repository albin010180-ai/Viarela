# Viarela — Anonim Crypto-Direct Ödeme Mimarisi

Müşteri pay desk'te iki yöntemden birini seçer; **satıcıya ödeme her zaman yalnızca Monero (XMR)** olarak ulaşır. Şirket yok, KYC yok, kart/SEPA/banka havalesi yok.

1. **Doğrudan Monero:** Müşteri, `assets/pay.js`'in `/api/xmr/invoice/` ile ürettiği tek-kullanımlık subaddress'e XMR gönderir. Onay = 10 blok onayı, otomatik.
2. **Diğer kripto (NowPayments):** Müşteri BTC/ETH/USDT/LTC öder (merchant hesabı üzerinden; müşteri tarafında üyelik/KYC yok). Ödeme `finished` olduğunda biz **`POST /v1/withdrawal`** ile o faturanın popped subaddress'ine **XMR çekim** yaparız; xmr-bridge o subaddress'teki varışı görünce kredilendirir.

**Müşteri yüzü şunları görür:** Monero (XMR) paneli veya "diğer kripto" paneli — iki yöntem de gizlidir, üyelik/belge istemez. Hiçbir sayfa karttan, bankadan veya doğrulamadan bahsetmez.

## Akış

```
 A. Doğrudan Monero
  Müşteri → POST /api/xmr/invoice/ { package_id } → taze subaddress + QR
  Müşteri → XMR gönderir → xmr-bridge (10 onay) → status='credited'

 B. Diğer kripto (NowPayments)
  Müşteri → POST /api/card/order/ { package_id, method:'crypto', channel='psp' }
     │  pop_xmr_address → subaddress rezerve edilir
     ▼  NowPayments POST /v1/invoice → invoice_url (hosted checkout)
  Müşteri → BTC/ETH/USDT öder
     │  biz /v1/payment/{id} yoklarız → 'finished'
     ▼  POST /v1/withdrawal { payment_id, address: <subaddress>, pay_currency:'xmr' }
  xmr-bridge → subaddress'te XMR varışı (kanal psp: tutara bakmaz) → 10 onay → credited
```

`xmr_invoices.channel` kolonu: `xmr` (doğrudan) veya `psp` (NowPayments aracılı). Eski `card` değeri kodda toleransla `psp` gibi çalışır; shared status dayanmaz. Varsayılan `xmr`.

## Parçalar

- `card_orders`: `id, invoice_id, provider, provider_order_id, payment_url, fiat_amount, payout_address, status, last_provider_status, created_at, updated_at` (RLS: service_role only; realtime açık).
- `api/card/_providers/*` — sağlayıcı soyutlaması: `configInfo()`, `createOrder({payoutAddress, fiatAmount})`, `getStatus(orderId)`, opsiyonel `withdraw({orderId, payoutAddress})`. Varsayılan `nowpayments`; `changenow`/`guardarian` eski uyumluluk.
- `api/card/order.js` — POST `{package_id, method:'crypto'}`. Sağlayıcı yapılandırılmamışsa **503 PROVIDER_NOT_CONFIGURED** (adres pop edilmez). Fatura `channel='psp'`, stage `full`, +%3 güvenlik payı internal tahmin. Provider arızasında `voidInvoice`. Müşteri mesajları anonimdir ("Multi-crypto payments are being activated. Please pay with Monero for now.").
- `api/card/status.js` + `api/card/webhook.js` — finished/fail tespiti. **`withdraw` fonksiyonu olan sağlayıcılarda (NowPayments) 'finished' anında kredi verilmez:** önce çekim tetiklenir, kredi her zaman xmr-bridge'in gerçek XMR varışını görünce gelir. Krediyi webhook'a değil, kendi `getStatus`/bridge sonucuna bağlarız.
- `api/xmr/status.js` — pub desk poll ucu; `channel/'payment_url'/'card_status'` döner. psp+pending faturalarda sağlayıcıyı refresh eder.
- `assets/pay.js` — method toggle (monero default / crypto), i18n, `/api/card/config/` ile "aktifleştiriliyor" notu.
- `services/monero/xmr-bridge.js` — `channel IN ('psp','card')` faturaları 10 onayda, alınan tutara bakmadan kredilendirir (çekim zaten istenen tutarı basar).

## Mimari kararlar

1. **Kredi tek otorite:** NowPayments `finished` = "müşteri ödedi" demektir; "bizim cüzdanda" demek değildir. Kredi her zaman subaddress'e XMR'in düştüğünü gören bridge'den gelir. Böylece hesap üzerinde kalan bakiye ile karışmaz.
2. **Adres pop etme yalnızca sipariş gerçekten doğabilirse:** provider yapılandırılmamışsa havuz adresleri tüketilmez.
3. **Müşteri tarafında hiçbir doğrulama adımı yoktur:** doğrudan XMR zaten KYC'siz; NowPayments hosted invoice müşteriden üyelik/belge istemez. Bizden hiçbir yüzey kart/banka/SEPA isimleri içermez.

## Gereksinimler ve dürüst sınır

- **Satıcı tarafı tamamen anonim değildir:** NowPayments kripto-ödeme işlemcisidir; hesap açarken işletmenizi/kişinizi bir kez tanır ve ancak "fiat → kripto mutabakatlı işlem" yapar. Mutlak satıcı anonimliği için ödemeleri platformdan tamamen çıkaran akış (ör. saf doğrudan XMR) kalıcı varsayılan olmalıdır.
- Bidirectional: kripto onayı, vergi/KYC/AML yükümlülüklerini ortadan kaldırmaz; gelir mutabakatını bridge üretir, bildirim tarafı sana aittir.
- **Kart/SEPA seçeneği bilinçli kaldırıldı:** yasal olarak doğrulanmış işletme hesabı (ve standart fiat-PSP sözleşmesi) gerektirir; "satıcı hiç doğrulanmasın" ile birlikte kurgulanamaz.

## Env

| Anahtar | Açıklama |
|---|---|
| `CARD_PROVIDER` | `nowpayments` (varsayılan). |
| `CARD_SURCHARGE_PCT` | `fiat_amount` hesabına eklenen yüzde (onkdalık, ör. `0`). |
| `NOWPAYMENTS_API_KEY` | NowPayments API anahtarı. Boşsa `configured:false` → desk "aktifleştiriliyor" der, Monero paneli açık kalır. |

## Milestones

1. **API + desk (şu an):** monero + crypto panelleri yayında; key yok → crypto panelinde buton gizli + not; `/api/card/config/` → `{provider:'nowpayments', configured:false}`, `/api/card/order/` → 503 anon mesaj, `/api/xmr/invoice/` → 409 (`NO_ADDRESS_AVAILABLE`, havuz boş).
2. **Canlıya alma:** kullanıcı NowPayments hesabı/kurulumunu yapar; `NOWPAYMENTS_API_KEY` set → askıdaki uç nokta adları ve alan adları (invoice `payment_id`/`invoice_url`, `/payment/{id}`, `/withdrawal`) gerçek anahtarla doğrulanır; kripto paneli aktifleşir; sahte ödeme yerine hesap üzerinde düşük tutarlı E2E ile `credited` doğrulanır.
3. **Opsiyonel:** ikincil sağlayıcı aynı `_providers` arayüzüne takılır.