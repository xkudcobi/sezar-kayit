# Senaryo yazım rehberi

Her senaryo `senaryolar/<ad>.json` dosyasıdır. Çalıştırmak için:

```
npm run kayit -- <ad>             arka planda (görünmez)
npm run kayit -- <ad> --izle      Chrome penceresi açık, izleyebilirsiniz
npm run kayit -- <ad> --hiz=1.3   her şeyi %30 hızlı yapar
```

Çıktı `kayitlar/<ad>/` klasörüne yazılır: `ham.mp4` (temiz kayıt), `olaylar.json` (editörün kullanacağı günlük), `senaryo.json` (kaydın hangi senaryodan çıktığı). Bir adım takılırsa kayıt durur, `hata.png` ekran görüntüsü bırakılır ve o ana kadarki kısım yine videoya yazılır.

## Dosyanın yapısı

```json
{
  "ad": "ana-panel",
  "gorunum": "masaustu",
  "adres": "http://localhost:3001",
  "gizle": ["[data-asistan-balonu]"],
  "hazirlik": [ { "tur": "giris", "hesap": "demo" } ],
  "adimlar": [ ... ]
}
```

| Alan | Açıklama |
|---|---|
| `ad` | Küçük harf, rakam, tire. Kayıt klasörünün adı olur. |
| `gorunum` | `masaustu` (1920x1080), `masaustu-net` (3840x2160, yakınlaştırmada net kalır ama kayıt daha az akıcı), `telefon` (390x844 mobil, 1170x2532 çıktı) |
| `adres` | Göreli adreslerin (`/uyarilar`) başına eklenen ana adres |
| `gizle` | Videoda görünmesin istenen öğelerin CSS seçicileri |
| `hazirlik` | Kayıt başlamadan yapılacaklar (giriş, sayfa açma). Videoya girmez. |
| `adimlar` | Videoya giren adımlar |
| `basBekleme`, `sonBekleme` | Kaydın başında/sonunda durgun bekleme (sn, varsayılan 0.6 / 0.8) |

## Öğe nasıl gösterilir (`oge`)

| Yazım | Anlamı |
|---|---|
| `text=Kaydet` | Üzerinde "Kaydet" yazan en küçük öğe |
| `tour=bugun` | Sezar'daki `data-tour="bugun"` işaretli öğe (en sağlam yol) |
| `input[name=ad]` | Düz CSS seçici |

## Adımlar

| tur | Alanlar | Ne yapar |
|---|---|---|
| `git` | `adres`, `bekle?` | Sayfayı açar; `bekle` verilirse o öğe görünene kadar bekler |
| `tikla` | `oge`, `sonra?` | Fareyi öğeye götürüp tıklar. Ekranda değilse önce kaydırır. `sonra`: tıktan sonra bekleme (sn, 0.6) |
| `yaz` | `oge`, `metin`, `hiz?`, `temizle?` | Alana tıklar, harf harf yazar. `hiz`: harf başına ms (65). `temizle: true` önce alanı boşaltır |
| `tus` | `tus` | Tuşa basar: `Enter`, `Escape`, `Tab`… |
| `kaydir` | `piksel` ya da `oge`, `sure?` | Yumuşak kaydırma. `piksel` eksiyse yukarı. `oge` verilirse o öğeyi ortalar |
| `uzerineGel` | `oge`, `sonra?` | Fareyi öğenin üstüne getirir (açılır menüler için) |
| `bekle` | `ogeGorunene` / `ogeKaybolana` / `adresIcerir` / `sure` | Koşul gerçekleşene kadar bekler (en çok 15 sn; `zamanAsimi` ile değişir, ms) |
| `duraklat` | `sure` | Hiçbir şey yapmadan bekler (sn) |
| `altyazi` | `metin`, `sure?`, `bekleyerek?` | **Videoya bir şey yazmaz.** Editör bu metni o anda altyazı olarak önerir. `bekleyerek: true` süre kadar durur |
| `vurgu` | `oge`, `sure?`, `bicim?` | **Videoya çizmez.** Öğenin yerini günlüğe yazar ve `sure` kadar bekler; editör vurguyu çizer |
| `yakinlas` | `oge`, `oran?`, `sure?` | **Videoya uygulamaz.** Editör o öğeye `oran` kadar yaklaşmayı önerir |
| `giris` | `hesap?` | Sezar giriş sayfasında `veri/hesaplar.json` içindeki hesapla oturum açar (genelde `hazirlik` içinde) |
| `fareyiGizle` | — | Editörde imleç bu noktadan sonra gizlenir |

