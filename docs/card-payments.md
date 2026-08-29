# Viarela — Kart (On-Ramp) Ödeme Mimarisi

Müşteri kredi kartıyla öder, para Viarela'nın Monero cüzdanına düşer. Amaç: müşteri kolaylığı (kart) + bizim taraf için para biriminin ve akışın Monero kalması.

## Akış

```
 Müşteri (pay desk, Kart sekmesi)
   │  POST /api/card/order/   { package_id }
   ▼
 provider (ChangeNOW v2, CARD_PROVIDER env)  → fiat (EUR) ödeme alır
   ▼  ChangeNOW, bizim havuzdan seçilen subaddress'e XMR basar (payoutAddress)
 xmr-bridge (services/monero)  → o subaddress'teki onaylanmış varışı görür
   │   channel='card' → kredi; 10 onay bekle, tutara bakma
   ▼
 Supabase xmr_invoices  → status='credited', admin toast + SimpleX otomatik
```

## Parçalar

- `xmr_invoices.channel` kolonu: `xmr` (doğrudan Monero) veya `card` (onramp). Varsayılan `xmr`.
- `card_orders` tablosu: `id`, `invoice_id`, `invoice_no`, `provider`, `provider_order_id`, `usd_amount`, `fiat_amount_eur`, `surcharge_pct`, `estimate_xmr`, `fx_rate`, `payout_address`, `provider_pay_url`, `provider_status`, `created_at`, `updated_at`. RLS: public read/write kapalı, service_role only. Realtime açık (admin panel canlı görsün diye).
- `api/card/_providers/*` — sağlayıcı soyutlaması: `configured`, `createOrder`, `getStatus`, `payUrlFor`. Şu an ChangeNOW + Guardarian stub.
- `api/card/order.js` — POST. Sağlayıcı yapılandırılmamışsa **503 PROVIDER_NOT_CONFIGURED** (adres pop edilmez, boşa subaddress yanmaz). Fatura `channel='card'`, stage `full`, +%3 güvenlik payı. Provider siparişi başarısız olursa `voidInvoice`.
- `api/card/status.js` — GET `?invoice_id=...`; sağlayıcıyı refresh eder, finished → kredi, failed → void.
- `api/card/webhook.js` — POST; siparişi `invoice_id` veya `provider_order_id` ile bulur; kendi `getStatus` çağrısını otorite sayar (webhook'a körü körüne güvenmez).
- `api/xmr/status.js` — `channel`/`payment_url`/`card_status` döner; card+pending faturalarda sağlayıcıyı refresh edip kredi/void tetikler. Pay desk bu uçtan yoklar.
- `services/monero/xmr-bridge.js` — `channel='card'` faturalar 10 onayda, alınan tutara bakmadan kredilendirilir (sağlayıcı zaten istenen tutarı basar; kısmi/eksik varış silme riskine seslenmez).

## Mimari kararlar

1. **Sağlayıcı kimliği webhook'ta değil, kendi sorgumuzda.** Webhook yalnızca "bak" der; kredi/void her zaman `getStatus` sonucuna bağlanır.
2. **Adres pop etme sadece sipariş gerçekten oluştuğunda.** 503 durumunda havuz adresleri hiç tüketilmez.
3. **USDT/TRC20 yok.** Kart = EUR fiat onramp → XMR. Tek ödeme, tam paket (stage her zaman `full`).

## Gereksinimler

- **ChangeNOW fiat on/off-ramp yalnızca kayıtlı şirket + KYB ile açılır** ("available upon request"). Kullanıcı ChangeNOW hesabı açıp KYB tamamlamadan `NOW_API_KEY` boş kalmalı.
- Anahtar verilince Vercel env'e ekle; site yeniden deploy olana kadar API 503 verir (zararsız fallback).

## Milestones

1. **API + DB (şu an):** schema live'da, uçlar yazıldı. Test: `/api/card/config/` → 200 `{provider:'changenow', configured:false}`, `/api/card/order/` → 503. Desk Monero akışı bozulmadan çalışır.
2. **Canlıya alma:** kullanıcı ChangeNOW KYB'yi tamamlar → `NOW_API_KEY` set → kart sekmesi aktif olur. Sahte gönderim yerine ChangeNOW test/tek-tık ödeme ile E2E doğrulanır (bridge aracılığıyla `credited`).
3. **Opsiyonel:** yedek sağlayıcı (ör. Guardarian) gerçek uygulama — aynı `_providers` arayüzüne takılır.

## Env

| Anahtar | Açıklama |
|---|---|
| `CARD_PROVIDER` | `changenow` (varsayılan). Boşsa kart kapalı demektir. |
| `CARD_SURCHARGE_PCT` | Kart pozunun payı (yüzde ondalık, ör. `0` veya `1.5`). Müşterinin `fiat_amount_eur` hesabına eklenir. |
| `NOW_API_KEY` | ChangeNOW v2 API anahtarı. Boşsa `configured:false` → 503 fallback. |