// Senaryo adımlarının uygulanışı. Her adım sayfada gerçekten bir şey yapar ve olay günlüğüne yazar.
// altyazi / vurgu / yakinlas ekrana HİÇBİR ŞEY çizmez: yalnız günlüğe işaret düşer, editör bunları gösterir.
import { seciciCevir } from "./senaryo.mjs";

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
const VARSAYILAN_ZAMAN_ASIMI = 15000;

// --- sayfa içinde çalışan yardımcılar ---

// Bir noktanın altındaki öğenin kaydırılabilir atasını bulur ve yumuşak kaydırır.
async function sayfadaKaydir(page, { dy, ms, px, py }) {
  return page.evaluate(async (dy, ms, px, py) => {
    const kaydirilabilir = (n) => {
      const st = getComputedStyle(n);
      return /(auto|scroll|overlay)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1;
    };
    let s = document.elementFromPoint(px, py);
    while (s && s !== document.body && s !== document.documentElement && !kaydirilabilir(s)) s = s.parentElement;
    if (!s || s === document.body || s === document.documentElement) s = document.scrollingElement;
    const bas = s.scrollTop;
    const hedef = Math.max(0, Math.min(s.scrollHeight - s.clientHeight, bas + dy));
    if (Math.abs(hedef - bas) < 2) return 0;
    const onceki = s.style.scrollBehavior;
    s.style.scrollBehavior = "auto";
    const t0 = performance.now();
    await new Promise((bitti) => {
      // requestAnimationFrame değil setTimeout: görünür pencere arkada kalınca rAF durabiliyor.
      const kare = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        s.scrollTop = bas + (hedef - bas) * e;
        if (k < 1) setTimeout(kare, 16);
        else bitti();
      };
      kare();
    });
    s.style.scrollBehavior = onceki;
    return Math.round(hedef - bas);
  }, dy, ms, px, py);
}

// Öğeyi, kaydırılabilir kapsayıcısının görünen alanında ortalar (biraz yukarıda). Sayfa içinde çalışır,
// bu yüzden yardımcıları kendi içinde tanımlı (evaluate dışarıdaki fonksiyonları göremez).
async function ogeyiOrtala(oge, ms) {
  return oge.evaluate(async (el, ms) => {
    const kaydirilabilir = (n) => {
      const st = getComputedStyle(n);
      return /(auto|scroll|overlay)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1;
    };
    let s = el.parentElement;
    while (s && s !== document.body && s !== document.documentElement && !kaydirilabilir(s)) s = s.parentElement;
    if (!s || s === document.body || s === document.documentElement) s = document.scrollingElement;
    const r = el.getBoundingClientRect();
    const kap = s === document.scrollingElement ? { top: 0, height: innerHeight } : s.getBoundingClientRect();
    const dy = r.top + r.height / 2 - (kap.top + kap.height * 0.45);
    const bas = s.scrollTop;
    const hedef = Math.max(0, Math.min(s.scrollHeight - s.clientHeight, bas + dy));
    if (Math.abs(hedef - bas) < 2) return 0;
    const onceki = s.style.scrollBehavior;
    s.style.scrollBehavior = "auto";
    const t0 = performance.now();
    await new Promise((bitti) => {
      // requestAnimationFrame değil setTimeout: görünür pencere arkada kalınca rAF durabiliyor.
      const kare = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        s.scrollTop = bas + (hedef - bas) * e;
        if (k < 1) setTimeout(kare, 16);
        else bitti();
      };
      kare();
    });
    s.style.scrollBehavior = onceki;
    return Math.round(hedef - bas);
  }, ms);
}

// --- öğe bulma ---

