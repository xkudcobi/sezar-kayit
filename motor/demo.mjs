// Video çekimi için ayrı Sezar demo sunucusu: veriyi temiz yedekten sıfırlar, saati sabitler, açar, kapatır.
// Kullanım: npm run demo -- <sifirla|ac|kapat|durum>
//   sifirla  sunucu açıksa kapatır, video veritabanını temiz yedekten geri yükler, sunucuyu açar
//   ac       (sıfırlamadan) sunucuyu açar
//   kapat    veritabanını düzgün kapatıp sunucuyu durdurur
//   durum    açık mı, hangi saatle çalışıyor
// Ayarlar: veri/demo.json. Ana geliştirme veritabanına (.data/pglite) ve 3000 portuna dokunulmaz.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync, cpSync, openSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DURUM_DOSYASI = path.join(KOK, "veri", ".durum.json");
const LOG_DOSYASI = path.join(KOK, "veri", ".sunucu.log");
const ISARET = ".sezar-kayit"; // sıfırlamanın kendi kurduğu klasörü tanıması için

export function ayarlar() {
  const a = JSON.parse(readFileSync(path.join(KOK, "veri", "demo.json"), "utf8"));
  const web = a.sezarWeb;
  const veri = path.resolve(web, a.veri);
  const yedek = path.resolve(web, a.temizYedek);
  // Yanlışlıkla ana veritabanı ya da 3000 seçilmesin.
  if (!path.basename(veri).startsWith("pglite-video")) throw new Error(`demo.json "veri" pglite-video ile başlamalı: ${veri}`);
  // Veri uygulama klasörünün içinde olursa Next'in dosya izleyicisi veritabanı dosyalarını izler ve yavaşlar.
  if (!path.relative(web, veri).startsWith("..")) throw new Error(`demo.json "veri" uygulama klasörünün (${web}) dışında olmalı.`);
  if (a.port === 3000) throw new Error("demo.json port 3000 olamaz (ana geliştirme sunucusu).");
  return { ...a, web, veri, yedek, adres: `http://localhost:${a.port}` };
}

export function durumOku() {
  return existsSync(DURUM_DOSYASI) ? JSON.parse(readFileSync(DURUM_DOSYASI, "utf8")) : null;
}

async function yanitVarMi(adres, ms = 2500) {
  try {
    const r = await fetch(`${adres}/giris`, { signal: AbortSignal.timeout(ms), redirect: "manual" });
    return r.status > 0;
  } catch {
    return false;
  }
}

