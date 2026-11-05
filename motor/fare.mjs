// İnsan benzeri fare hareketi. Rastgelelik tohumludur: aynı senaryo her çalıştırmada aynı yolu çizer.

export function tohumluRastgele(metin) {
  let h = 1779033703 ^ metin.length;
  for (let i = 0; i < metin.length; i++) {
    h = Math.imul(h ^ metin.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yavasBaslaYavasBitir = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export class Fare {
  constructor(page, gunluk, rastgele, hiz) {
    this.page = page;
    this.gunluk = gunluk;
    this.rastgele = rastgele;
    this.hiz = hiz;
    this.x = 0;
    this.y = 0;
  }

  baslangic(x, y) {
    this.x = x; this.y = y;
  }

  /** Hedefe hafif bir yay çizerek gider. sure verilmezse mesafeye göre hesaplanır (ms). */
  async git(x, y, sure) {
    const dx = x - this.x, dy = y - this.y;
    const mesafe = Math.hypot(dx, dy);
    if (mesafe < 1) return;
    const ms = (sure ?? Math.min(1100, Math.max(350, 280 + mesafe * 0.55))) / this.hiz;
    // Yayın yönü ve büyüklüğü tohumlu rastgele; düz çizgi yapay durur.
    const bukum = (this.rastgele() - 0.5) * 0.35;
    const cx = this.x + dx / 2 - dy * bukum;
    const cy = this.y + dy / 2 + dx * bukum;
    const x0 = this.x, y0 = this.y;
    const adim = Math.max(10, Math.round(ms / 16));
    const bas = performance.now();
    for (let i = 1; i <= adim; i++) {
      const e = yavasBaslaYavasBitir(i / adim);
      const px = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e * e * x;
      const py = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e * e * y;
      await this.page.mouse.move(px, py);
      this.gunluk("fare", { x: Math.round(px), y: Math.round(py) });
      const bekle = bas + (ms * i) / adim - performance.now();
      if (bekle > 0) await new Promise((r) => setTimeout(r, bekle));
    }
    this.x = x; this.y = y;
  }
}
