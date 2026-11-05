# Sezar ekran kaydı

Elle yazılmış bir senaryoya göre Sezar'ı tarayıcıda gezip kaydeder. Yapay zekâ yok: aynı senaryo aynı kaydı üretir.

```
npm install
npm run kayit -- test-form          (yerel test sayfası, internet gerekmez)
npm run kayit -- site-tanitim       (sezars.com, yalnız okur)
npm run kayit -- site-telefon --izle
npm run kayit -- sezar-bugun --sifirla   (Sezar demo sunucusu, bkz. ADIMLAR.md)
npm run editor                           (düzenleme ekranı: http://localhost:4600)
```

Senaryo yazımı: [senaryolar/ADIMLAR.md](senaryolar/ADIMLAR.md). Plan ve aşamalar: `Desktop\yönetici paneli\EKRAN-KAYIT-PLANI.md`.

Gerekenler: Node 20+, ffmpeg (PATH'te), Google Chrome.

## Nasıl çalışır

1. `motor/calistir.mjs` senaryoyu doğrular, Chrome'u açar, `hazirlik` adımlarını kayıtsız yapar.
2. `motor/kaydedici.mjs` Chrome'dan zaman damgalı kareleri alır (`Page.startScreencast`); kayıt bitince ffmpeg ile 30 fps MP4'e birleştirir. Böylece video zamanı olay günlüğüyle birebir eşleşir.
3. `motor/adimlar.mjs` her adımı uygular ve günlüğe yazar: fare yolu, tıklamalar, yazılan metin, kaydırmalar, öğe kutuları.
4. Video temizdir: imleç, altyazı, vurgu, yakınlaştırma sonradan editörde eklenir.
5. `editor/` düzenleme ekranıdır (`npm run editor`). Önizleme `@remotion/player`, dışa aktarma `@remotion/renderer` ile aynı bileşenden (`editor/ortak/Kompozisyon.tsx`) yapılır; ikisi birebir aynı görünür.

Not: Remotion bireyler ve en çok 3 kişilik şirketler için ücretsizdir; daha büyük ekipte şirket lisansı gerekir (remotion.dev/license).
