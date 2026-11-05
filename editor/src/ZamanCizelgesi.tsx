import React, { useEffect, useMemo, useRef, useState } from "react";
import { FPS, cikisSuresi, cikisZamani, cikistakiParcalar, sureYaz, type Gunluk, type KesimDuzeni, type Proje } from "../ortak/proje";

const SERIT_KARE = 30; // editor/sunucu.mjs serit() ile aynı olmalı
const PAY = 12; // çizelgenin solundaki boşluk (px)
const IZ_YUKSEKLIGI = 56;

export type KatmanTuru = "yakinlastirmalar" | "vurgular" | "altyazilar";
export type Secim = { tur: "kesim" | KatmanTuru; id: string } | null;

const KATMANLAR: { tur: KatmanTuru; ad: string; renk: string }[] = [
  { tur: "altyazilar", ad: "Altyazı", renk: "#ca8a04" },
  { tur: "vurgular", ad: "Vurgu", renk: "#16a34a" },
  { tur: "yakinlastirmalar", ad: "Yakınlaştırma", renk: "#0284c7" },
];

type Props = {
  ad: string;
  gunluk: Gunluk;
  proje: Proje;
  duzen: KesimDuzeni[];
  kare: number;
  secim: Secim;
  onSec: (s: Secim) => void;
  onGit: (kare: number) => void;
  onKesimSurukle: (id: string, alan: { bas?: number; son?: number }) => void;
  onKatmanSurukle: (tur: KatmanTuru, id: string, alan: { bas: number; son: number }) => void;
  onSurukleBitti: () => void;
};

