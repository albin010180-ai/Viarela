# Viarela — Monero (XMR) Köprüsü: Kurulum Runbook'u

Bu klasördeki yazılım, ödeme desk'inin açtığı Monero faturalarını **otomatik onaylar**.
Kod, veritabanı şeması ve web uygulaması **tamamlanmış ve canlıda**. Geriye kalan tek parça:

> **Senin ana cüzdanın.** Aşağıdaki adımlarla onu oluştur, gözcü (view-only) cüzdanı kur,
> `npm run seed` ile adres havuzunu doldur; ödemeler kendiliğinden çalışır.

Mimari ve sistem dosyaları için: `docs/monero-payments.md`

**Fikir:** Müşteri pay desk'ten benzersiz bir Monero subaddress'i + QR alır, XMR gönderir.
`monerod` işlemi ağdan doğrular, `monero-wallet-rpc` (view-only) görür, `xmr-bridge.js`
Supabase'e "ödendi ✓" yazar, admin panel anında bildirim alır.
Para **sadece** ana cüzdanda kalır; köprü harcayamaz (spend key yok).

---

## 0. Ön koşullar

- **Windows 10/11** (veya VPS: Debian/Ubuntu)
- **Node.js LTS** — https://nodejs.org
- **Monero CLI** — https://getmonero.org/downloads → `monero-wallet-cli.exe`, `monerod.exe`, `monero-wallet-rpc.exe`
- **Disk:** kendi node'un 60–80 GB ister (pruned). Disk sıkıntıysa **uzak node** kullan — Bölüm 5'te alternatif var (tavsiye: gizlilik için kendi node'un).

---

## 1. Ana (final) cüzdanı oluştur

```
monero-wallet-cli.exe --generate-new-wallet viarela-main --subaddress-lookahead 2:500
```

- Güçlü parola belirt; **mnemonic + parolayı güvenli yere not et** (tek kopya bu; kaybolursa fonlar erişilemez).
- Çıktıdaki `address` (ana adres) ve `viewkey` değerlerini kaydet — Adım 2'de gerek.
- Ana cüzdan **soğuk**: köprü bu cüzdana asla bağlanmaz. Para burada birikir.
- **Bu sistemin nihai alıcı cüzdan adresi** (config.json `mainAddress`):

  ```
  88hLyRVCjnE4g4HDWvjJg18pRtBGwii4gcELXEAPJz4KCGnTfdF4kmUYgJqGg35UgiUSF7dcK35AyNYQFjhHbdzSQ3UrJTg
  ```

  (ana ağ subaddress — geçerli, checksum doğrulandı). Adım 4'te bağladığın view-only cüzdan **bu cüzdanın** ikizi olmalı; `npm run doctor` bunu otomatik doğrular.

---

## 2. Gözcü (view-only) cüzdanı oluştur

```
monero-wallet-cli.exe --generate-from-view-key viarela-watch
```

- Adım 1'deki `address` + `viewkey`'i gir, parola belirt.
- `viarela-watch` dosyası, köprünün **dokunduğu tek cüzdandır** (harcama anahtarı yok → fon riski sıfır).

---

## 3. monerod — node başlat

Kendi node'un (tavsiye, ilk senkron uzun sürer; arka planda bırak):

```
monerod.exe --prune-blockchain
```

- RPC'yi `127.0.0.1:18081`'de dinler (dışarıya kapalı — istenen).
- İlk senkronizasyon disk+ağ hızına göre saatler sürebilir; bu sırada `get_transfers` hata verir. Bekle.

---

## 4. (Disk yoksa) Uzak node kullan

monerod'a gerek yok; wallet-rpc'i doğrudan public bir node'a bağla:

```
monero-wallet-rpc.exe ... --daemon-address http://node.moneroworld.com:18081
```

- Alternatif public node: `http://xmr.llcoins.net:18081`
- Gizlilik notu: ödeme, gönderdiğin node sağlayıcısına görünür olabilir. Kalıcı kullanımda kendi node'un daha güvenli.

---

## 5. monero-wallet-rpc başlat

```
monero-wallet-rpc.exe --wallet-file viarela-watch --wallet-password PAROLA ^
  --rpc-login viarela:SIFRE --rpc-bind-port 18283 --daemon-address http://127.0.0.1:18081
```

- `PAROLA` = viarela-watch parolası; `SIFRE` = RPC oturum parolası (3. şahıs tahmin edemezsin).
- Uzak node kullanıyorsan `--daemon-address` değerini Bölüm 4'tekiyle değiştir.
- `start.bat` içerisindeki `PAROLA`/`SIFRE` değerlerini de aynı şekilde güncelle.
- `--rpc-login`'deki kullanıcı:şifre ikilisi config.json'daki `wallet.username`/`wallet.password` ile **aynı** olmalı.

---

## 6. config.json

```
copy config.example.json config.json
```

- `supabaseServiceRoleKey` → Supabase Dashboard → Project Settings → API → `service_role` anahtarı.
- `wallet` → Adım 5'teki `rpcUrl`/`username`/`password`.
- Diğer alanlar (genelde değiştirme): `confirmations: 10` (≈20 dk), `pollIntervalSec: 300` (5 dk tarama),
  `poolTarget: 50` / `poolMin: 10` (havuz aralığı).
- **Bu dosya TAŞINMAZ:** `.gitignore` `services/monero/config.json`'ı dışlar; repo'ya asla push etme.

---

## 7. Kontrol: doctor

```
npm run doctor
```

Hangi parçanın eksik olduğunu tek tek söyler (config → Supabase → havuz → wallet-rpc → adres eşleşmesi).
`mainAddress`'i bağladığın cüzdana karşı `get_address_index` ile doğrular — yanlış cüzdan
bağlandıysa açıkça `[EKSİK]` der. Her şey `[OK]` verene kadar yukarıdaki adımları tamamla.

---

## 8. Havuzu doldur (tek seferlik)

```
npm run seed
```

- Köprü 50 subaddress üretir, Supabase'e yazar, sonra çıkar (seed-only mod).
- `[pool] 50 adres eklendi` görürsen hazır. (İstersen: `set XMR_BRIDGE_SEED_ONLY=1 && node xmr-bridge.js`)
- Test: tarayıcıdan `/pay/` → "Monero faturası oluştur" → adres + QR görünür, fatura açılır.

> Önemli: Müşteriler her faturada **kendi subaddress'ine** öder (adres eşleşmesi sayesinde otomatik onay çalışır).
> `mainAddress` bir "nihai alıcı adresi"dir; tek tek faturalara hedef yapılmaz — yapılsaydı
> hangi faturaya geldiği ayırt edilemezdi. Tüm subaddress'ler aynı cüzdana aktığı için para yine aynı anda birikir.

---

## 9. Sürekli çalıştır

**En basit yol — Görev Zamanlayıcı (Task Scheduler):**

1. `services/monero/start.bat` içindeki şifreleri güncelle (Adım 5).
2. Görev Zamanlayıcı → Yeni Görev → tetikleyici "Bilgisayar açıldığında", "Kullanıcı oturum açmasa da çalıştır" → program `C:\Viarela\services\monero\start.bat`.
3. Bridge her 5 dk'da tarar; fatura **10 onay** sonra "Ödendi" olur (≈20 dk). Ödeme göründüğünde `[scan] fatura N: X/10 onay` logları çıkar.

**Alternatif Yol — Docker (VPS):** `docker-compose up -d` (monerod + wallet-rpc + bridge); havuz için
`docker-compose run --rm seed`. Önce `./data/watch/` içine watch cüzdan dosyalarını kopyala.

**Alternatif — el ile:** `node xmr-bridge.js`'i bir konsolda açık bırak.

---

## Stagenet (test) ile canlı öncesi deneme

Production canlıya geçmeden önce aynı akışı stagenet'te test edebilirsin:

- Cüzdanlar: `monero-wallet-cli.exe --stagenet --generate-new-wallet viarela-main-stage`
- Node: `monerod.exe --stagenet --prune-blockchain` (port 38081)
- RPC: `monero-wallet-rpc.exe ... --stagenet --wallet-file viarela-watch-stage --rpc-bind-port 18283 --daemon-address http://127.0.0.1:38081`
- Ücretsiz test fonu: https://stagenet.xmr.to/faucet/stagenet/ (stagenet adresine gönderin)
- Köprü kodu **değişmez**; test faturaları Supabase'den sil, test bittiğinde gerçek cüzdana geç, `npm run seed`.

---

## Sık karşılaşılan sorunlar

- `create_address BAŞARISIZ` → wallet-rpc çalışmıyor ya da rpc-login/şifre yanlış (Adım 5–6).
- `get_transfers BAŞARISIZ` → daemon senkron değil ya da uzak node erişilemiyor (Adım 3–4).
- Havuz boş ama node açık → `npm run seed` (Adım 8).
- Fatura `partial` görünüyor → gelen tutar beklenenin %2'sinden fazla sapmış; faturanın `amount_xmr`'ını
  kontrol et (kur +%3 güvenlik payıyla hesaplanır; tam tutarı gönder).
- **Geç ödeme:** yaşam döngüsü dolmuş (`expired`) faturaya sonradan ödeme gelirse sistem kredilendirmez;
  adres bir daha kullanılmaz (emekliye ayrılır — kazara çapraz eşleşme değildir). Fonlar ana cüzdanda durur;
  varsa müşteriye manuel halledersin (Monero iadesi yoktur).
- İlk senkronizasyon bitmeden ödeme açılırsa: bekleyen ödemeler `in` listesine girince otomatik sayılır;
  `confirmations` doğruysa 10 onayda kredilendirilir.

---

## Güvenlik notları

- `config.json` içindeki service_role anahtarı ve RPC şifresi **yalnızca bu makinede** kalır; repo'ya girmez.
- wallet-rpc `127.0.0.1`'e bağlı — firewall'da 18283/18081 dışa açma.
- Ana cüzdan soğukta kalır (spend key offline); köprü yalnızca izler, harcayamaz.
- `npm run doctor`'dan sonra `[OK]` olmayan yaşam döngüsü yoksa, sistem fiilen yayında demektir.