// Editör projesi: bir kaydın (ham.mp4 + olaylar.json) üzerinde yapılan düzenlemeler. Video hiç değiştirilmez;
// her şey bu dosyadaki bilgiyle önizlemede ve dışa aktarmada yeniden çizilir.
// Zamanlar saniyedir. "Kaynak zamanı" ham kaydın zamanı, "çıkış zamanı" düzenlenmiş videonun zamanıdır.

export const FPS = 30;

export type Olay = { t: number; tur: string; [alan: string]: unknown };
export type Kutu = { x: number; y: number; w: number; h: number };

export type Gunluk = {
  surum: number;
  senaryo: string;
  gorunum: "masaustu" | "masaustu-net" | "telefon";
  genislik: number; // CSS piksel
  yukseklik: number;
  olcek: number; // videodaki piksel = CSS piksel × olcek
  fps: number;
  sure: number;
  adimlar: { no: number; tur: string; bas: number; son: number }[];
  olaylar: Olay[];
};

/** Ham kayıttan alınan bir parça. Sırayla arka arkaya oynatılır. */
export type Kesim = { id: string; bas: number; son: number; hiz: number };

// Katmanlar kaynak zamanına bağlıdır: video kesilip hızlandırılsa da içeriğin üstünde kalırlar.
// "kaynak": senaryodaki hangi olaydan üretildiği (aynı olay iki kez eklenmesin diye).
export type Yakinlastirma = { id: string; bas: number; son: number; oran: number; merkez: { x: number; y: number }; takip: boolean; gecis: number; kaynak?: string };
export type Vurgu = { id: string; bas: number; son: number; kutu: Kutu; bicim: "kutu" | "karart"; kaynak?: string };
export type Altyazi = { id: string; bas: number; son: number; metin: string; kaynak?: string };
export type AltyaziStili = { konum: "alt" | "ust"; boyut: number; gorunum: "koyu" | "acik" | "mor" };

export type Oran = "16:9" | "4:5" | "9:16";
export const ORANLAR: Oran[] = ["16:9", "4:5", "9:16"];
export type Cikis = {
  oran: Oran; // önizlemede gösterilen oran; dışa aktarmada birden çok seçilebilir
  yerlesim: "sigdir" | "kirp"; // kayıt orana uymuyorsa: tamamını göster ya da kırp
  zemin: "renk" | "bulanik"; // sığdırmada boş kalan yer
  kadraj: { x: number; y: number }; // kırpmada odak (0–1, kayda göre)
  kadrajTakip: boolean; // kırpmada odak imleci izlesin
  telefonCercevesi: boolean; // telefon kaydını telefon çerçevesi içinde göster
};
export type KartTemasi = "mor" | "koyu" | "acik";
export type Kart = { acik: boolean; baslik: string; altBaslik: string; sure: number; tema: KartTemasi; logo: boolean };
export type Muzik = { dosya: string; ses: number; girisYumusak: number; cikisYumusak: number; baslangic: number };

export type Proje = {
  surum: 1;
  kayit: string;
  kesimler: Kesim[];
  imlec: { goster: boolean; boyut: number; tik: boolean };
  yakinlastirmalar: Yakinlastirma[];
  vurgular: Vurgu[];
  altyazilar: Altyazi[];
  altyaziStili: AltyaziStili;
  cikis: Cikis;
  kartlar: { giris: Kart; kapanis: Kart };
  muzik: Muzik | null;
};

export const yeniId = () => Math.random().toString(36).slice(2, 9);

export function varsayilanProje(kayit: string, g: Gunluk): Proje {
  const p: Proje = projeyiTamamla(
    {
      surum: 1,
      kayit,
      kesimler: [{ id: yeniId(), bas: 0, son: g.sure, hiz: 1 }],
      imlec: { goster: true, boyut: 1, tik: true },
    },
    g,
  );
  // Yeni projede senaryodaki altyazı, vurgu ve yakınlaştırma işaretleri hazır gelir.
  return { ...p, altyazilar: senaryodanAltyazilar(g, p), vurgular: senaryodanVurgular(g, p), yakinlastirmalar: senaryodanYakinlastirmalar(g, p) };
}

const VARSAYILAN_KART: Kart = { acik: false, baslik: "", altBaslik: "", sure: 2.5, tema: "mor", logo: true };