Her adıma `not` (kendi açıklamanız) ve `zamanAsimi` (ms) eklenebilir.

## Sezar demo sunucusu

Sezar ekranları ayrı bir demo sunucusunda çekilir (`http://localhost:3005`):
- Kod: Sezar'ın ayrı kopyası `C:\dev\sezar-video` (git worktree). Sizin `C:\dev\sezar` klasörünüze ve 3000'deki sunucunuza dokunulmaz; siz kodu değiştirirken videolar bozulmaz.
- Veri: uydurma "Sezar Müzik Akademisi". Her sıfırlamada temiz yedekten (`pglite-yedek-video-2026-11-02`, yalnız okunur) `C:\dev\sezar-video-veri\pglite-video` klasörüne kopyalanır.
- Saat: sunucu ve sayfa **2 Kasım 2026 Pazartesi 10:00**'dan başlar (veri o güne göre üretildi). Ayarı `veri/demo.json`.
- E-posta ayarı yok: demo sunucusu gerçek e-posta göndermez.

```
npm run demo -- sifirla     veriyi temizle + sunucuyu aç
npm run demo -- kapat       veritabanını düzgün kapatıp sunucuyu durdur
npm run demo -- durum
npm run kayit -- sezar-bugun --sifirla    her kayıttan önce sıfırla (veri yazan senaryolar için şart)
```