export function ZamanCizelgesi({ ad, gunluk, proje, duzen, kare, secim, onSec, onGit, onKesimSurukle, onKatmanSurukle, onSurukleBitti }: Props) {
  const giris = proje.kartlar.giris.acik ? proje.kartlar.giris.sure : 0;
  const kapanis = proje.kartlar.kapanis.acik ? proje.kartlar.kapanis.sure : 0;
  const kap = useRef<HTMLDivElement>(null);
  const [genislik, setGenislik] = useState(1000);
  const [yakin, setYakin] = useState(1);
  useEffect(() => {
    const el = kap.current;
    if (!el) return;
    const ro = new ResizeObserver(([g]) => setGenislik(g.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const videoSuresi = cikisSuresi(proje);
  const sure = giris + videoSuresi + kapanis; // kartlar dahil çıkış süresi
  const pps = (Math.max(200, genislik - PAY * 2) / Math.max(1, sure)) * yakin; // saniye başına piksel
  const vx = (t: number) => PAY + (giris + t) * pps; // video zamanının (kartsız) çizelgedeki yeri
  const toplamW = sure * pps + PAY * 2;

  // Cetvel aralığı: iki çizgi arası en az ~70 px.
  const adim = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((a) => a * pps >= 70) ?? 120;
  const cizgiler = useMemo(() => {
    const l: number[] = [];
    for (let t = 0; t <= sure + 1e-6; t += adim) l.push(t);
    return l;
  }, [sure, adim]);

  const kareAt = (clientX: number) => {
    const el = kap.current!;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - PAY;
    return (x / pps) * FPS;
  };
  /** Fare bırakılana kadar hareketleri izler. */
  const surukle = (hareket: (m: MouseEvent) => void, bitti?: () => void) => {
    const birak = () => {
      window.removeEventListener("mousemove", hareket);
      window.removeEventListener("mouseup", birak);
      bitti?.();
    };
    window.addEventListener("mousemove", hareket);
    window.addEventListener("mouseup", birak);
  };
  const sarBasla = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    onGit(kareAt(e.clientX));
    surukle((m) => onGit(kareAt(m.clientX)));
  };

  // --- kesim kenarını sürükleyerek kırpma ---
  const kenarSurukle = (e: React.MouseEvent, k: KesimDuzeni, kenar: "bas" | "son") => {
    e.stopPropagation();
    e.preventDefault();
    onSec({ tur: "kesim", id: k.id });
    const x0 = e.clientX;
    const { bas, son, hiz } = k;
    surukle((m) => {
      const dt = ((m.clientX - x0) / pps) * hiz; // ekrandaki px → kayıt saniyesi
      if (kenar === "bas") {
        const yeni = Math.max(0, Math.min(son - 0.2, bas + dt));
        onKesimSurukle(k.id, { bas: yeni });
        onGit((giris + k.cikisBas) * FPS);
      } else {
        const yeni = Math.min(gunluk.sure, Math.max(bas + 0.2, son + dt));
        onKesimSurukle(k.id, { son: yeni });
        onGit((giris + k.cikisBas + (yeni - bas) / hiz) * FPS - 1);
      }
    }, onSurukleBitti);
  };

  // --- katman bloğunu taşıma / uzatma ---
  const katmanSurukle = (e: React.MouseEvent, tur: KatmanTuru, x: { id: string; bas: number; son: number }, hiz: number, ne: "tasi" | "bas" | "son") => {
    e.stopPropagation();
    e.preventDefault();
    onSec({ tur, id: x.id });
    const x0 = e.clientX;
    const { bas, son } = x;
    const uzunluk = son - bas;
    if (ne === "tasi") onGit(kareAt(e.clientX));
    surukle((m) => {
      const dt = ((m.clientX - x0) / pps) * hiz;
      if (ne === "tasi") {
        const b = Math.max(0, Math.min(gunluk.sure - uzunluk, bas + dt));
        onKatmanSurukle(tur, x.id, { bas: b, son: b + uzunluk });
      } else if (ne === "bas") onKatmanSurukle(tur, x.id, { bas: Math.max(0, Math.min(son - 0.2, bas + dt)), son });
      else onKatmanSurukle(tur, x.id, { bas, son: Math.min(gunluk.sure, Math.max(bas + 0.2, son + dt)) });
    }, onSurukleBitti);
  };

  // --- küçük resim şeridi ---
  const oran = gunluk.genislik / gunluk.yukseklik;
  const kareG = (IZ_YUKSEKLIGI - 4) * oran; // şeritteki bir karenin ekrandaki genişliği
  const seritAdresi = `/medya/${ad}/serit.jpg`;
  const kucukResimler = (k: KesimDuzeni) => {
    const w = (k.cikisSon - k.cikisBas) * pps;
    const n = Math.max(1, Math.ceil(w / kareG));
    return Array.from({ length: n }, (_, i) => {
      const t = k.bas + (((i + 0.5) * kareG) / w) * (k.son - k.bas);
      const idx = Math.max(0, Math.min(SERIT_KARE - 1, Math.floor((t / gunluk.sure) * SERIT_KARE)));
      return (
        <div
          key={i}
          className="kucuk"
          style={{ left: i * kareG, width: kareG, backgroundImage: `url(${seritAdresi})`, backgroundSize: `${SERIT_KARE * kareG}px 100%`, backgroundPosition: `${-idx * kareG}px 0` }}
        />
      );
    });
  };

  // --- olay işaretleri (kesilen bölgedekiler görünmez) ---
  // Yakın adımların etiketleri üst üste binmesin: iki satıra dağıt.
  const satirSonu = [-Infinity, -Infinity];
  const adimIsaretleri = gunluk.adimlar
    .map((a) => ({ ...a, x: cikisZamani(duzen, a.bas) }))
    .filter((a) => a.x !== null)
    .map((a) => {
      const px = a.x! * pps;
      const satir = px - satirSonu[0] >= 64 ? 0 : px - satirSonu[1] >= 64 ? 1 : 0;
      satirSonu[satir] = px;
      return { ...a, satir };
    });
  const tiklar = gunluk.olaylar
    .filter((o) => o.tur === "tikla")
    .map((o) => ({ o, x: cikisZamani(duzen, o.t) }))
    .filter((v) => v.x !== null);

  const imlecX = PAY + (kare / FPS) * pps;
  // Oynatırken imleç görünür kalsın.
  useEffect(() => {
    const el = kap.current;
    if (!el) return;
    if (imlecX < el.scrollLeft + 40 || imlecX > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = imlecX - el.clientWidth / 3;
  }, [imlecX]);

  const katmanEtiketi = (tur: KatmanTuru, x: Record<string, unknown>) =>
    tur === "altyazilar" ? String(x.metin) : tur === "vurgular" ? (x.bicim === "karart" ? "karartma" : "kutu") : `${(x.oran as number).toFixed(1)}x${x.takip ? " · izle" : ""}`;

  return (
    <div className="cizelge">
      <div className="cizelge-arac">
        <span className="soluk">Yakınlaştır</span>
        <input type="range" min={1} max={12} step={0.25} value={yakin} onChange={(e) => setYakin(Number(e.target.value))} />
        <span className="soluk ipucu">Bölüme tıkla: seç · kenarı sürükle: kırp/uzat · katmanı sürükle: taşı · cetvele tıkla: git</span>
      </div>
      <div className="cizelge-govde">
        <div className="iz-adlari">
          <div style={{ height: 22 }} />
          <div className="iz-adi" style={{ height: 50 }}>Adımlar</div>
          {KATMANLAR.map((k) => <div key={k.tur} className="iz-adi katman-adi" style={{ color: k.renk }}>{k.ad}</div>)}
          <div className="iz-adi" style={{ height: IZ_YUKSEKLIGI }}>Video</div>
          <div className="iz-adi" style={{ height: 20 }}>Müzik</div>
        </div>
        <div className="cizelge-kaydir" ref={kap}>
          <div className="cizelge-ic" style={{ width: toplamW }}>
            <div className="cetvel" onMouseDown={sarBasla}>
              {cizgiler.map((t) => (
                <div key={t} className="cizgi" style={{ left: PAY + t * pps }}>
                  <span>{sureYaz(t).replace(/\.0$/, "")}</span>
                </div>
              ))}
            </div>

            <div className="iz olaylar" onMouseDown={sarBasla}>
              {adimIsaretleri.map((a) => (
                <div key={`a${a.no}`} className="adim" style={{ left: vx(a.x!), top: a.satir * 12 }} title={`Adım ${a.no}: ${a.tur}`}>
                  <span>{a.no} {a.tur}</span>
                </div>
              ))}
              {tiklar.map(({ o, x }, i) => (
                <div key={i} className="tik" style={{ left: vx(x!) }} title={`Tık · ${sureYaz(o.t)}`} />
              ))}
            </div>

            {KATMANLAR.map((kat) => (
              <div key={kat.tur} className="iz katman" onMouseDown={sarBasla}>
                {(proje[kat.tur] as { id: string; bas: number; son: number }[]).flatMap((x) =>
                  cikistakiParcalar(duzen, x.bas, x.son).map((pr, i) => (
                    <div
                      key={`${x.id}-${i}`}
                      className={`katman-blok ${secim?.id === x.id ? "secili" : ""}`}
                      style={{ left: vx(pr.cikisBas), width: Math.max(8, (pr.cikisSon - pr.cikisBas) * pps), background: kat.renk }}
                      onMouseDown={(e) => katmanSurukle(e, kat.tur, x, pr.kesim.hiz, "tasi")}
                      title={katmanEtiketi(kat.tur, x)}
                    >
                      <span>{katmanEtiketi(kat.tur, x)}</span>
                      <div className="kenar sol" onMouseDown={(e) => katmanSurukle(e, kat.tur, x, pr.kesim.hiz, "bas")} />
                      <div className="kenar sag" onMouseDown={(e) => katmanSurukle(e, kat.tur, x, pr.kesim.hiz, "son")} />
                    </div>
                  )),
                )}
              </div>
            ))}

            <div className="iz video" style={{ height: IZ_YUKSEKLIGI }} onMouseDown={sarBasla}>
              {duzen.map((k) => (
                <div
                  key={k.id}
                  className={`kesim ${secim?.tur === "kesim" && secim.id === k.id ? "secili" : ""}`}
                  style={{ left: vx(k.cikisBas), width: Math.max(6, (k.cikisSon - k.cikisBas) * pps) }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSec({ tur: "kesim", id: k.id });
                    onGit(kareAt(e.clientX));
                  }}
                >
                  <div className="kucukler">{kucukResimler(k)}</div>
                  {k.hiz !== 1 ? <span className="hiz-etiketi">{k.hiz}x</span> : null}
                  <div className="kenar sol" onMouseDown={(e) => kenarSurukle(e, k, "bas")} title="Başı kırp" />
                  <div className="kenar sag" onMouseDown={(e) => kenarSurukle(e, k, "son")} title="Sonu kırp" />
                </div>
              ))}
              {giris ? (
                <div className="kart-blok" style={{ left: PAY, width: giris * pps }} title="Giriş kartı (sağ panelde düzenlenir)">
                  <span>{proje.kartlar.giris.baslik || "Giriş"}</span>
                </div>
              ) : null}
              {kapanis ? (
                <div className="kart-blok" style={{ left: PAY + (giris + videoSuresi) * pps, width: kapanis * pps }} title="Kapanış kartı (sağ panelde düzenlenir)">
                  <span>{proje.kartlar.kapanis.baslik || "Kapanış"}</span>
                </div>
              ) : null}
            </div>

            <div className="iz ses" onMouseDown={sarBasla}>
              {proje.muzik ? (
                <div className="ses-blok" style={{ left: PAY, width: sure * pps }} title={proje.muzik.dosya}>
                  <span>♪ {proje.muzik.dosya}</span>
                </div>
              ) : null}
            </div>

            <div className="oynatma-imleci" style={{ left: imlecX }} />
          </div>
        </div>
      </div>
    </div>
  );
}
