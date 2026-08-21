# Viarela

International marriage, family reunification & visa consultancy websitesi.
Statik HTML/CSS/JS + Vercel Serverless Function (`/api/cases`) + Supabase.

## Yapı

```
├── index.html              # EN ana sayfa
├── tr/                     # TR sayfalar (hizmetler, fiyatlar, ulkeler/...)
├── services/ pricing/ countries/ how-it-works/ about/
├── contact/ consultation/ success-stories/ faq/ legal/
├── assets/                 # styles.css, app.js, logolar, bayraklar
├── api/cases.js            # Vercel Function → Supabase'e case kaydeder
├── supabase/schema.sql     # case_assessments tablosu
├── vercel.json             # cleanUrls, cache, güvenlik header'ları
└── .env.example            # ortam değişkenleri şablonu
```

## Kurulum

### 1. Supabase
1. [supabase.com](https://supabase.com) → New Project
2. SQL Editor → `supabase/schema.sql` içeriğini çalıştır
3. Project Settings → API → `Project URL` ve `service_role` key'i kopyala

### 2. Vercel
1. [vercel.com](https://vercel.com) → Add New → Project → GitHub'dan `Viarela` reposunu seç
2. Framework Preset: **Other** (statik, build gerektirmez)
3. Environment Variables ekle:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
4. Deploy

> `service_role` key yalnızca sunucu tarafında (`api/cases.js`) kullanılır,
> istemciye asla gönderilmez. Tabloda RLS aktiftir, anon erişim yoktur.

### 3. Form akışı
Danışmanlık formu gönderildiğinde:
- Özet metin SimpleX için oluşturulur (mevcut akış korunur)
- Aynı veri `/api/cases` üzerinden `case_assessments` tablosuna kaydedilir
- Supabase tanımlı değilse form çalışmaya devam eder (sessiz fallback)

### 4. Domain
Vercel → Settings → Domains → `viarela.com` ekle, DNS kayıtlarını yönlendir.

## Yerel çalıştırma

```bash
npx vercel dev
# veya statik önizleme:
npx serve .
```