async function ogeBul(ctx, oge, zamanAsimi) {
  const secici = seciciCevir(oge);
  try {
    const el = await ctx.page.waitForSelector(secici, { visible: true, timeout: zamanAsimi ?? VARSAYILAN_ZAMAN_ASIMI });
    if (!el) throw new Error("bulunamadı");
    return el;
  } catch {
    const sn = Math.round((zamanAsimi ?? VARSAYILAN_ZAMAN_ASIMI) / 1000);
    throw new Error(`"${oge}" öğesi ${sn} sn içinde sayfada görünmedi (sayfa: ${ctx.page.url()}).`);
  }
}

async function kutu(el) {
  const b = await el.boundingBox();
  if (!b) throw new Error("Öğenin ekrandaki yeri hesaplanamadı (gizli olabilir).");
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

/** Öğe ekranda tam görünmüyorsa önce yumuşakça kaydırır, sonra kutusunu döner. */
async function goruneGetir(ctx, el) {
  let k = await kutu(el);
  const { genislik, yukseklik } = ctx.gorunum;
  const pay = 40;
  if (k.y < pay || k.y + k.h > yukseklik - pay || k.x < 0 || k.x + k.w > genislik) {
    const ms = 700 / ctx.hiz;
    const dy = await ogeyiOrtala(el, ms);
    if (dy) ctx.gunluk("kaydir", { dy, sure: +(ms / 1000).toFixed(3) });
    await uyu(120);
    k = await kutu(el);
  }
  return k;
}

const ortasi = (k) => ({ x: Math.round(k.x + k.w / 2), y: Math.round(k.y + k.h / 2) });

// "{kok}" proje klasörünün file:// adresine çevrilir (yerel test sayfaları için).
async function adresAc(ctx, adres) {
  const tam = new URL(adres.replace("{kok}", ctx.kokAdresi), ctx.senaryo.adres ?? undefined).toString();
  await ctx.page.goto(tam, { waitUntil: "load", timeout: 60000 });
  ctx.gunluk("sayfa", { adres: ctx.page.url() });
}

async function tikla(ctx, el, k) {
  const m = ortasi(k);
  await ctx.fare.git(m.x, m.y);
  await uyu(110 / ctx.hiz);
  ctx.gunluk("tikla", { ...m, kutu: k });
  if (ctx.gorunum.mobil) await ctx.page.touchscreen.tap(m.x, m.y);
  else {
    await ctx.page.mouse.down();
    await uyu(70);
    await ctx.page.mouse.up();
  }
}

// --- Sezar'a özel: kurum seçimi ve sözleşme onayı ---

const KURUM_DUGMESI = 'button[aria-haspopup="listbox"]';

/** Etkin kurumu kenar çubuğundaki kurum menüsünden adıyla seçer. Hazırlıkta çalışır: tıklamalar DOM üzerinden
 *  yapılır, çünkü önceki kurumun sözleşme onay ekranı sayfanın üstünü kaplıyor olabilir. */
async function kurumuSec(ctx, kurumAdi) {
  const p = ctx.page;
  const simdiki = () => p.$eval(KURUM_DUGMESI, (b) => b.textContent.trim()).catch(() => null);
  const ad = await simdiki();
  if (ad === null) throw new Error(`Kurum menüsü bulunamadı; bu hesap tek kuruma üye olabilir ("${kurumAdi}" seçilemedi).`);
  if (ad === kurumAdi) return;
  await p.$eval(KURUM_DUGMESI, (b) => b.click());
  await p.waitForSelector('[role="listbox"][aria-label="Kurum"]', { timeout: 5000 });
  const secildi = await p.$$eval(
    '[role="listbox"][aria-label="Kurum"] [role="option"]',
    (secenekler, ad) => {
      const s = secenekler.find((o) => o.textContent.trim() === ad);
      s?.click();
      return secenekler.map((o) => o.textContent.trim());
    },
    kurumAdi,
  );
  if (!secildi.includes(kurumAdi))
    throw new Error(`"${kurumAdi}" bu hesabın kurumları arasında yok. Kurumlar: ${secildi.join(", ")}`);
  await p.waitForFunction(
    (sec, ad) => document.querySelector(sec)?.textContent.trim() === ad,
    { timeout: 20000 }, KURUM_DUGMESI, kurumAdi,
  ).catch(() => { throw new Error(`Kurum "${kurumAdi}" olarak değişmedi.`); });
  await p.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {});
}