/** Eski sürümde kaydedilmiş projeye yeni alanları ekler. */
export function projeyiTamamla(p: Partial<Proje> & Pick<Proje, "surum" | "kayit" | "kesimler" | "imlec">, g: Gunluk): Proje {
  const telefon = g.gorunum === "telefon";
  return {
    yakinlastirmalar: [],
    vurgular: [],
    altyazilar: [],
    muzik: null,
    ...p,
    altyaziStili: { konum: "alt", boyut: 1, gorunum: "koyu", ...p.altyaziStili },
    cikis: { oran: telefon ? "9:16" : "16:9", yerlesim: "sigdir", zemin: "renk", kadraj: { x: 0.5, y: 0.5 }, kadrajTakip: true, telefonCercevesi: true, ...p.cikis },
    kartlar: {
      giris: { ...VARSAYILAN_KART, baslik: "Sezar", altBaslik: "İhtiyacınız olan her şey tek yerde.", ...p.kartlar?.giris },
      kapanis: { ...VARSAYILAN_KART, baslik: "sezars.com", altBaslik: "Kurumunuzun tüm işleri tek yerde.", sure: 3, ...p.kartlar?.kapanis },
    },
  } as Proje;
}

// --- çıkış boyutu ve kare sayıları (kartlar videonun önüne ve arkasına eklenir) ---

export function cikisBoyutu(oran: Oran): { w: number; h: number } {
  return oran === "16:9" ? { w: 1920, h: 1080 } : oran === "4:5" ? { w: 1080, h: 1350 } : { w: 1080, h: 1920 };
}
/** Kaydın video piksel boyutu (çift sayıya yuvarlı; kaydedici de öyle üretir). */
export const kayitBoyutu = (g: Gunluk) => ({ w: Math.round((g.genislik * g.olcek) / 2) * 2, h: Math.round((g.yukseklik * g.olcek) / 2) * 2 });

export const girisKare = (p: Proje, fps = FPS) => (p.kartlar.giris.acik ? Math.round(p.kartlar.giris.sure * fps) : 0);
export const kapanisKare = (p: Proje, fps = FPS) => (p.kartlar.kapanis.acik ? Math.round(p.kartlar.kapanis.sure * fps) : 0);
export const videoKare = (p: Proje, fps = FPS) => Math.max(1, Math.round(cikisSuresi(p) * fps));
/** Kart geçişi: kart videonun ilk/son bu kadar karesinin üstünde yumuşakça açılıp kapanır. */
export const KART_GECISI = 0.4;

// --- senaryodan doldurma: yalnız henüz eklenmemiş olaylar ---

const olayAnahtari = (i: number) => `olay:${i}`;
const eklenmis = (liste: { kaynak?: string }[]) => new Set(liste.map((x) => x.kaynak).filter(Boolean));

export function senaryodanAltyazilar(g: Gunluk, p: Proje): Altyazi[] {
  const var_ = eklenmis(p.altyazilar);
  return g.olaylar.flatMap((o, i) =>
    o.tur === "altyazi" && !var_.has(olayAnahtari(i))
      ? [{ id: yeniId(), bas: o.t, son: Math.min(g.sure, o.t + ((o.sure as number) ?? 2.5)), metin: String(o.metin), kaynak: olayAnahtari(i) }]
      : [],
  );
}

export function senaryodanVurgular(g: Gunluk, p: Proje): Vurgu[] {
  const var_ = eklenmis(p.vurgular);
  return g.olaylar.flatMap((o, i) =>
    o.tur === "vurgu" && !var_.has(olayAnahtari(i))
      ? [{ id: yeniId(), bas: o.t, son: Math.min(g.sure, o.t + ((o.sure as number) ?? 2)), kutu: o.kutu as Kutu, bicim: o.bicim === "karart" ? "karart" : "kutu", kaynak: olayAnahtari(i) } as Vurgu]
      : [],
  );
}

export function senaryodanYakinlastirmalar(g: Gunluk, p: Proje): Yakinlastirma[] {
  const var_ = eklenmis(p.yakinlastirmalar);
  return g.olaylar.flatMap((o, i) => {
    if (o.tur !== "yakinlas" || var_.has(olayAnahtari(i))) return [];
    const k = o.kutu as Kutu;
    const sure = (o.sure as number) ?? 2;
    // Geçiş olaydan önce başlar: hedef tam olay anında tam ölçeğe ulaşır.
    const gecis = 0.6;
    return [{ id: yeniId(), bas: Math.max(0, o.t - gecis), son: Math.min(g.sure, o.t + sure + gecis), oran: (o.oran as number) ?? 1.6, merkez: { x: k.x + k.w / 2, y: k.y + k.h / 2 }, takip: false, gecis, kaynak: olayAnahtari(i) }];
  });
}

// --- katman zamanlaması ---

