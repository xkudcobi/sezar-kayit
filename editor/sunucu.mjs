// Editör sunucusu: düzenleme ekranını (Vite) sunar, kayıtları listeler, ham videoyu verir, projeyi kaydeder
// ve MP4 dışa aktarır (Remotion). Kullanım: npm run editor  →  http://localhost:4600
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as viteSunucusu } from "vite";
import react from "@vitejs/plugin-react";

const EDITOR = path.dirname(fileURLToPath(import.meta.url));
const KOK = path.dirname(EDITOR);
const KAYITLAR = path.join(KOK, "kayitlar");
const CIKTI = path.join(KOK, "cikti");
const MUZIK = path.join(KOK, "muzik");
const SES_TURLERI = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg" };
const ORANLAR = ["16:9", "4:5", "9:16"];
const PORT = Number(process.env.EDITOR_PORT ?? 4600);
const AD = /^[a-z0-9-]+$/;

// --- yardımcılar ---

const json = (res, durum, veri) => {
  res.writeHead(durum, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(veri));
};
const govdeOku = (req) =>
  new Promise((ok, hata) => {
    const parcalar = [];
    req.on("data", (p) => parcalar.push(p));
    req.on("end", () => ok(Buffer.concat(parcalar).toString("utf8")));
    req.on("error", hata);
  });
const kayitKlasoru = (ad) => {
  if (!AD.test(ad)) throw Object.assign(new Error("Geçersiz kayıt adı"), { durum: 400 });
  const k = path.join(KAYITLAR, ad);
  if (!existsSync(path.join(k, "olaylar.json"))) throw Object.assign(new Error("Kayıt bulunamadı"), { durum: 404 });
  return k;
};

/** Müzik dosya adını güvenli hâle getirir: Türkçe harfler sadeleşir, yalnız harf/rakam/tire/nokta kalır. */
function muzikAdi(ad) {
  const uzanti = path.extname(ad).toLowerCase();
  if (!SES_TURLERI[uzanti]) throw Object.assign(new Error(`Desteklenen biçimler: ${Object.keys(SES_TURLERI).join(", ")}`), { durum: 400 });
  const tr = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
  const govde = path.basename(ad, path.extname(ad)).replace(/[çğıöşüÇĞİÖŞÜ]/g, (h) => tr[h]).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!govde) throw Object.assign(new Error("Geçersiz dosya adı"), { durum: 400 });
  return govde + uzanti;
}

/** Dosyayı Range desteğiyle gönderir (video oynatıcının ileri-geri sarabilmesi için şart). */
function dosyaGonder(req, res, dosya, tur) {
  const { size } = statSync(dosya);
  const aralik = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (aralik) {
    const bas = aralik[1] ? Number(aralik[1]) : 0;
    const son = aralik[2] ? Math.min(Number(aralik[2]), size - 1) : size - 1;
    res.writeHead(206, { "content-type": tur, "accept-ranges": "bytes", "content-range": `bytes ${bas}-${son}/${size}`, "content-length": son - bas + 1, "cache-control": "no-cache" });
    createReadStream(dosya, { start: bas, end: son }).pipe(res);
  } else {
    res.writeHead(200, { "content-type": tur, "accept-ranges": "bytes", "content-length": size, "cache-control": "no-cache" });
    createReadStream(dosya).pipe(res);
  }
}

/** Zaman çizelgesindeki küçük resim şeridi: ham videodan eşit aralıklı N kare, yan yana tek JPEG. */
function serit(klasor, sure) {
  const hedef = path.join(klasor, "serit.jpg");
  const ham = path.join(klasor, "ham.mp4");
  if (existsSync(hedef) && statSync(hedef).mtimeMs > statSync(ham).mtimeMs) return hedef;
  const n = 30;
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", ham, "-vf", `fps=${n / Math.max(0.5, sure)},scale=-2:96,tile=${n}x1`, "-frames:v", "1", "-q:v", "5", hedef], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Şerit üretilemedi: ${r.stderr}`);
  return hedef;
}

// --- dışa aktarma ---

const isler = new Map(); // id → { durum, ilerleme, cikti, hata, kayit }
let paket = null; // { imza, yer }

function paketImzasi() {
  const dosyalar = [];
  const gez = (k) => {
    for (const d of readdirSync(k, { withFileTypes: true })) {
      const y = path.join(k, d.name);
      if (d.isDirectory()) gez(y);
      else dosyalar.push(`${y}:${statSync(y).mtimeMs}`);
    }
  };
  gez(path.join(EDITOR, "ortak"));
  gez(path.join(EDITOR, "remotion"));
  return dosyalar.join("|");
}

