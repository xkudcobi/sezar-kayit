// Düzenlenmiş videonun kendisi. Editördeki önizleme (@remotion/player) ve MP4 dışa aktarma (@remotion/renderer)
// aynı bileşeni kullanır; ikisi birebir aynı görünür.
//
// Zaman: [giriş kartı] [video] [kapanış kartı]; kartlar videonun ilk/son KART_GECISI saniyesinin üstünde yumuşakça geçer.
// Video katmanları: zemin (sığdırmada) → kayıt kutusu [kamera: video + vurgular + imleç] → altyazı (ekrana sabit).
import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import {
  KART_GECISI, fareKonumu, fareYolu, girisKare, gorunurluk, kapanisKare, kayitBoyutu, kaynakZamani, kesimDuzeni,
  tiklamalar, videoKare, yumusak,
  type FareNoktasi, type Gunluk, type Kart, type KesimDuzeni, type Proje,
} from "./proje";

export type KompozisyonProps = {
  proje: Proje;
  gunluk: Gunluk;
  video: string;
  /** Müzik dosyasının adresi (proje.muzik.dosya'dan; önizlemede göreli, dışa aktarmada tam adres). */
  muzik?: string | null;
  /** Editörde oynatıcıya kutu çizerken: kayıt tam ekran, yakınlaştırma ve kartlar yok; koordinatlar ham görüntüye göre. */
  cizimModu?: boolean;
};

