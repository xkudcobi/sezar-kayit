// Ekran kaydı: Chrome'un Page.startScreencast komutuyla zaman damgalı kareler alınır,
// sonra ffmpeg ile sabit fps'li MP4'e birleştirilir. Böylece video zamanı olay günlüğüyle birebir eşleşir.
// (Puppeteer'ın hazır page.screencast() aracı kareleri zaman damgasız verdiği için senkron kayıyordu.)
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export class Kaydedici {
  constructor(page, klasor, { genislik, yukseklik, olcek, fps = 30, kalite = 92 }) {
    this.page = page;
    this.klasor = klasor;
    this.kareKlasoru = path.join(klasor, ".kareler");
    this.ayar = { genislik, yukseklik, olcek, fps, kalite };
    this.kareler = []; // { dosya, ts } — ts: epoch saniye
    this.baslangic = 0;
  }

  async basla() {
    rmSync(this.kareKlasoru, { recursive: true, force: true });
    mkdirSync(this.kareKlasoru, { recursive: true });
    this.cdp = await this.page.createCDPSession();
    let sayac = 0;
    this.cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const dosya = `k${String(sayac++).padStart(6, "0")}.jpg`;
      writeFileSync(path.join(this.kareKlasoru, dosya), Buffer.from(data, "base64"));
      this.kareler.push({ dosya, ts: metadata.timestamp });
      this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    const { genislik, yukseklik, olcek, kalite } = this.ayar;
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: kalite,
      maxWidth: Math.round(genislik * olcek),
      maxHeight: Math.round(yukseklik * olcek),
      everyNthFrame: 1,
    });
    this.baslangic = Date.now() / 1000;
    return this.baslangic;
  }

  /** Kaydı durdurur ve MP4 üretir. bitis: epoch saniye (son olayın zamanı). */
  async bitir(bitis, cikti) {
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await new Promise((r) => setTimeout(r, 250));
    await this.cdp.detach().catch(() => {});
    if (this.kareler.length === 0) throw new Error("Hiç kare yakalanamadı.");

    const kareler = this.kareler.filter((k) => k.ts <= bitis + 0.05);
    const sure = bitis - this.baslangic;
    // Her karenin ekranda kalma süresi = sonraki karenin zamanı − kendi zamanı.
    // İlk kare 0. saniyeden başlar (kayıt başlarken sayfa zaten ekrandaydı).
    const satirlar = [];
    for (let i = 0; i < kareler.length; i++) {
      const bas = i === 0 ? 0 : kareler[i].ts - this.baslangic;
      const son = i + 1 < kareler.length ? kareler[i + 1].ts - this.baslangic : sure;
      satirlar.push(`file '${kareler[i].dosya}'`, `duration ${Math.max(0.001, son - bas).toFixed(4)}`);
    }
    satirlar.push(`file '${kareler[kareler.length - 1].dosya}'`);
    writeFileSync(path.join(this.kareKlasoru, "liste.txt"), satirlar.join("\n"));

    // Kare boyutu tek sayı olursa x264 hata verir; çifte yuvarla.
    // concat son kareyi bir kez daha gösterdiği için çıktı -t ile tam süreye kesilir.
    const ff = spawnSync(
      "ffmpeg",
      ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "liste.txt", "-t", sure.toFixed(3),
       "-vf", `fps=${this.ayar.fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
       // B-kare yok, sık anahtar kare: editörde sarma hızlı olsun, Remotion paralel kare çözerken
       // ("No frame found at position") hatası vermesin.
       "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-bf", "0", "-g", "15", "-movflags", "+faststart", cikti],
      { cwd: this.kareKlasoru, encoding: "utf8" },
    );
    if (ff.status !== 0) throw new Error(`ffmpeg video üretemedi:\n${ff.stderr}`);
    return { kareSayisi: kareler.length, sure };
  }

  temizle() {
    rmSync(this.kareKlasoru, { recursive: true, force: true });
  }
}
