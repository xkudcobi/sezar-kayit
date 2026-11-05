// Senaryoyu çalıştırır ve kaydeder.
// Kullanım: npm run kayit -- <senaryo> [--sifirla] [--izle] [--hiz=1.2] [--kareleri-tut]
//   --sifirla       Önce demo sunucusunun verisini temiz yedekten geri yükler (bkz. motor/demo.mjs)
//   --izle          Chrome penceresi görünür açılır (varsayılan: arka planda, görünmez)
//   --hiz=1.2       Tüm bekleme ve hareketleri hızlandırır/yavaşlatır
//   --kareleri-tut  Ham kareleri silmez (hata ayıklama için)
// Çıktı: kayitlar/<ad>/ham.mp4 + olaylar.json (+ hata.png hata olursa)
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { senaryoYukle, GORUNUMLER } from "./senaryo.mjs";
import { ADIMLAR } from "./adimlar.mjs";
import { Fare, tohumluRastgele } from "./fare.mjs";
import { Kaydedici } from "./kaydedici.mjs";
import { ayarlar as demoAyarlari, durumOku as demoDurumu, sifirla as demoSifirla } from "./demo.mjs";

const KOK = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME_YOLLARI = [
  process.env.CHROME_YOLU,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);
const MOBIL_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

// Videoda görünmemesi gerekenler: Next geliştirici rozeti ve geçici bildirimleri.
const VARSAYILAN_GIZLE = ["nextjs-portal", "[data-nextjs-toast]", "[data-next-badge-root]"];

const argv = process.argv.slice(2);
const ad = argv.find((a) => !a.startsWith("--"));
const bayrak = (b) => argv.includes(`--${b}`);
const deger = (b) => argv.find((a) => a.startsWith(`--${b}=`))?.split("=")[1];

if (!ad) {
  console.log("Kullanım: npm run kayit -- <senaryo-adı> [--izle] [--hiz=1.2] [--kareleri-tut]");
  process.exit(1);
}

let yuklenen;
try {
  yuklenen = senaryoYukle(ad, KOK);
} catch (e) {
  console.error(`\n✖ ${e.message}\n`);
  process.exit(1);
}
const { senaryo, yol: senaryoYolu, uyarilar } = yuklenen;
for (const u of uyarilar) console.warn(`! ${u}`);

const gorunum = GORUNUMLER[senaryo.gorunum];
const hiz = Number(deger("hiz") ?? senaryo.hiz ?? 1);
const izle = bayrak("izle");
const klasor = path.join(KOK, "kayitlar", senaryo.ad);
mkdirSync(klasor, { recursive: true });

const hesapDosyasi = path.join(KOK, "veri", "hesaplar.json");
const hesaplar = existsSync(hesapDosyasi) ? JSON.parse(readFileSync(hesapDosyasi, "utf8")) : {};

const chrome = CHROME_YOLLARI.find((y) => existsSync(y));
if (!chrome) {
  console.error("✖ Chrome bulunamadı. CHROME_YOLU ortam değişkeniyle yolunu verin.");
  process.exit(1);
}