Senaryoda `"adres": "http://localhost:3005"` ve hazırlıkta `{ "tur": "giris", "hesap": "demo" }` yeterli: giriş, kurum seçimi (hesaplar.json'daki `kurum`) ve sözleşme onay ekranı otomatik geçilir.

Sezar'da videoda genelde gizlenenler (`gizle` alanına):

| Seçici | Ne |
|---|---|
| `.nst` | Sağ üstteki bildirim yığını |
| `.sezar-ipucu` | Asistanın "Yoklaması girilmemiş…" gibi ipucu kutusu |
| `.sezar-asistan` | Sağ alttaki Sezar asistanı (asistan videosunda gizlemeyin) |

Yeni sayfa ilk açıldığında derlenir ve birkaç saniye bekletir. Videoda kullanacağınız sayfaları hazırlıkta bir kez açın (örnek: `senaryolar/sezar-bugun.json`).

Demo kodunu Sezar'ın son hâline getirmek için (sunucu kapalıyken):
```
git -C C:/dev/sezar-video checkout --detach main
```
ve ardından `C:\dev\sezar-video` içinde `pnpm install`. Yerel CSS ayarı (layout/next.config) o kopyada işaretli kalır; çakışma çıkarsa birlikte bakalım.

## İpuçları

- Giriş ve ilk sayfa yüklemesini `hazirlik` içine koyun; video doğrudan hazır ekranla başlar.
- Sabit `duraklat` yerine `bekle` kullanın: yavaş yüklenen sayfada kayıt bozulmaz.
- Gerçek kişi verisi kullanmayın. Demo kurum ve uydurma adlarla çekin.
- Hesap bilgileri `veri/hesaplar.json` dosyasında durur (git'e girmez). Örneği: `veri/hesaplar.ornek.json`.

## Editör

```
npm run editor          tarayıcıda http://localhost:4600 açılır
npm run editor:sessiz   tarayıcıyı açmadan
```

Yukarıdaki listeden kaydı seçin. Ham video hiç değişmez: düzenlemeler `kayitlar/<ad>/proje.json` dosyasına otomatik kaydedilir, dışa aktarınca `cikti/<ad>-<tarih-saat>.mp4` üretilir.

| Ne | Nasıl |
|---|---|
| Oynat / durdur | Boşluk ya da ▶ |
| Kare kare | ← → (Shift ile 1 sn) |
| Böl | Oynatıcıyı yere getirip **S** ya da ✂ Böl |
| Bölüm sil | Bölüme tıklayıp **Del** |
| Kırp | Bölümün kenarını sürükleyin, ya da oynatıcıyı yere getirip **I** (başı buraya) / **O** (sonu buraya) |
| Hız | Sağ panelde 0.5x – 3x |
| İmleç | Sağ panelde göster/gizle, boyut, tık halkası |
| Geri al / yinele | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) |
| Dışa aktar | Sağ üstte **Dışa aktar (MP4)**; bitince "Klasörde göster" |

### Katmanlar: altyazı, vurgu, yakınlaştırma

Yeni bir kayıt editörde ilk açıldığında senaryodaki `altyazi`, `vurgu` ve `yakinlas` adımları **kendiliğinden** katman olarak gelir. Daha önce açılmış bir kayıtta sağ paneldeki **Senaryodan doldur** eksikleri ekler (eklenmiş olanı tekrar eklemez).

| Katman | Ekleme | Ayarlar |
|---|---|---|
| Altyazı | **+ Altyazı** (oynatıcının olduğu yere) | Metin; tüm altyazılar için görünüm (koyu / açık / mor), altta / üstte, boyut |
| Vurgu | **+ Vurgu**, sonra oynatıcıda alanı sürükleyerek çizin | Çerçeve ya da çevreyi karartma; **Oynatıcıda yeniden çiz** |
| Yakınlaştırma | **+ Yakınlaştırma**, sonra oynatıcıda merkeze tıklayın | Yakınlık 1.1x–3x, geçiş süresi, **İmleci izle** |

- Katmanlar zaman çizelgesinde kendi satırlarında durur: bloğu sürükleyerek taşıyın, kenarından uzatıp kısaltın, seçip **Del** ile silin.
- Katmanlar kayıttaki ana bağlıdır: videoyu kesip hızlandırsanız da içeriğin üstünde kalır; kesilen kısımdaki katman görünmez.
- Yakınlaştırmada görüntü kenarı ekran dışına taşmaz; giriş ve çıkış yumuşaktır. Önizleme bilgisayara göre takılabilir, dışa aktarılan video kare kare üretildiği için akıcıdır.
- Altyazı ekrana sabittir (yakınlaştırmayla büyümez); vurgu ve imleç görüntüyle birlikte büyür.

### Çıkış, kartlar, müzik

**Çıkış (sağ panel)**
- *Önizleme oranı*: 16:9 (yatay: site, YouTube), 4:5 (LinkedIn akışı), 9:16 (dikey).
- *Kayıt orana uymazsa*: **Tamamını göster** (kayıt ortada, boşluk Sezar moru ya da kaydın bulanık kopyası) ya da **Kırp** (kadraj imleci izler ya da oynatıcıda seçtiğiniz yere ortalanır).
- Telefon kayıtları istenirse telefon çerçevesi içinde gösterilir (her oranda).
- Dışa aktarırken üst çubukta istediğiniz oranları işaretleyin; hepsi sırayla üretilir: `cikti/<ad>-16x9-<tarih>.mp4`, `-4x5-`, `-9x16-`.

**Kartlar**: giriş ve kapanış kartını açın; başlık, alt satır, tema (mor / koyu / açık), logo ve süre ayarlanır. Kart videoya 0,4 sn'lik yumuşak geçişle bağlanır. Zaman çizelgesinde videonun başında ve sonunda mor blok olarak görünür.

**Müzik**: *Müzik dosyası ekle…* ile kendi dosyanızı seçin (mp3, wav, m4a, aac, ogg; en çok 60 MB); `muzik/` klasörüne kopyalanır (git'e girmez). Ses düzeyi, başta açılma, sonda kısılma ve müziğin hangi saniyesinden başlanacağı ayarlanır; müzik videodan kısaysa başa dönerek çalar. **Telifli müzik kullanmayın**: LinkedIn ve YouTube telifli müziği kaldırabilir ya da sessize alabilir.

Dışa aktarma bu bilgisayarda oran başına yaklaşık 1–1,5 dakika sürüyor (16 sn'lik video, kartlar dahil).
