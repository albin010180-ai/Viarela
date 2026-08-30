# Viarela — Ödeme Kanalı Karar Kaydı

Karar: **Saf Monero (XMR).** Kart/SEPA/banka havalesi ve tüm PSP (NowPayments/ChangeNOW/Guardarian) katmanları **kaldırıldı**, çünkü herhangi bir ödeme işlemcisi alıcı hesabını açılışta doğrular (KYC/KYB) — kripto-işlemciler bile. "Hiçbir yerde hesap yok, KYC yok" ancak **self-custody doğrudan kripto** ile mümkündür; gizlilik de ancak Monero ile sağlanır (BTC/ETH/USDT alacaklı zincirlerdir).

## Nihai akış

```
 Müşteri (pay desk — tek kanal: Monero)
   │  POST /api/xmr/invoice/ { package_id }
   ▼
 fatura: EUR→XMR (+%3 güvenlik payı), 30dk geçerli, havuzdan taze subaddress
   │  QR + adres + kur gösterilir (pay.js; /api/xmr/status/ ile poll)
   ▼
 Müşteri istediği Monero cüzdanından tam tutarı gönderir
   ▼
 xmr-bridge (services/monero): subaddress'teki varış; tutar eşleşirse (≤%2)
   + 10 onay → xmr_invoices.status='credited'
   ▼
 SimpleX kutunu güncellenir + admin canlı toast bildirir
```

Tek kanaldır; müşteri hiçbir doğrulama/belge görmez, hesap/üyelik yok. Bütün altyapı `docs/monero-payments.md`'te.

## Kaldırılan parçalar ve geride kalanlar

- `api/card/` dizini (order/status/webhook/config/_providers) silindi; `/api/card/config/` ve `/api/card/order/` artık **404** döner.
- `api/xmr/status.js` yeniden yalın rapor ucu oldu (kredi/void tetiklemez; krediyi yalnızca bridge verir).
- `xmr-bridge.js` yeniden tutar-eşleşmeli krediye döndü (PSP toleransı yok; her fatura doğrudan XMR'dir).
- Vercel env `CARD_PROVIDER`, `CARD_SURCHARGE_PCT` silindi. `NOWPAYMENTS_API_KEY`, `NOW_API_KEY` hiç set edilmedi. Eklenecek env aramadınız.
- `supabase/schema-card.sql` tarihsel kayıt olarak durur; canlıda `xmr_invoices.channel` kolonu (`default 'xmr'`) ve boş `card_orders` tablosu zararsızdır, hiçbir kod yüzeyi tarafından kullanılmaz.
- Admin `chLabel` yalnızca görsel geriye-dönük eşleme tutar (`xmr` → "XMR", eski `card`→"Kart", `psp`→"Kripto"); toast Monero'ya özeldir.

## Alıcının kart/banka (cc-IBAN) erişimi — satıcı KYC'siz

Alıcı kart ya da IBAN ile ödemek istiyorsa tek yasal ve satıcıyı KYC'siz tutan yol **alıcı-taraflı satın alımdır**:

- Alıcı, kendi borsasında (Kraken/Bitvavo/Binance vb.) kartı veya IBAN'ıyla tam XMR tutarını alır. Borsa hesabı alıcının kendisine aittir; doğrulama varsa orada, asla bizde yapılmaz.
- Alıcı, XMR'i faturadaki adrese **P2P çekim** yapar. Ödeme asla bir PSP/üçüncü taraf hesabımızdan geçmez.
- Onay mevcut pipeline ile otomatiktir: bridge subaddress'teki varışı görür → 10 onay → `credited` → SimpleX/admin.
- Desk'teki "Kredi kartı veya banka havalesiyle öde?" akordeonu bunu 3 adımda anlatır; FAQ/SSS'te aynı karşılık verilir.

**Neden üçüncü taraf widget/on-ramp değil:** kart/IBAN on-ramp sağlayıcıları entegrasyon için işletme hesabı/KYB ister ve widget'ta para genellikle işletmenin mutabakatlı hesabına düşer — "satıcı hiçbir yerde doğrulanmaz" şartını bozar. Saf P2P XMR akışı bu şartı garantiler.

## Yine geçerli dürüst sınır

Saf doğrudan XMR, para kabulünün en yüksek gizlilik ve sıfır doğrulama seviyesidir; ancak kripto gelirinin vergi bildirimi/KYC-AML yükümlülüğü işletene aittir ve bridge ürettiği mutabakatla (tutar+bağlantılı subaddress+zaman) denetim tarafını karşılar.