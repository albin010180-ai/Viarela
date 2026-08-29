# Viarela — Monero (XMR) Bridge: Ücretsiz PC Kurulumu

Bu klasör, **tamamen ücretsiz modda** (kendi bilgisayarın) Monero ödemelerini otomatik onaylayan servisi içerir.
Sistem aynı zamanda VPS'te de çalışır (aynı kod, aynı senaryo).

Mimarinin tamamı için: `docs/monero-payments.md`

**Fikir:** Müşteri pay desk'ten benzersiz bir Monero subaddress'i + QR alır, XMR gönderir.
`monerod` işlemi kendi node'unda işler, `monero-wallet-rpc` (view-only) görür,
`xmr-bridge.js` Supabase'e "ödendi ✓" yazar, admin panel anında bildirim alır.
Para **sadece** ana cüzdanda kalır — hiçbir servis fonları harcayamaz.

---

## İhtiyaçlar
- **Windows 10/11** (veya VPS: Debian/Ubuntu)
- **Node.js LTS** — https://nodejs.org adresinden kurun
- **Monero CLI** — https://getmonero.org/downloads adresinden Windows indirin, `monero-wallet-cli.exe`, `monerod.exe`, `monero-wallet-rpc.exe` içerecek
- **Disk:** pruned node ~60-80 GB, RAM 4 GB+
- **Git** (yoksa repoyu ZIP indirin de olur)

---

## Adım 1 — Ana (final) cüzdanı oluştur
```
monero-wallet-cli.exe --generate-new-wallet viarela-main --subaddress-lookahead 2:500
```
- Güçlü parola belirt ve **güvenli yere not et**.
- `address` (ana adres) ve `viewkey` değerlerini kaydet — Adım 3'te gerek.

## Adım 2 — İzleme (view-only) cüzdanı oluştur
```
monero-wallet-cli.exe --generate-from-view-key viarela-watch
```
- Ana cüzdanın `address` + `viewkey`'ini gir, parola belirt.
- `viarela-watch` dosyası bridge'in tek dokunduğu cüzdandır (harcama anahtarı yok).

## Adım 3 — monerod (node) başlat
```
monerod.exe --prune-blockchain
```
- İlk senkronizasyon uzun sürer (disk + ağ hızına göre). Devam eder.
- Bu komut RPC'yi 127.0.0.1:18081'de dinler (dışarıya kapalı, istenen).

## Adım 4 — monero-wallet-rpc başlat
```
monero-wallet-rpc.exe --wallet-file viarela-watch --wallet-password PAROLA ^
  --rpc-login viarela:SIFREN --rpc-bind-port 18283 --daemon-address http://127.0.0.1:18081
```
- `--rpc-login` kullanıcı:şifre ikilisini mutlaka değiştir.

## Adım 5 — Bridge'i yapılandır
- `config.example.json` dosyasını `config.json` olarak kopyala.
- `supabaseServiceRoleKey`: Supabase Dashboard → Project Settings → API →
  `service_role` anahtarını yapıştır. **Bu dosya rehberin TAŞINMAZ;** repo'ya push etme
  (`.gitignore` bu klasörde `config.json`'ı zaten dışlar — emin ol).
- `wallet.rpcUrl`, `username`, `password` → Adım 4'teki değerler.

## Adım 6 — Havuzu doldur (tek seferlik)
```
$env:XMR_BRIDGE_SEED_ONLY='1'; node xmr-bridge.js
```
- Çıktıda `[pool] ... adres eklendi` görürsen tamam. Bu, 50 subaddress üretir ve Supabase'e yazar.
- Test: tarayıcıdan `/pay/` → "Monero faturası oluştur" → adres görünüyor olmalı.

## Adım 7 — Sürekli çalıştır
**En basit yol — Görev Zamanlayıcı (Task Scheduler):**
1. `services/monero/start.bat` dosyasını gözden geçir (3 pencere açar: node, wallet-rpc, bridge).
2. Görev Zamanlayıcı → Yeni Görev → "Bilgisayar açıldığında":
   - Program: `C:\Viarela\services\monero\start.bat`
   - "Kullanıcı oturum açmasa da çalıştır"
3. Bridge her 5 dk'da tarar; fatura 10 onay (≈20 dk) sonra "Ödendi" olur.

**Alternatif:** `node xmr-bridge.js`'i bir konsolda açık bırak (el ile).

---

## Stagenet (test) ile canlı hazırlık
Production'a geçmeden önce aynı akışı **stagenet**'te test edebilirsin (testleri copy:
- `monerod.exe --stagenet --prune-blockchain`
- `monero-wallet-rpc.exe ... --stagenet --daemon-address http://127.0.0.1:38081 --rpc-bind-port 18283 ...`
- `monero-wallet-cli.exe --stagenet --generate-new-wallet viarela-main-stage`
- Ücretsiz test XMR: https://stagenet.xmr.to/faucet/stagenet/ (stagenet adresine).
- Bridge kodu değişmez; Supabase faturaları test sırasında silinde temizlersin.

## Sık karşılaşılan sorunlar
- `create_address BAŞARISIZ` → wallet-rpc çalışmıyor veya rpc-login yanlış.
- `get_transfers BAŞARISIZ` → daemon senkron değil (ilk senkronizasyon bekle).
- Havuz boş ama node açık → bridge'i en az bir kez Adım 6 ile çalıştır.
- Q: `status=credited` görünmüyor, `partial` görünüyor → beklenen tutar ile gelen tutar
  %2'den fazla farklı; faturanın xmr tutarını kontrol et (kur payı +%3 ile hesaplanır).

## Güvenlik notları
- `config.json` içindeki service_role anahtarı ve wallet-rpc şifresi sadece bu makinede kalsın.
- wallet-rpc 127.0.0.1'e bağlı (dışarıdan erişilemez). Firewall'da 18283'ü açma.
- spend key ana cüzdanda offline; bridge yalnızca izler.