export const Kompozisyon: React.FC<KompozisyonProps> = ({ proje, gunluk, video, muzik, cizimModu }) => {
  const { fps } = useVideoConfig();
  const gk = girisKare(proje, fps);
  const vk = videoKare(proje, fps);
  const kk = kapanisKare(proje, fps);
  const F = Math.round(KART_GECISI * fps);
  const toplam = gk + vk + kk;
  const m = proje.muzik;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0f1115", overflow: "hidden" }}>
      <Sequence from={gk} durationInFrames={vk} premountFor={fps}>
        <Sahne proje={proje} gunluk={gunluk} video={video} cizimModu={cizimModu} />
      </Sequence>
      {!cizimModu && gk ? (
        <Sequence from={0} durationInFrames={gk + Math.min(F, vk)}>
          <KartGorunumu kart={proje.kartlar.giris} uzunluk={gk + Math.min(F, vk)} girisGecisi={0} cikisGecisi={Math.min(F, vk)} />
        </Sequence>
      ) : null}
      {!cizimModu && kk ? (
        <Sequence from={gk + vk - Math.min(F, vk)} durationInFrames={kk + Math.min(F, vk)}>
          <KartGorunumu kart={proje.kartlar.kapanis} uzunluk={kk + Math.min(F, vk)} girisGecisi={Math.min(F, vk)} cikisGecisi={0} />
        </Sequence>
      ) : null}
      {m && muzik && !cizimModu ? (
        <Html5Audio
          src={muzik}
          trimBefore={Math.round(m.baslangic * fps)}
          loop
          volume={(f) => {
            const giris = m.girisYumusak > 0 ? f / (m.girisYumusak * fps) : 1;
            const cikis = m.cikisYumusak > 0 ? (toplam - f) / (m.cikisYumusak * fps) : 1;
            return m.ses * Math.max(0, Math.min(1, giris, cikis));
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

// --- video sahnesi ---

const Videolar: React.FC<{ duzen: KesimDuzeni[]; video: string; kapla?: boolean }> = ({ duzen, video, kapla }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {duzen.map((k) => (
        <Sequence key={k.id} from={k.kareBas} durationInFrames={k.kareSayisi} premountFor={fps}>
          <OffthreadVideo src={video} trimBefore={Math.round(k.bas * fps)} playbackRate={k.hiz} muted pauseWhenBuffering style={{ width: "100%", height: "100%", objectFit: kapla ? "cover" : "fill" }} />
        </Sequence>
      ))}
    </>
  );
};

const Sahne: React.FC<{ proje: Proje; gunluk: Gunluk; video: string; cizimModu?: boolean }> = ({ proje, gunluk, video, cizimModu }) => {
  const frame = useCurrentFrame();
  const { fps, width: OW, height: OH } = useVideoConfig();
  const { w: RW, h: RH } = kayitBoyutu(gunluk);
  const duzen = useMemo(() => kesimDuzeni(proje, fps), [proje, fps]);
  const yol = useMemo(() => fareYolu(gunluk), [gunluk]);
  const an = kaynakZamani(duzen, frame / fps);
  const t = an?.t ?? 0;
  const kamera = cizimModu ? { s: 1, sol: 0, ust: 0 } : kameraHesapla(proje, gunluk, yol, t, RW, RH);

  // Kaydın çıkış karesine yerleşimi: ölçek s0 ve sol üst köşe (ox, oy).
  const c = proje.cikis;
  const telefonCerceve = gunluk.gorunum === "telefon" && c.telefonCercevesi && !cizimModu;
  const ayni = cizimModu || (Math.abs(OW / OH - RW / RH) < 0.01 && !telefonCerceve);
  const sigdir = !ayni && (c.yerlesim === "sigdir" || telefonCerceve);
  let s0 = OW / RW, ox = 0, oy = 0;
  if (!ayni) {
    if (sigdir) {
      s0 = Math.min(OW / RW, OH / RH) * (telefonCerceve ? 0.86 : 1);
      ox = (OW - RW * s0) / 2;
      oy = (OH - RH * s0) / 2;
    } else {
      s0 = Math.max(OW / RW, OH / RH);
      // Odak: imleci izle (yumuşatılmış) ya da elle seçilen kadraj.
      let fx = c.kadraj.x * RW, fy = c.kadraj.y * RH;
      if (c.kadrajTakip) {
        let x = 0, y = 0, n = 0;
        for (let i = 0; i < 24; i++) {
          const f = fareKonumu(yol, t - i * 0.05);
          if (f) { x += f.x; y += f.y; n++; }
        }
        if (n) { fx = (x / n) * gunluk.olcek; fy = (y / n) * gunluk.olcek; }
      }
      // Odağı kameradan geçir: yakınlaştırma varken odak, büyütülmüş görüntüdeki yerine gelir (s=1'de değişmez).
      fx = (fx - kamera.sol) * kamera.s;
      fy = (fy - kamera.ust) * kamera.s;
      ox = Math.max(OW - RW * s0, Math.min(0, OW / 2 - fx * s0));
      oy = Math.max(OH - RH * s0, Math.min(0, OH / 2 - fy * s0));
    }
  }

  return (
    <AbsoluteFill>
      {sigdir ? <Zemin tur={c.zemin} duzen={duzen} video={video} /> : null}
      <div
        style={{
          position: "absolute",
          left: ox,
          top: oy,
          width: RW,
          height: RH,
          transformOrigin: "0 0",
          transform: `scale(${s0})`,
          overflow: "hidden",
          borderRadius: telefonCerceve ? RW * 0.075 : sigdir ? 14 / s0 : 0,
          boxShadow: telefonCerceve
            ? `0 0 0 ${RW * 0.03}px #0b0c10, 0 0 0 ${RW * 0.036}px #2b2f38, 0 ${40 / s0}px ${110 / s0}px rgba(0,0,0,.5)`
            : sigdir ? `0 ${20 / s0}px ${60 / s0}px rgba(0,0,0,.45)` : undefined,
          backgroundColor: "#000",
        }}
      >
        <AbsoluteFill style={{ transformOrigin: "0 0", transform: `scale(${kamera.s}) translate(${-kamera.sol}px, ${-kamera.ust}px)` }}>
          <Videolar duzen={duzen} video={video} />
          <Vurgular proje={proje} olcek={gunluk.olcek} t={t} />
          {proje.imlec.goster && an ? <Imlec proje={proje} gunluk={gunluk} yol={yol} t={t} kesim={an.kesim} /> : null}
        </AbsoluteFill>
      </div>
      {!cizimModu ? <Altyazilar proje={proje} t={t} W={OW} H={OH} /> : null}
    </AbsoluteFill>
  );
};

/** Sığdırmada kaydın çevresinde kalan alan: Sezar renginde yumuşak bir zemin ya da kaydın bulanık kopyası. */
const Zemin: React.FC<{ tur: "renk" | "bulanik"; duzen: KesimDuzeni[]; video: string }> = ({ tur, duzen, video }) =>
  tur === "bulanik" ? (
    <AbsoluteFill style={{ filter: "blur(40px) brightness(0.6) saturate(1.2)", transform: "scale(1.15)" }}>
      <Videolar duzen={duzen} video={video} kapla />
    </AbsoluteFill>
  ) : (
    <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 0%, #6d66f0 0%, #4f46e5 38%, #2e2a8f 100%)" }} />
  );

// --- yakınlaştırma (kamera) ---

/** t anındaki kamera: ölçek ve görünen pencerenin sol üst köşesi (kayıt pikseli). Pencere görüntünün dışına taşmaz. */
function kameraHesapla(p: Proje, g: Gunluk, yol: FareNoktasi[], t: number, W: number, H: number) {
  let s = 1;
  let merkez = { x: W / 2, y: H / 2 };
  for (const z of p.yakinlastirmalar) {
    const v = gorunurluk(z, t, z.gecis);
    const zs = 1 + (z.oran - 1) * v;
    if (v <= 0 || zs <= s) continue;
    s = zs;
    if (z.takip) {
      // İmleci izle: son 0,5 sn'nin ortalaması, titremesin.
      let x = 0, y = 0, n = 0;
      for (let i = 0; i < 10; i++) {
        const f = fareKonumu(yol, t - i * 0.05);
        if (f) { x += f.x; y += f.y; n++; }
      }
      merkez = n ? { x: (x / n) * g.olcek, y: (y / n) * g.olcek } : { x: z.merkez.x * g.olcek, y: z.merkez.y * g.olcek };
    } else merkez = { x: z.merkez.x * g.olcek, y: z.merkez.y * g.olcek };
  }
  const sinirla = (v: number, en: number) => Math.max(0, Math.min(en, v));
  return { s, sol: sinirla(merkez.x - W / (2 * s), W - W / s), ust: sinirla(merkez.y - H / (2 * s), H - H / s) };
}

// --- kartlar ---

const KART_TEMASI = {
  mor: { arka: "radial-gradient(120% 100% at 50% 0%, #6d66f0 0%, #4f46e5 45%, #312c99 100%)", yazi: "#fff", soluk: "rgba(255,255,255,.78)", logo: "#fff" },
  koyu: { arka: "radial-gradient(120% 100% at 50% 0%, #1e222b 0%, #0f1115 70%)", yazi: "#fff", soluk: "rgba(255,255,255,.65)", logo: "#6d66f0" },
  acik: { arka: "radial-gradient(120% 100% at 50% 0%, #ffffff 0%, #eef0fa 100%)", yazi: "#111827", soluk: "#5b6170", logo: "#4f46e5" },
} as const;

/** Sezar anahtar işareti (C:/dev/sezar/site/img/sezar-logo.svg ile aynı çizim). */
const SezarIsareti: React.FC<{ boy: number; renk: string }> = ({ boy, renk }) => (
  <svg viewBox="470 220 260 460" height={boy} width={(boy * 260) / 460} fill={renk}>
    <rect x="575" y="228" width="48" height="202" />
    <rect x="623" y="294" width="47" height="46" />
    <rect x="670" y="248" width="46" height="46" />
    <rect x="670" y="340" width="46" height="46" />
    <path
      fillRule="evenodd"
      d="M575 428 A97 97 0 0 1 478 525 L478 573 A97 97 0 0 1 575 670 L623 670 A98 98 0 0 1 721 573 L721 525 A98 98 0 0 1 623 428 Z M599 507 Q607 540 640 548 Q607 556 599 589 Q591 556 558 548 Q591 540 599 507 Z"
    />
  </svg>
);

const KartGorunumu: React.FC<{ kart: Kart; uzunluk: number; girisGecisi: number; cikisGecisi: number }> = ({ kart, uzunluk, girisGecisi, cikisGecisi }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const tema = KART_TEMASI[kart.tema];
  const opaklik = Math.min(girisGecisi ? frame / girisGecisi : 1, cikisGecisi ? (uzunluk - frame) / cikisGecisi : 1);
  // İçerik sırayla belirir: logo, başlık, alt satır.
  const belir = (gecikme: number) => yumusak((frame - girisGecisi - gecikme * fps) / (0.55 * fps));
  const kisa = Math.min(W, H);
  const satir = (gecikme: number): React.CSSProperties => ({ opacity: belir(gecikme), transform: `translateY(${(1 - belir(gecikme)) * kisa * 0.03}px)` });
  return (
    <AbsoluteFill style={{ background: tema.arka, opacity: Math.max(0, Math.min(1, opaklik)), justifyContent: "center", alignItems: "center", fontFamily: '"Segoe UI", Inter, system-ui, sans-serif', textAlign: "center", padding: kisa * 0.08 }}>
      {kart.logo ? (
        <div style={{ ...satir(0), marginBottom: kisa * 0.045 }}>
          <SezarIsareti boy={kisa * 0.15} renk={tema.logo} />
        </div>
      ) : null}
      {kart.baslik ? (
        <div style={{ ...satir(0.12), color: tema.yazi, fontSize: kisa * 0.085, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, whiteSpace: "pre-wrap" }}>{kart.baslik}</div>
      ) : null}
      {kart.altBaslik ? (
        <div style={{ ...satir(0.28), color: tema.soluk, fontSize: kisa * 0.038, fontWeight: 500, marginTop: kisa * 0.03, lineHeight: 1.35, maxWidth: "85%", whiteSpace: "pre-wrap" }}>{kart.altBaslik}</div>
      ) : null}
    </AbsoluteFill>
  );
};

// --- vurgu ---

const Vurgular: React.FC<{ proje: Proje; olcek: number; t: number }> = ({ proje, olcek: k, t }) => (
  <>
    {proje.vurgular.map((v) => {
      const g = gorunurluk(v, t, 0.25);
      if (g <= 0 || !v.kutu) return null;
      const pay = 8 * k;
      const ortak: React.CSSProperties = {
        position: "absolute",
        left: v.kutu.x * k - pay,
        top: v.kutu.y * k - pay,
        width: v.kutu.w * k + pay * 2,
        height: v.kutu.h * k + pay * 2,
        borderRadius: 12 * k,
        transform: `scale(${0.97 + 0.03 * g})`,
        pointerEvents: "none",
      };
      return v.bicim === "karart" ? (
        <div key={v.id} style={{ ...ortak, boxShadow: `0 0 0 99999px rgba(10, 12, 18, ${0.55 * g})`, border: `${2 * k}px solid rgba(255,255,255,${0.7 * g})` }} />
      ) : (
        <div
          key={v.id}
          style={{
            ...ortak,
            border: `${3 * k}px solid rgba(109, 102, 240, ${g})`,
            boxShadow: `0 0 0 ${4 * k}px rgba(109, 102, 240, ${0.22 * g}), 0 0 ${26 * k}px rgba(109, 102, 240, ${0.45 * g})`,
          }}
        />
      );
    })}
  </>
);

// --- altyazı ---

const ALTYAZI_RENK = {
  koyu: { background: "rgba(15, 17, 21, 0.88)", color: "#fff", boxShadow: "0 8px 30px rgba(0,0,0,.35)" },
  acik: { background: "rgba(255, 255, 255, 0.96)", color: "#111827", boxShadow: "0 8px 30px rgba(0,0,0,.25)" },
  mor: { background: "#4f46e5", color: "#fff", boxShadow: "0 8px 30px rgba(79,70,229,.45)" },
} as const;

const Altyazilar: React.FC<{ proje: Proje; t: number; W: number; H: number }> = ({ proje, t, W, H }) => {
  // Üst üste binen altyazılardan en son başlayanı göster.
  const aktif = proje.altyazilar.filter((a) => t >= a.bas && t <= a.son).sort((a, b) => b.bas - a.bas)[0];
  if (!aktif || !aktif.metin.trim()) return null;
  const g = gorunurluk(aktif, t, 0.2);
  const st = proje.altyaziStili;
  const boyut = Math.min(W, H) * 0.037 * st.boyut;
  return (
    <AbsoluteFill style={{ justifyContent: st.konum === "alt" ? "flex-end" : "flex-start", alignItems: "center", padding: `${H * 0.07}px ${W * 0.06}px`, pointerEvents: "none" }}>
      <div
        style={{
          ...ALTYAZI_RENK[st.gorunum],
          fontFamily: '"Segoe UI", Inter, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: boyut,
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
          padding: `${boyut * 0.45}px ${boyut * 0.9}px`,
          borderRadius: boyut * 0.6,
          maxWidth: "88%",
          textAlign: "center",
          whiteSpace: "pre-wrap",
          opacity: g,
          transform: `translateY(${(1 - g) * boyut * 0.4 * (st.konum === "alt" ? 1 : -1)}px)`,
        }}
      >
        {aktif.metin}
      </div>
    </AbsoluteFill>
  );
};

// --- imleç ---

const TIK_SURESI = 0.45;

const Imlec: React.FC<{ proje: Proje; gunluk: Gunluk; yol: FareNoktasi[]; t: number; kesim: KesimDuzeni }> = ({ proje, gunluk, yol, t, kesim }) => {
  const tiklar = useMemo(() => tiklamalar(gunluk), [gunluk]);
  const k = gunluk.olcek;
  const telefon = gunluk.gorunum === "telefon";
  const boyut = proje.imlec.boyut;

  // Tık halkası: tıklamadan sonraki TIK_SURESI boyunca genişleyip söner. Kesilen bölgedeki tık çizilmez.
  const tik = proje.imlec.tik ? tiklar.find((c) => t >= c.t && t - c.t < TIK_SURESI && c.t >= kesim.bas) : undefined;
  const halka = tik ? (t - tik.t) / TIK_SURESI : null;
  const konum = fareKonumu(yol, t);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {tik && halka !== null ? (
        <div
          style={{
            position: "absolute",
            left: tik.x * k,
            top: tik.y * k,
            width: 46 * k * boyut,
            height: 46 * k * boyut,
            marginLeft: -23 * k * boyut,
            marginTop: -23 * k * boyut,
            borderRadius: "50%",
            border: `${3 * k}px solid rgba(79, 70, 229, ${0.9 * (1 - halka)})`,
            background: `rgba(79, 70, 229, ${0.18 * (1 - halka)})`,
            transform: `scale(${0.35 + halka * 0.9})`,
          }}
        />
      ) : null}
      {konum && !konum.gizli && !telefon ? (
        <svg
          width={26 * k * boyut}
          height={26 * k * boyut}
          viewBox="0 0 24 24"
          style={{ position: "absolute", left: konum.x * k - 4 * k * boyut, top: konum.y * k - 2 * k * boyut, overflow: "visible", filter: `drop-shadow(0 ${1.5 * k}px ${2.5 * k}px rgba(0,0,0,.35))` }}
        >
          <path d="M5 2.5 L5 19.5 L9.4 15.3 L12.3 21.6 L15.2 20.3 L12.4 14.1 L18.6 14.1 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};