// Senaryo demo sunucusunu kullanıyorsa: istenirse veriyi sıfırla, sayfanın saatini sunucununkine eşitle.
const demo = demoAyarlari();
const demoKullaniliyor = !!senaryo.adres && new URL(senaryo.adres).port === String(demo.port);
if (bayrak("sifirla")) {
  if (!demoKullaniliyor) {
    console.error(`✖ --sifirla yalnız demo sunucusunu (${demo.adres}) kullanan senaryolarda geçerli.`);
    process.exit(1);
  }
  console.log("● demo verisi sıfırlanıyor");
  try {
    await demoSifirla();
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
}
const saatKaymasi = demoKullaniliyor ? demoDurumu()?.kayma ?? null : null;
if (demoKullaniliyor && saatKaymasi === null) {
  console.error(`✖ Demo sunucusu açık değil. Önce: npm run demo -- sifirla (ya da --sifirla ile çalıştırın).`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: !izle,
  defaultViewport: null,
  args: [
    "--hide-scrollbars",
    "--disable-features=Translate",
    // Ekran kaydı kareleri yalnız setViewport'taki ölçekle büyümüyor; tarayıcının kendisi de o ölçekte çizmeli.
    `--force-device-scale-factor=${gorunum.olcek}`,
    // --izle modunda pencere arkada kalsa da sayfa yavaşlamasın, ekran kaydı kare üretmeye devam etsin.
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    `--window-size=${gorunum.genislik + (izle ? 16 : 0)},${gorunum.yukseklik + (izle ? 140 : 0)}`,
  ],
});

const page = (await browser.pages())[0] ?? (await browser.newPage());
await page.setViewport({
  width: gorunum.genislik,
  height: gorunum.yukseklik,
  deviceScaleFactor: gorunum.olcek,
  isMobile: gorunum.mobil,
  hasTouch: gorunum.mobil,
});
if (gorunum.mobil) await page.setUserAgent(MOBIL_UA);

const gizleCss = [...VARSAYILAN_GIZLE, ...(senaryo.gizle ?? [])].join(",\n") + " { display: none !important; }";
await page.evaluateOnNewDocument((css) => {
  const ekle = () => {
    const s = document.createElement("style");
    s.dataset.sezarKayit = "";
    s.textContent = css;
    (document.head ?? document.documentElement).appendChild(s);
  };
  if (document.documentElement) ekle();
  else document.addEventListener("DOMContentLoaded", ekle);
}, gizleCss);

// Sabit saat (veri/saat.cjs ile aynı mantık): sayfa da sunucuyla aynı "şimdi"yi görür.
if (saatKaymasi) {
  await page.evaluateOnNewDocument((kayma) => {
    const Gercek = Date;
    function SabitDate(...a) {
      if (!new.target) return new Gercek(Gercek.now() + kayma).toString();
      return a.length ? new Gercek(...a) : new Gercek(Gercek.now() + kayma);
    }
    SabitDate.prototype = Gercek.prototype;
    SabitDate.now = () => Gercek.now() + kayma;
    SabitDate.parse = Gercek.parse;
    SabitDate.UTC = Gercek.UTC;
    globalThis.Date = SabitDate;
  }, saatKaymasi);
}

// --- olay günlüğü ---
const olaylar = [];
let kayitBaslangici = null; // epoch saniye; null iken (hazırlıkta) günlüğe yazılmaz
const zaman = () => (kayitBaslangici === null ? 0 : +(Date.now() / 1000 - kayitBaslangici).toFixed(3));
const gunluk = (tur, veri = {}) => {
  if (kayitBaslangici !== null) olaylar.push({ t: zaman(), tur, ...veri });
};

const rastgele = tohumluRastgele(senaryo.ad);
const fare = new Fare(page, gunluk, rastgele, hiz);
const kokAdresi = pathToFileURL(KOK).toString().replace(/\/?$/, "");
const ctx = { page, fare, gunluk, zaman, rastgele, hiz, senaryo, gorunum, hesaplar, kokAdresi };

async function adimCalistir(a, no, toplam, bolum) {
  const bas = performance.now();
  const etiket = `${bolum}[${no}/${toplam}] ${a.tur}${a.oge ? ` ${a.oge}` : a.adres ? ` ${a.adres}` : a.metin ? ` "${String(a.metin).slice(0, 30)}"` : ""}`;
  const t0 = zaman();
  gunluk("adim", { no, adimTuru: a.tur, ...(a.not ? { not: a.not } : {}) });
  await ADIMLAR[a.tur](ctx, a);
  console.log(`  ✓ ${etiket}  (${((performance.now() - bas) / 1000).toFixed(2)} sn)`);
  return { no, tur: a.tur, bas: t0, son: zaman() };
}

let kaydedici;
let hata = null;
const adimOzetleri = [];
const genelBas = performance.now();
console.log(`\n● ${senaryo.ad} — ${senaryo.gorunum}, ${izle ? "pencere görünür" : "arka planda"}, hız ${hiz}x`);

try {
  // Hazırlık: giriş, ısındırma vb. Kayda girmez.
  if (senaryo.hazirlik.length) console.log("  hazırlık (kayda girmez):");
  for (let i = 0; i < senaryo.hazirlik.length; i++)
    await adimCalistir(senaryo.hazirlik[i], i + 1, senaryo.hazirlik.length, "  ");

  // Fareyi başlangıç noktasına koy (görüntünün ortası, hafif aşağı).
  const fx = Math.round(gorunum.genislik * 0.55), fy = Math.round(gorunum.yukseklik * 0.6);
  await page.mouse.move(fx, fy);
  fare.baslangic(fx, fy);
  await new Promise((r) => setTimeout(r, 400));

  kaydedici = new Kaydedici(page, klasor, { ...gorunum });
  kayitBaslangici = await kaydedici.basla();
  gunluk("basla", { adres: page.url() });
  gunluk("fare", { x: fx, y: fy });
  await new Promise((r) => setTimeout(r, (senaryo.basBekleme ?? 0.6) * 1000));

  console.log("  kayıt:");
  for (let i = 0; i < senaryo.adimlar.length; i++)
    adimOzetleri.push(await adimCalistir(senaryo.adimlar[i], i + 1, senaryo.adimlar.length, "  "));

  await new Promise((r) => setTimeout(r, (senaryo.sonBekleme ?? 0.8) * 1000));
} catch (e) {
  hata = e;
  console.error(`\n✖ Senaryo durdu: ${e.message}`);
  gunluk("hata", { mesaj: e.message });
  await page.screenshot({ path: path.join(klasor, "hata.png") }).catch(() => {});
  console.error(`  Hata anının ekran görüntüsü: ${path.join(klasor, "hata.png")}`);
}

let sonuc = null;
if (kaydedici) {
  gunluk("bitir");
  const bitis = Date.now() / 1000;
  try {
    sonuc = await kaydedici.bitir(bitis, path.join(klasor, "ham.mp4"));
    if (!bayrak("kareleri-tut")) kaydedici.temizle();
  } catch (e) {
    console.error(`✖ ${e.message}`);
    hata ??= e;
  }
}
await browser.close();

if (sonuc) {
  writeFileSync(
    path.join(klasor, "olaylar.json"),
    JSON.stringify(
      {
        surum: 1,
        senaryo: senaryo.ad,
        durum: hata ? "hata" : "tamam",
        olusturma: new Date().toISOString(),
        video: "ham.mp4",
        gorunum: senaryo.gorunum,
        // Olaylardaki x, y, kutu değerleri CSS pikselidir; videodaki piksel = değer × olcek.
        genislik: gorunum.genislik,
        yukseklik: gorunum.yukseklik,
        olcek: gorunum.olcek,
        fps: 30,
        sure: +sonuc.sure.toFixed(3),
        adimlar: adimOzetleri,
        olaylar,
      },
      null,
      1,
    ),
  );
  copyFileSync(senaryoYolu, path.join(klasor, "senaryo.json"));
  console.log(
    `\n${hata ? "◐ Kısmi kayıt" : "✔ Bitti"}: ${path.join(klasor, "ham.mp4")}` +
      `\n  video ${sonuc.sure.toFixed(1)} sn, ${sonuc.kareSayisi} kare, ${olaylar.length} olay, toplam ${((performance.now() - genelBas) / 1000).toFixed(0)} sn\n`,
  );
}
process.exit(hata ? 1 : 0);