function tarayiciYolu() {
  if (process.env.SEZAR_KAYIT_TARAYICI) return { yol: process.env.SEZAR_KAYIT_TARAYICI, mod: "headless-shell" };
  for (const y of ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"])
    if (existsSync(y)) return { yol: y, mod: "chrome-for-testing" };
  return { yol: null, mod: "headless-shell" }; // Remotion kendi tarayıcısını indirir
}

async function disaAktar(id, ad, klasor, oranlar) {
  const is = isler.get(id);
  try {
    const { bundle } = await import("@remotion/bundler");
    const { renderMedia, selectComposition } = await import("@remotion/renderer");
    const imza = paketImzasi();
    if (!paket || paket.imza !== imza) {
      is.durum = "hazırlanıyor";
      paket = { imza, yer: await bundle({ entryPoint: path.join(EDITOR, "remotion", "index.tsx"), onProgress: (p) => (is.ilerleme = p / 100 * 0.1) }) };
    }
    const gunluk = JSON.parse(readFileSync(path.join(klasor, "olaylar.json"), "utf8"));
    const proje = JSON.parse(readFileSync(path.join(klasor, "proje.json"), "utf8"));
    // 127.0.0.1: sunucu yalnız IPv4'te dinliyor; "localhost" dışa aktarma tarayıcısında ::1'e gidebiliyor.
    const adres = `http://127.0.0.1:${PORT}`;
    const muzik = proje.muzik?.dosya && existsSync(path.join(MUZIK, proje.muzik.dosya)) ? `${adres}/muzik/${encodeURIComponent(proje.muzik.dosya)}` : null;
    const t = tarayiciYolu();
    mkdirSync(CIKTI, { recursive: true });
    const s = new Date();
    const iki = (n) => String(n).padStart(2, "0");
    const damga = `${s.getFullYear()}${iki(s.getMonth() + 1)}${iki(s.getDate())}-${iki(s.getHours())}${iki(s.getMinutes())}`;
    const eszamanli = Number(process.env.SEZAR_KAYIT_ESZAMANLI ?? Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
    is.ciktilar = [];

    for (let i = 0; i < oranlar.length; i++) {
      const oran = oranlar[i];
      const inputProps = { proje: { ...proje, cikis: { ...proje.cikis, oran } }, gunluk, video: `${adres}/medya/${ad}/ham.mp4`, muzik };
      const ortak = { serveUrl: paket.yer, inputProps, browserExecutable: t.yol, chromeMode: t.mod, chromiumOptions: { gl: "angle" } };
      const kompozisyon = await selectComposition({ ...ortak, id: "Kayit" });
      const cikti = path.join(CIKTI, `${ad}-${oran.replace(":", "x")}-${damga}.mp4`);
      Object.assign(is, { durum: "işleniyor", sira: `${i + 1}/${oranlar.length}`, oran });
      const isle = (n) =>
        renderMedia({
          ...ortak,
          composition: kompozisyon,
          codec: "h264",
          crf: 18,
          pixelFormat: "yuv420p",
          imageFormat: "jpeg",
          jpegQuality: 92,
          outputLocation: cikti,
          concurrency: n,
          muted: !muzik, // müzik yoksa sessiz ses izi eklenmesin
          onProgress: ({ progress }) => (is.ilerleme = 0.1 + ((i + progress) / oranlar.length) * 0.9),
        });
      try {
        await isle(eszamanli);
      } catch (e) {
        // B-kareli eski kayıtlarda paralel çözme arada kare bulamıyor; tek işçiyle bir kez daha dene.
        if (!/No frame found at position/.test(e.message)) throw e;
        console.warn("[dışa aktarma] kare bulunamadı, tek işçiyle yeniden deneniyor");
        await isle(1);
      }
      is.ciktilar.push(cikti);
    }
    Object.assign(is, { durum: "bitti", ilerleme: 1, cikti: is.ciktilar[0] });
  } catch (e) {
    Object.assign(is, { durum: "hata", hata: e.message });
    console.error("[dışa aktarma]", e);
  }
}

// --- sunucu ---

const vite = await viteSunucusu({
  root: EDITOR,
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true },
  appType: "spa",
  logLevel: "warn",
});

const sunucu = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (p === "/api/kayitlar" && req.method === "GET") {
      mkdirSync(KAYITLAR, { recursive: true });
      const liste = readdirSync(KAYITLAR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(path.join(KAYITLAR, d.name, "olaylar.json")) && existsSync(path.join(KAYITLAR, d.name, "ham.mp4")))
        .map((d) => {
          const g = JSON.parse(readFileSync(path.join(KAYITLAR, d.name, "olaylar.json"), "utf8"));
          return { ad: d.name, sure: g.sure, gorunum: g.gorunum, durum: g.durum, olusturma: g.olusturma, projeVar: existsSync(path.join(KAYITLAR, d.name, "proje.json")) };
        })
        .sort((a, b) => (b.olusturma ?? "").localeCompare(a.olusturma ?? ""));
      return json(res, 200, liste);
    }

    let m = /^\/api\/kayit\/([^/]+)$/.exec(p);
    if (m && req.method === "GET") {
      const k = kayitKlasoru(m[1]);
      const oku = (d) => (existsSync(path.join(k, d)) ? JSON.parse(readFileSync(path.join(k, d), "utf8")) : null);
      return json(res, 200, { gunluk: oku("olaylar.json"), proje: oku("proje.json"), senaryo: oku("senaryo.json") });
    }

    m = /^\/api\/kayit\/([^/]+)\/proje$/.exec(p);
    if (m && req.method === "PUT") {
      const k = kayitKlasoru(m[1]);
      const proje = JSON.parse(await govdeOku(req));
      if (proje?.surum !== 1 || !Array.isArray(proje.kesimler)) return json(res, 400, { hata: "Proje biçimi tanınmadı" });
      const gecici = path.join(k, "proje.json.yaziliyor");
      writeFileSync(gecici, JSON.stringify(proje, null, 1));
      renameSync(gecici, path.join(k, "proje.json"));
      return json(res, 200, { ok: true });
    }

    m = /^\/api\/kayit\/([^/]+)\/disa-aktar$/.exec(p);
    if (m && req.method === "POST") {
      const k = kayitKlasoru(m[1]);
      if (!existsSync(path.join(k, "proje.json"))) return json(res, 400, { hata: "Önce proje kaydedilmeli" });
      if ([...isler.values()].some((i) => !["bitti", "hata"].includes(i.durum))) return json(res, 409, { hata: "Başka bir dışa aktarma sürüyor" });
      const govde = (await govdeOku(req)) || "{}";
      const oranlar = [...new Set(JSON.parse(govde).oranlar ?? [])].filter((o) => ORANLAR.includes(o));
      if (!oranlar.length) {
        const p = JSON.parse(readFileSync(path.join(k, "proje.json"), "utf8"));
        oranlar.push(p.cikis?.oran ?? "16:9");
      }
      const id = Math.random().toString(36).slice(2, 10);
      isler.set(id, { durum: "sırada", ilerleme: 0, kayit: m[1] });
      disaAktar(id, m[1], k, oranlar);
      return json(res, 202, { id });
    }

    if (p === "/api/muzikler" && req.method === "GET") {
      mkdirSync(MUZIK, { recursive: true });
      const liste = readdirSync(MUZIK)
        .filter((d) => SES_TURLERI[path.extname(d).toLowerCase()])
        .map((d) => ({ ad: d, boyut: statSync(path.join(MUZIK, d)).size }));
      return json(res, 200, liste);
    }

    m = /^\/api\/muzik\/([^/]+)$/.exec(p);
    if (m && req.method === "PUT") {
      const ad = muzikAdi(decodeURIComponent(m[1]));
      const parcalar = [];
      let boyut = 0;
      for await (const parca of req) {
        boyut += parca.length;
        if (boyut > 60 * 1024 * 1024) return json(res, 413, { hata: "Dosya 60 MB'tan büyük olamaz" });
        parcalar.push(parca);
      }
      mkdirSync(MUZIK, { recursive: true });
      writeFileSync(path.join(MUZIK, ad), Buffer.concat(parcalar));
      return json(res, 200, { ad });
    }

    m = /^\/muzik\/([^/]+)$/.exec(p);
    if (m && req.method === "GET") {
      const ad = decodeURIComponent(m[1]);
      const dosya = path.join(MUZIK, ad);
      if (path.dirname(dosya) !== MUZIK || !existsSync(dosya)) return json(res, 404, { hata: "Müzik bulunamadı" });
      return dosyaGonder(req, res, dosya, SES_TURLERI[path.extname(ad).toLowerCase()] ?? "application/octet-stream");
    }

    m = /^\/api\/is\/([a-z0-9]+)$/.exec(p);
    if (m && req.method === "GET") {
      const is = isler.get(m[1]);
      return is ? json(res, 200, is) : json(res, 404, { hata: "İş bulunamadı" });
    }

    if (p === "/api/klasoru-ac" && req.method === "POST") {
      const { dosya } = JSON.parse(await govdeOku(req));
      const hedef = path.resolve(dosya ?? CIKTI);
      if (!hedef.startsWith(CIKTI)) return json(res, 400, { hata: "Yalnız çıktı klasörü açılabilir" });
      spawn("explorer", existsSync(hedef) && statSync(hedef).isFile() ? [`/select,${hedef}`] : [hedef], { detached: true, stdio: "ignore" }).unref();
      return json(res, 200, { ok: true });
    }

    m = /^\/medya\/([^/]+)\/(ham\.mp4|serit\.jpg)$/.exec(p);
    if (m && req.method === "GET") {
      const k = kayitKlasoru(m[1]);
      if (m[2] === "ham.mp4") return dosyaGonder(req, res, path.join(k, "ham.mp4"), "video/mp4");
      const g = JSON.parse(readFileSync(path.join(k, "olaylar.json"), "utf8"));
      return dosyaGonder(req, res, serit(k, g.sure), "image/jpeg");
    }

    if (p.startsWith("/api/")) return json(res, 404, { hata: "Bulunamadı" });
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  } catch (e) {
    json(res, e.durum ?? 500, { hata: e.message });
  }
});

sunucu.listen(PORT, "127.0.0.1", () => {
  console.log(`\n● Sezar video editörü: http://localhost:${PORT}\n  Kayıtlar: ${KAYITLAR}\n  Çıktılar: ${CIKTI}\n`);
  if (process.argv.includes("--ac")) spawn("cmd", ["/c", "start", "", `http://localhost:${PORT}`], { detached: true, stdio: "ignore" }).unref();
});