/** Bekleyen sözleşme onay ekranı çıkarsa kabul eder (yalnız demo kurumda; veri her sıfırlamada geri gelir). */
async function sozlesmeyiGec(ctx) {
  const kutu = await ctx.page.$("::-p-text(İşletmem adına okudum, kabul ediyorum.)");
  if (!kutu) return;
  await kutu.click();
  const dugme = await ctx.page.waitForSelector("::-p-text(Kabul et ve devam et)", { visible: true, timeout: 5000 });
  await dugme.click();
  await ctx.page.waitForSelector("::-p-text(Kabul et ve devam et)", { hidden: true, timeout: 15000 }).catch(() => {});
  await ctx.page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {});
}

// --- adımlar ---

export const ADIMLAR = {
  async git(ctx, a) {
    await adresAc(ctx, a.adres);
    if (a.bekle) await ogeBul(ctx, a.bekle, a.zamanAsimi);
  },

  async tikla(ctx, a) {
    const el = await ogeBul(ctx, a.oge, a.zamanAsimi);
    const k = await goruneGetir(ctx, el);
    await tikla(ctx, el, k);
    await uyu((a.sonra ?? 0.6) * 1000 / ctx.hiz);
  },

  async yaz(ctx, a) {
    const el = await ogeBul(ctx, a.oge, a.zamanAsimi);
    const k = await goruneGetir(ctx, el);
    await tikla(ctx, el, k);
    await uyu(150 / ctx.hiz);
    if (a.temizle) {
      await ctx.page.keyboard.down("Control");
      await ctx.page.keyboard.press("KeyA");
      await ctx.page.keyboard.up("Control");
      await ctx.page.keyboard.press("Backspace");
    }
    const ortalama = (a.hiz ?? 65) / ctx.hiz;
    const bas = ctx.zaman();
    for (const harf of [...String(a.metin)]) {
      await ctx.page.keyboard.type(harf);
      // Harf arası süre ±%35 oynar; boşluktan sonra biraz daha uzun.
      const carpan = 0.65 + ctx.rastgele() * 0.7 + (harf === " " ? 0.4 : 0);
      await uyu(ortalama * carpan);
    }
    ctx.gunluk("yaz", { kutu: k, metin: String(a.metin), bas, son: ctx.zaman() });
    await uyu((a.sonra ?? 0.4) * 1000 / ctx.hiz);
  },

  async tus(ctx, a) {
    ctx.gunluk("tus", { tus: a.tus });
    await ctx.page.keyboard.press(a.tus);
    await uyu((a.sonra ?? 0.5) * 1000 / ctx.hiz);
  },

  async kaydir(ctx, a) {
    const ms = (a.sure ?? 1) * 1000 / ctx.hiz;
    let dy;
    if (a.oge) {
      const el = await ogeBul(ctx, a.oge, a.zamanAsimi);
      dy = await ogeyiOrtala(el, ms);
    } else {
      // Farenin altındaki alanı kaydırır (yan menü değil içerik kaydırılsın diye fare ortaya alınmamışsa merkezi kullan).
      const px = ctx.fare.x || ctx.gorunum.genislik / 2;
      const py = ctx.fare.y || ctx.gorunum.yukseklik / 2;
      dy = await sayfadaKaydir(ctx.page, { dy: a.piksel, ms, px, py });
    }
    ctx.gunluk("kaydir", { dy, sure: +(ms / 1000).toFixed(3) });
    await uyu(150);
  },

  async uzerineGel(ctx, a) {
    const el = await ogeBul(ctx, a.oge, a.zamanAsimi);
    const k = await goruneGetir(ctx, el);
    const m = ortasi(k);
    await ctx.fare.git(m.x, m.y);
    ctx.gunluk("uzerineGel", { ...m, kutu: k });
    await uyu((a.sonra ?? 0.8) * 1000 / ctx.hiz);
  },

  async bekle(ctx, a) {
    const zaman = a.zamanAsimi ?? VARSAYILAN_ZAMAN_ASIMI;
    if (a.ogeGorunene) await ogeBul(ctx, a.ogeGorunene, zaman);
    if (a.ogeKaybolana) {
      await ctx.page
        .waitForSelector(seciciCevir(a.ogeKaybolana), { hidden: true, timeout: zaman })
        .catch(() => { throw new Error(`"${a.ogeKaybolana}" ${Math.round(zaman / 1000)} sn içinde kaybolmadı.`); });
    }
    if (a.adresIcerir) {
      await ctx.page
        .waitForFunction((p) => location.href.includes(p), { timeout: zaman }, a.adresIcerir)
        .catch(() => { throw new Error(`Adres ${Math.round(zaman / 1000)} sn içinde "${a.adresIcerir}" içermedi (şu an: ${ctx.page.url()}).`); });
      ctx.gunluk("sayfa", { adres: ctx.page.url() });
    }
    if (a.sure) await uyu(a.sure * 1000 / ctx.hiz);
  },

  async duraklat(ctx, a) {
    await uyu(a.sure * 1000 / ctx.hiz);
  },

  async altyazi(ctx, a) {
    const sure = a.sure ?? 2.5;
    ctx.gunluk("altyazi", { metin: a.metin, sure });
    if (a.bekleyerek) await uyu(sure * 1000 / ctx.hiz);
  },

  async vurgu(ctx, a) {
    const el = await ogeBul(ctx, a.oge, a.zamanAsimi);
    const k = await goruneGetir(ctx, el);
    const sure = a.sure ?? 2;
    ctx.gunluk("vurgu", { kutu: k, sure, bicim: a.bicim ?? "kutu" });
    await uyu(sure * 1000 / ctx.hiz);
  },

  async yakinlas(ctx, a) {
    const el = await ogeBul(ctx, a.oge, a.zamanAsimi);
    const k = await goruneGetir(ctx, el);
    const sure = a.sure ?? 2;
    ctx.gunluk("yakinlas", { kutu: k, oran: a.oran ?? 1.6, sure });
    await uyu(sure * 1000 / ctx.hiz);
  },

  async giris(ctx, a) {
    const ad = a.hesap ?? "demo";
    const h = ctx.hesaplar[ad];
    if (!h) throw new Error(`"${ad}" hesabı veri/hesaplar.json içinde yok. Örnek için veri/hesaplar.ornek.json dosyasına bakın.`);
    await adresAc(ctx, new URL("/giris", h.adres ?? ctx.senaryo.adres).toString());
    await ADIMLAR.yaz(ctx, { oge: 'input[name="email"]', metin: h.eposta, hiz: 35, sonra: 0.1 });
    await ADIMLAR.yaz(ctx, { oge: 'input[name="password"]', metin: h.parola, hiz: 35, sonra: 0.1 });
    await ADIMLAR.tikla(ctx, { oge: 'button[type="submit"]', sonra: 0 });
    await ctx.page
      .waitForFunction(() => !location.pathname.startsWith("/giris"), { timeout: 30000 })
      .catch(() => {
        throw new Error(
          ctx.page.url().includes("/giris/dogrulama")
            ? "Hesap iki adımlı doğrulama istiyor; kayıt için doğrulamasız bir demo hesabı kullanın."
            : "Giriş 30 sn içinde tamamlanmadı (e-posta/parola yanlış olabilir).",
        );
      });
    await ctx.page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {});
    if (h.kurum) await kurumuSec(ctx, h.kurum);
    await sozlesmeyiGec(ctx);
    ctx.gunluk("sayfa", { adres: ctx.page.url() });
  },

  async fareyiGizle(ctx) {
    ctx.gunluk("fare-gizle");
  },
};
