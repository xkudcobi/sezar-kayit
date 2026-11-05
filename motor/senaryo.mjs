// Senaryo dosyasını okur ve doğrular. Hatalar adım numarasıyla, Türkçe anlatılır.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const GORUNUMLER = {
  masaustu: { genislik: 1920, yukseklik: 1080, olcek: 1, mobil: false },
  "masaustu-net": { genislik: 1920, yukseklik: 1080, olcek: 2, mobil: false },
  telefon: { genislik: 390, yukseklik: 844, olcek: 3, mobil: true },
};

// tur → { zorunlu alanlar, isteğe bağlı alanlar }
export const ADIM_TURLERI = {
  git: { zorunlu: ["adres"], istege: ["bekle"] },
  tikla: { zorunlu: ["oge"], istege: ["sonra"] },
  yaz: { zorunlu: ["oge", "metin"], istege: ["hiz", "temizle", "sonra"] },
  tus: { zorunlu: ["tus"], istege: ["sonra"] },
  kaydir: { zorunlu: [], istege: ["piksel", "oge", "sure"] },
  uzerineGel: { zorunlu: ["oge"], istege: ["sonra"] },
  bekle: { zorunlu: [], istege: ["ogeGorunene", "ogeKaybolana", "adresIcerir", "sure"] },
  duraklat: { zorunlu: ["sure"], istege: [] },
  altyazi: { zorunlu: ["metin"], istege: ["sure", "bekleyerek"] },
  vurgu: { zorunlu: ["oge"], istege: ["sure", "bicim"] },
  yakinlas: { zorunlu: ["oge"], istege: ["oran", "sure"] },
  giris: { zorunlu: [], istege: ["hesap"] },
  fareyiGizle: { zorunlu: [], istege: [] },
};

const ORTAK_ALANLAR = ["tur", "not", "zamanAsimi"];

export function senaryoYukle(adOrYol, kok) {
  const yol = existsSync(adOrYol) ? adOrYol : path.join(kok, "senaryolar", `${adOrYol.replace(/\.json$/, "")}.json`);
  if (!existsSync(yol)) throw new Error(`Senaryo bulunamadı: ${yol}`);
  let s;
  try {
    s = JSON.parse(readFileSync(yol, "utf8"));
  } catch (e) {
    throw new Error(`Senaryo JSON olarak okunamadı (${path.basename(yol)}): ${e.message}`);
  }
  const hatalar = [];
  const uyarilar = [];
  if (!s.ad) s.ad = path.basename(yol, ".json");
  if (!/^[a-z0-9-]+$/.test(s.ad)) hatalar.push(`"ad" yalnız küçük harf, rakam ve tire içermeli: "${s.ad}"`);
  s.gorunum ??= "masaustu";
  if (!GORUNUMLER[s.gorunum]) hatalar.push(`"gorunum" şunlardan biri olmalı: ${Object.keys(GORUNUMLER).join(", ")}`);
  s.hazirlik ??= [];
  s.adimlar ??= [];
  if (!Array.isArray(s.adimlar) || s.adimlar.length === 0) hatalar.push(`"adimlar" boş olamaz.`);

  const kontrol = (liste, bolum) =>
    liste.forEach((a, i) => {
      const yer = `${bolum} ${i + 1}`;
      const tanim = ADIM_TURLERI[a?.tur];
      if (!tanim) {
        hatalar.push(`${yer}: bilinmeyen tür "${a?.tur}". Geçerli türler: ${Object.keys(ADIM_TURLERI).join(", ")}`);
        return;
      }
      for (const z of tanim.zorunlu) if (a[z] === undefined) hatalar.push(`${yer} (${a.tur}): "${z}" alanı eksik.`);
      for (const k of Object.keys(a))
        if (![...tanim.zorunlu, ...tanim.istege, ...ORTAK_ALANLAR].includes(k))
          uyarilar.push(`${yer} (${a.tur}): "${k}" alanı tanınmıyor, yok sayılacak.`);
      if (a.tur === "kaydir" && a.piksel === undefined && a.oge === undefined)
        hatalar.push(`${yer} (kaydir): "piksel" ya da "oge" verilmeli.`);
      if (a.tur === "bekle" && !["ogeGorunene", "ogeKaybolana", "adresIcerir", "sure"].some((k) => a[k] !== undefined))
        hatalar.push(`${yer} (bekle): neyi bekleyeceği yazılmalı (ogeGorunene, ogeKaybolana, adresIcerir ya da sure).`);
    });
  kontrol(s.hazirlik, "hazırlık adımı");
  kontrol(s.adimlar, "adım");

  if (hatalar.length) throw new Error(`Senaryoda ${hatalar.length} hata var:\n  - ${hatalar.join("\n  - ")}`);
  return { senaryo: s, yol, uyarilar };
}

/** Seçici kısaltmaları: "text=Uyarılar", "tour=bugun", ya da düz CSS. */
export function seciciCevir(oge) {
  if (oge.startsWith("text=")) return `::-p-text(${JSON.stringify(oge.slice(5))})`;
  if (oge.startsWith("tour=")) return `[data-tour="${oge.slice(5)}"]`;
  return oge;
}
