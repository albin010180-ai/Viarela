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

## Yine geçerli dürüst sınır

Saf doğrudan XMR, para kabulünün en yüksek gizlilik ve sıfır doğrulama seviyesidir; ancak kripto gelirinin vergi bildirimi/KYC-AML yükümlülüğü işletene aittir ve bridge ürettiği mutabakatla (tutar+bağlantılı subaddress+zaman) denetim tarafını karşılar.