export const yumusak = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Katmanın t anındaki görünürlüğü (0–1): başta ve sonda `gecis` saniyede yumuşakça girip çıkar. */
export function gorunurluk(x: { bas: number; son: number }, t: number, gecis: number): number {
  if (t < x.bas || t > x.son) return 0;
  const g = Math.min(gecis, (x.son - x.bas) / 2);
  if (g <= 0) return 1;
  return yumusak(Math.min((t - x.bas) / g, (x.son - t) / g, 1));
}

/** Bir kaynak aralığının çıkış videosundaki görünen parçaları (kesilen yerler atlanır). */
export function cikistakiParcalar(duzen: KesimDuzeni[], bas: number, son: number): { cikisBas: number; cikisSon: number; kesim: KesimDuzeni }[] {
  const l: { cikisBas: number; cikisSon: number; kesim: KesimDuzeni }[] = [];
  for (const k of duzen) {
    const a = Math.max(bas, k.bas), b = Math.min(son, k.son);
    if (b > a) l.push({ cikisBas: k.cikisBas + (a - k.bas) / k.hiz, cikisSon: k.cikisBas + (b - k.bas) / k.hiz, kesim: k });
  }
  return l;
}

export type KesimDuzeni = Kesim & { cikisBas: number; cikisSon: number; kareBas: number; kareSayisi: number };

/** Kesimlerin çıkış videosundaki yerleri. Kare sınırları birikimli yuvarlanır: kayma birikmez. */
export function kesimDuzeni(p: Proje, fps = FPS): KesimDuzeni[] {
  let t = 0;
  return p.kesimler.map((k) => {
    const cikisBas = t;
    t += (k.son - k.bas) / k.hiz;
    const kareBas = Math.round(cikisBas * fps);
    return { ...k, cikisBas, cikisSon: t, kareBas, kareSayisi: Math.max(1, Math.round(t * fps) - kareBas) };
  });
}

/** Yalnız videonun (kesimlerin) çıkıştaki süresi; kartlar hariç. */
export const cikisSuresi = (p: Proje) => p.kesimler.reduce((s, k) => s + (k.son - k.bas) / k.hiz, 0);
/** Kartlar dahil toplam kare. */
export const toplamKare = (p: Proje, fps = FPS) => girisKare(p, fps) + videoKare(p, fps) + kapanisKare(p, fps);

/** Çıkış zamanındaki kaynak zamanı. */
export function kaynakZamani(duzen: KesimDuzeni[], cikis: number): { kesim: KesimDuzeni; t: number } | null {
  for (const k of duzen) {
    if (cikis < k.cikisSon || k === duzen[duzen.length - 1]) {
      const t = Math.min(k.son, k.bas + Math.max(0, cikis - k.cikisBas) * k.hiz);
      return { kesim: k, t };
    }
  }
  return null;
}

/** Kaynak zamanının çıkıştaki karşılığı; o an kesilip atıldıysa null. */
export function cikisZamani(duzen: KesimDuzeni[], kaynak: number): number | null {
  for (const k of duzen) if (kaynak >= k.bas && kaynak <= k.son) return k.cikisBas + (kaynak - k.bas) / k.hiz;
  return null;
}

// --- imleç ---

export type FareNoktasi = { t: number; x: number; y: number; gizle?: boolean };

/** Günlükten fare yolu: "fare" olayları + "fare-gizle" işaretleri, zamana göre sıralı. */
export function fareYolu(g: Gunluk): FareNoktasi[] {
  const yol: FareNoktasi[] = [];
  for (const o of g.olaylar) {
    if (o.tur === "fare") yol.push({ t: o.t, x: o.x as number, y: o.y as number });
    else if (o.tur === "fare-gizle" && yol.length) yol.push({ ...yol[yol.length - 1], t: o.t, gizle: true });
  }
  return yol;
}

/** t anındaki fare konumu (CSS piksel); iki nokta arasında doğrusal ara değer. */
export function fareKonumu(yol: FareNoktasi[], t: number): { x: number; y: number; gizli: boolean } | null {
  if (!yol.length) return null;
  let lo = 0, hi = yol.length - 1;
  if (t <= yol[0].t) return { x: yol[0].x, y: yol[0].y, gizli: !!yol[0].gizle };
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (yol[m].t <= t) lo = m;
    else hi = m - 1;
  }
  const a = yol[lo], b = yol[lo + 1];
  if (!b || a.gizle) return { x: a.x, y: a.y, gizli: !!a.gizle };
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, gizli: false };
}

export const tiklamalar = (g: Gunluk) =>
  g.olaylar.filter((o) => o.tur === "tikla").map((o) => ({ t: o.t, x: o.x as number, y: o.y as number }));

export const sureYaz = (s: number) => {
  const d = Math.floor(s / 60);
  const sn = s - d * 60;
  return `${d}:${sn.toFixed(1).padStart(4, "0")}`;
};