/** Portu kullanan (dinleyen ya da kapanmakta olan) işlemlerin PID'leri. TIME_WAIT (PID 0) sayılmaz. */
function portuKullananlar(port) {
  const r = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
  const pidler = r.stdout
    .split("\n")
    .filter((s) => new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s`).test(s))
    .map((s) => Number(s.trim().split(/\s+/).pop()))
    .filter((p) => p > 0);
  return [...new Set(pidler)];
}

/** Demo kopyasından (sezarWeb klasöründen) çalışan node işlemleri. Next alt işlemler açtığı için
 *  PID ağacı yerine komut satırına bakılır; bu klasörden yalnız demo sunucusu çalışır. */
function demoIslemleri(a) {
  const kok = path.resolve(a.web, "..", "..").replace(/\//g, "\\");
  const komut =
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${kok.replace(/'/g, "''")}') } | ` +
    `ForEach-Object { $_.ProcessId }`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", komut], { encoding: "utf8" });
  return r.stdout.split(/\s+/).filter(Boolean).map(Number).filter((p) => p !== process.pid);
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

export async function kapat({ sessiz = false } = {}) {
  const a = ayarlar();
  const d = durumOku();
  const islemler = demoIslemleri(a);
  const yabanci = portuKullananlar(a.port).filter((p) => !islemler.includes(p));
  if (yabanci.length) throw new Error(`Port ${a.port} başka bir işlem tarafından kullanılıyor (PID ${yabanci.join(", ")}); onu bu araç açmadı, kapatmıyorum.`);
  if (!islemler.length) {
    rmSync(DURUM_DOSYASI, { force: true });
    if (!sessiz) console.log(`Demo sunucusu zaten kapalı (port ${a.port}).`);
    return;
  }
  // Önce PGlite'ı düzgün kapat; zorla durdurmak veri klasörünü bozabiliyor.
  try {
    const r = await fetch(`${a.adres}/api/dev/kapat`, { method: "POST", signal: AbortSignal.timeout(20000) });
    if (!sessiz) console.log(`  veritabanı kapatıldı (${r.status})`);
  } catch (e) {
    if (d) console.warn(`  ! /api/dev/kapat yanıt vermedi: ${e.message}`);
  }
  for (const pid of islemler) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" });
  // İşlemler ve port gerçekten boşalana kadar bekle; yoksa veri klasörü hâlâ açıkken değiştirilebilir.
  const bas = Date.now();
  while (demoIslemleri(a).length || portuKullananlar(a.port).length) {
    if (Date.now() - bas > 30000) throw new Error("Demo sunucusu 30 sn içinde kapanmadı; veri klasörüne dokunulmadı.");
    for (const pid of demoIslemleri(a)) spawnSync("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8" });
    await bekle(500);
  }
  rmSync(DURUM_DOSYASI, { force: true });
  if (!sessiz) console.log(`Demo sunucusu kapatıldı.`);
}

export function veriyiSifirla() {
  const a = ayarlar();
  if (!existsSync(a.yedek)) throw new Error(`Temiz yedek bulunamadı: ${a.yedek}`);
  if (demoIslemleri(a).length || portuKullananlar(a.port).length) throw new Error("Sunucu açıkken veri sıfırlanamaz; önce kapatın.");
  if (existsSync(a.veri)) {
    if (existsSync(path.join(a.veri, ISARET))) rmSync(a.veri, { recursive: true, force: true });
    else {
      // İlk kez: klasörü bu araç kurmadı. Silmek yerine yanına taşı.
      const yeni = `${a.veri}-onceki-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;
      renameSync(a.veri, yeni);
      console.log(`  eski video veritabanı silinmedi, taşındı: ${yeni}`);
    }
  }
  const bas = Date.now();
  mkdirSync(path.dirname(a.veri), { recursive: true });
  cpSync(a.yedek, a.veri, { recursive: true });
  writeFileSync(path.join(a.veri, ISARET), `Bu klasör sezar-kayit tarafından ${path.basename(a.yedek)} yedeğinden kuruldu.\n`);
  console.log(`  veri temiz yedekten kuruldu (${((Date.now() - bas) / 1000).toFixed(0)} sn)`);
}

export async function ac() {
  const a = ayarlar();
  if (await yanitVarMi(a.adres)) {
    const d = durumOku();
    if (d?.port === a.port) {
      console.log(`Demo sunucusu zaten açık: ${a.adres}`);
      return d;
    }
    throw new Error(`${a.adres} başka bir sunucu tarafından kullanılıyor.`);
  }
  const kayma = Date.parse(a.saat) - Date.now();
  const saatDosyasi = path.join(KOK, "veri", "saat.cjs");
  const nextCli = path.join(a.web, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextCli)) throw new Error(`Next bulunamadı: ${nextCli}`);
  const log = openSync(LOG_DOSYASI, "w");
  const surec = spawn(process.execPath, [nextCli, "dev", "--port", String(a.port)], {
    cwd: a.web,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      NODE_ENV: "development",
      SEZAR_ROZET_YOK: "1",
      SEZAR_PGLITE_DIR: a.veri,
      BETTER_AUTH_URL: a.adres,
      BETTER_AUTH_TRUSTED_ORIGINS: a.adres,
      SEZAR_SAAT_KAYMA: String(kayma),
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${saatDosyasi.replace(/\\/g, "/")}`.trim(),
    },
  });
  surec.unref();
  const durum = { pid: surec.pid, port: a.port, adres: a.adres, kayma, saat: a.saat, acilis: new Date().toISOString() };
  writeFileSync(DURUM_DOSYASI, JSON.stringify(durum, null, 2));
  process.stdout.write(`  sunucu açılıyor (${a.adres}, saat ${a.saat})`);
  const bas = Date.now();
  while (Date.now() - bas < 240000) {
    if (await yanitVarMi(a.adres, 10000)) {
      console.log(` — hazır (${((Date.now() - bas) / 1000).toFixed(0)} sn)`);
      return durum;
    }
    if (surec.exitCode !== null) break;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 2000));
  }
  const son = existsSync(LOG_DOSYASI) && statSync(LOG_DOSYASI).size ? readFileSync(LOG_DOSYASI, "utf8").slice(-1500) : "";
  throw new Error(`Demo sunucusu açılmadı. Günlüğün sonu (${LOG_DOSYASI}):\n${son}`);
}

export async function sifirla() {
  await kapat({ sessiz: true });
  veriyiSifirla();
  return ac();
}

// --- komut satırı ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const komut = process.argv[2];
  try {
    if (komut === "sifirla") await sifirla();
    else if (komut === "ac") await ac();
    else if (komut === "kapat") await kapat();
    else if (komut === "durum") {
      const a = ayarlar();
      const d = durumOku();
      const acik = await yanitVarMi(a.adres);
      console.log(acik ? `Açık: ${a.adres}${d ? `, saat ${d.saat} (açılış ${d.acilis})` : ""}` : `Kapalı (port ${a.port}).`);
    } else {
      console.log("Kullanım: npm run demo -- <sifirla|ac|kapat|durum>");
      process.exit(1);
    }
  } catch (e) {
    console.error(`\n✖ ${e.message}`);
    process.exit(1);
  }
}
