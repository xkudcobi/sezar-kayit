import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Kompozisyon } from "../ortak/Kompozisyon";
import {
  FPS, ORANLAR, cikisBoyutu, cikisSuresi, girisKare, kayitBoyutu, kaynakZamani, kesimDuzeni, projeyiTamamla,
  senaryodanAltyazilar, senaryodanVurgular, senaryodanYakinlastirmalar, sureYaz, toplamKare, varsayilanProje, videoKare, yeniId,
  type Altyazi, type Gunluk, type Kart, type Kesim, type Kutu, type Oran, type Proje, type Vurgu, type Yakinlastirma,
} from "../ortak/proje";
import { ZamanCizelgesi, type KatmanTuru, type Secim } from "./ZamanCizelgesi";

type KayitOzeti = { ad: string; sure: number; gorunum: string; durum: string; olusturma: string; projeVar: boolean };
type Is = { durum: string; ilerleme: number; cikti?: string; ciktilar?: string[]; sira?: string; hata?: string };
type KayitDurumu = "kaydedildi" | "bekliyor" | "kaydediliyor" | "hata";
type Cizim = { ne: "kutu" | "merkez" | "kadraj"; id: string } | null;
type MuzikDosyasi = { ad: string; boyut: number };

const HIZLAR = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const KATMAN_ADI: Record<KatmanTuru, string> = { altyazilar: "Altyazı", vurgular: "Vurgu", yakinlastirmalar: "Yakınlaştırma" };
const api = async <T,>(yol: string, secenek?: RequestInit): Promise<T> => {
  const r = await fetch(yol, { ...secenek, headers: { "content-type": "application/json" } });
  const v = await r.json();
  if (!r.ok) throw new Error(v.hata ?? `İstek başarısız (${r.status})`);
  return v as T;
};

export function App() {
  const [kayitlar, setKayitlar] = useState<KayitOzeti[]>([]);
  const [ad, setAd] = useState<string | null>(() => decodeURIComponent(location.hash.replace(/^#\/?/, "")) || null);
  const [gunluk, setGunluk] = useState<Gunluk | null>(null);
  const [proje, setProjeDurumu] = useState<Proje | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    api<KayitOzeti[]>("/api/kayitlar")
      .then((l) => {
        setKayitlar(l);
        setAd((a) => (a && l.some((k) => k.ad === a) ? a : l[0]?.ad ?? null));
      })
      .catch((e) => setHata(e.message));
  }, []);

  useEffect(() => {
    if (!ad) return;
    history.replaceState(null, "", `#/${ad}`);
    setGunluk(null);
    setProjeDurumu(null);
    api<{ gunluk: Gunluk; proje: Proje | null }>(`/api/kayit/${ad}`)
      .then(({ gunluk, proje }) => {
        setGunluk(gunluk);
        setProjeDurumu(proje ? projeyiTamamla(proje, gunluk) : varsayilanProje(ad, gunluk));
      })
      .catch((e) => setHata(e.message));
  }, [ad]);

  if (hata) return <div className="bos">Hata: {hata}</div>;
  if (!kayitlar.length) return <div className="bos">Henüz kayıt yok. Önce <code>npm run kayit -- &lt;senaryo&gt;</code> ile bir kayıt alın.</div>;
  return (
    <div className="uygulama">
      {ad && gunluk && proje ? (
        <Duzenleyici key={ad} ad={ad} gunluk={gunluk} ilkProje={proje} kayitlar={kayitlar} kayitSec={setAd} />
      ) : (
        <div className="bos">Yükleniyor…</div>
      )}
    </div>
  );
}

function Duzenleyici({ ad, gunluk, ilkProje, kayitlar, kayitSec }: { ad: string; gunluk: Gunluk; ilkProje: Proje; kayitlar: KayitOzeti[]; kayitSec: (a: string) => void }) {
  // --- proje durumu, geri al / yinele ---
  const [proje, setProje] = useState(ilkProje);
  const projeRef = useRef(proje);
  projeRef.current = proje;
  const gecmis = useRef<Proje[]>([]);
  const ileri = useRef<Proje[]>([]);
  const [, yenile] = useState(0);

  const degistir = useCallback((fn: (p: Proje) => Proje) => {
    const p = projeRef.current;
    const y = fn(p);
    if (y === p) return;
    gecmis.current.push(p);
    if (gecmis.current.length > 300) gecmis.current.shift();
    ileri.current = [];
    setProje(y);
  }, []);
  /** Sürükleme sırasında: geçmişe yazmadan güncelle; bitince surukleBitti ile tek adım olarak kaydedilir. */
  const surukleBasi = useRef<Proje | null>(null);
  const geciciDegistir = useCallback((fn: (p: Proje) => Proje) => {
    surukleBasi.current ??= projeRef.current;
    setProje(fn(projeRef.current));
  }, []);
  const surukleBitti = useCallback(() => {
    const bas = surukleBasi.current;
    surukleBasi.current = null;
    if (bas && bas !== projeRef.current) {
      gecmis.current.push(bas);
      ileri.current = [];
      yenile((n) => n + 1);
    }
  }, []);
  const geriAl = useCallback(() => {
    const p = gecmis.current.pop();
    if (!p) return;
    ileri.current.push(projeRef.current);
    setProje(p);
  }, []);
  const yinele = useCallback(() => {
    const p = ileri.current.pop();
    if (!p) return;
    gecmis.current.push(projeRef.current);
    setProje(p);
  }, []);

  // --- otomatik kaydetme ---
  const [kayitDurumu, setKayitDurumu] = useState<KayitDurumu>("kaydedildi");
  const sonKaydedilen = useRef<Proje | null>(null);
  const kaydet = useCallback(async () => {
    const p = projeRef.current;
    if (p === sonKaydedilen.current) return;
    setKayitDurumu("kaydediliyor");
    try {
      await api(`/api/kayit/${ad}/proje`, { method: "PUT", body: JSON.stringify(p) });
      sonKaydedilen.current = p;
      setKayitDurumu(projeRef.current === p ? "kaydedildi" : "bekliyor");
    } catch {
      setKayitDurumu("hata");
    }
  }, [ad]);
  useEffect(() => {
    if (proje === sonKaydedilen.current) return;
    setKayitDurumu("bekliyor");
    const z = setTimeout(kaydet, 500);
    return () => clearTimeout(z);
  }, [proje, kaydet]);
  // Sekme gizlenir ya da kapanırsa bekleyen değişikliği hemen gönder (arka plandaki sekmede zamanlayıcılar ertelenir).
  useEffect(() => {
    const hemen = () => {
      const p = projeRef.current;
      if (p === sonKaydedilen.current) return;
      fetch(`/api/kayit/${ad}/proje`, { method: "PUT", body: JSON.stringify(p), headers: { "content-type": "application/json" }, keepalive: true })
        .then((r) => { if (r.ok) sonKaydedilen.current = p; })
        .catch(() => {});
    };
    const gorunurluk = () => document.visibilityState === "hidden" && hemen();
    document.addEventListener("visibilitychange", gorunurluk);
    window.addEventListener("pagehide", hemen);
    return () => {
      document.removeEventListener("visibilitychange", gorunurluk);
      window.removeEventListener("pagehide", hemen);
    };
  }, [ad]);

  // --- oynatıcı ---
  const oynatici = useRef<PlayerRef>(null);
  const [kare, setKare] = useState(0);
  const [oynuyor, setOynuyor] = useState(false);
  const [cizim, setCizim] = useState<Cizim>(null);
  const duzen = useMemo(() => kesimDuzeni(proje), [proje]);
  const kareSayisi = toplamKare(proje);
  const kayit = kayitBoyutu(gunluk);
  // Çizimde kayıt tam ekran ve yakınlaştırmasız gösterilir (koordinatlar ham görüntüye göre); yoksa seçili çıkış oranı.
  const { w: W, h: H } = cizim ? kayit : cikisBoyutu(proje.cikis.oran);
  const video = `/medya/${ad}/ham.mp4`;
  const muzik = proje.muzik ? `/muzik/${encodeURIComponent(proje.muzik.dosya)}` : null;
  const inputProps = useMemo(() => ({ proje, gunluk, video, muzik, cizimModu: !!cizim }), [proje, gunluk, video, muzik, cizim]);
  const gk = girisKare(proje);
  const vk = videoKare(proje);

  // Oynatıcının durumu her ekran karesinde okunur (olay bildirimleri her durumda gelmiyordu).
  useEffect(() => {
    let id = 0;
    const dongu = () => {
      const o = oynatici.current;
      if (o) {
        const f = o.getCurrentFrame();
        setKare((k) => (k === f ? k : f));
        const p = o.isPlaying();
        setOynuyor((x) => (x === p ? x : p));
      }
      id = requestAnimationFrame(dongu);
    };
    id = requestAnimationFrame(dongu);
    return () => cancelAnimationFrame(id);
  }, []);
  const git = useCallback((k: number) => oynatici.current?.seekTo(Math.max(0, Math.min(kareSayisi - 1, Math.round(k)))), [kareSayisi]);
  useEffect(() => {
    if (kare > kareSayisi - 1) git(kareSayisi - 1);
  }, [kareSayisi, kare, git]);

  // Oynatıcı alanını sığdır.
  const sahne = useRef<HTMLDivElement>(null);
  const [sahneBoyutu, setSahneBoyutu] = useState({ w: 800, h: 450 });
  useEffect(() => {
    const el = sahne.current;
    if (!el) return;
    const ro = new ResizeObserver(([g]) => setSahneBoyutu({ w: g.contentRect.width, h: g.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const olcek = Math.min(sahneBoyutu.w / W, sahneBoyutu.h / H);

  // --- seçim ---
  const [secim, setSecim] = useState<Secim>(proje.kesimler[0] ? { tur: "kesim", id: proje.kesimler[0].id } : null);
  const seciliKesim = secim?.tur === "kesim" ? proje.kesimler.find((k) => k.id === secim.id) ?? null : null;
  const seciliKatman =
    secim && secim.tur !== "kesim" ? (proje[secim.tur] as (Altyazi | Vurgu | Yakinlastirma)[]).find((x) => x.id === secim.id) ?? null : null;
  // Kartların üstündeyken kayıtta bir an yok.
  const simdi = kare >= gk && kare < gk + vk ? kaynakZamani(duzen, (kare - gk) / FPS) : null;

  // --- kesim işlemleri ---
  const kesimGuncelle = (id: string, alan: Partial<Kesim>) =>
    degistir((p) => ({ ...p, kesimler: p.kesimler.map((k) => (k.id === id ? { ...k, ...alan } : k)) }));
  const bol = () => {
    if (!simdi) return;
    const { kesim, t } = simdi;
    if (t - kesim.bas < 0.1 || kesim.son - t < 0.1) return;
    const yeni = { id: yeniId(), bas: t, son: kesim.son, hiz: kesim.hiz };
    degistir((p) => ({ ...p, kesimler: p.kesimler.flatMap((k) => (k.id === kesim.id ? [{ ...k, son: t }, yeni] : [k])) }));
    setSecim({ tur: "kesim", id: yeni.id });
  };
  const basiBuraya = () => {
    if (!simdi || simdi.t >= simdi.kesim.son - 0.1) return;
    kesimGuncelle(simdi.kesim.id, { bas: simdi.t });
    setSecim({ tur: "kesim", id: simdi.kesim.id });
  };
  const sonuBuraya = () => {
    if (!simdi || simdi.t <= simdi.kesim.bas + 0.1) return;
    kesimGuncelle(simdi.kesim.id, { son: simdi.t });
    setSecim({ tur: "kesim", id: simdi.kesim.id });
  };

  // --- katman işlemleri ---
  const katmanGuncelle = (tur: KatmanTuru, id: string, alan: Record<string, unknown>) =>
    degistir((p) => ({ ...p, [tur]: (p[tur] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...alan } : x)) }));
  const katmanEkle = (tur: KatmanTuru) => {
    const t = simdi?.t ?? 0;
    const son = Math.min(gunluk.sure, t + 2.5);
    const id = yeniId();
    const yeni =
      tur === "altyazilar"
        ? ({ id, bas: t, son, metin: "Yeni altyazı" } satisfies Altyazi)
        : tur === "vurgular"
          ? ({ id, bas: t, son, bicim: "kutu", kutu: { x: gunluk.genislik * 0.35, y: gunluk.yukseklik * 0.35, w: gunluk.genislik * 0.3, h: gunluk.yukseklik * 0.3 } } satisfies Vurgu)
          : ({ id, bas: Math.max(0, t - 0.3), son: Math.min(gunluk.sure, t + 3), oran: 1.6, merkez: { x: gunluk.genislik / 2, y: gunluk.yukseklik / 2 }, takip: false, gecis: 0.6 } satisfies Yakinlastirma);
    degistir((p) => ({ ...p, [tur]: [...(p[tur] as unknown[]), yeni] }));
    setSecim({ tur, id });
    // Vurgu ve yakınlaştırma için yer seçimi hemen başlasın.
    if (tur === "vurgular") setCizim({ ne: "kutu", id });
    if (tur === "yakinlastirmalar") setCizim({ ne: "merkez", id });
  };
  const senaryodanDoldur = () =>
    degistir((p) => {
      const a = senaryodanAltyazilar(gunluk, p), v = senaryodanVurgular(gunluk, p), y = senaryodanYakinlastirmalar(gunluk, p);
      if (!a.length && !v.length && !y.length) return p;
      return { ...p, altyazilar: [...p.altyazilar, ...a], vurgular: [...p.vurgular, ...v], yakinlastirmalar: [...p.yakinlastirmalar, ...y] };
    });
  const eklenebilir = senaryodanAltyazilar(gunluk, proje).length + senaryodanVurgular(gunluk, proje).length + senaryodanYakinlastirmalar(gunluk, proje).length;

  const sil = () => {
    if (!secim) return;
    if (secim.tur === "kesim") {
      if (proje.kesimler.length < 2) return;
      const i = proje.kesimler.findIndex((k) => k.id === secim.id);
      degistir((p) => ({ ...p, kesimler: p.kesimler.filter((k) => k.id !== secim.id) }));
      const yan = proje.kesimler[i + 1] ?? proje.kesimler[i - 1];
      setSecim(yan ? { tur: "kesim", id: yan.id } : null);
    } else {
      const tur = secim.tur;
      degistir((p) => ({ ...p, [tur]: (p[tur] as { id: string }[]).filter((x) => x.id !== secim.id) }));
      setSecim(null);
    }
  };
  const imlecAyari = (alan: Partial<Proje["imlec"]>) => degistir((p) => ({ ...p, imlec: { ...p.imlec, ...alan } }));
  const altyaziStili = (alan: Partial<Proje["altyaziStili"]>) => degistir((p) => ({ ...p, altyaziStili: { ...p.altyaziStili, ...alan } }));
  const cikisAyari = (alan: Partial<Proje["cikis"]>) => degistir((p) => ({ ...p, cikis: { ...p.cikis, ...alan } }));
  const kartAyari = (hangi: "giris" | "kapanis", alan: Partial<Kart>) =>
    degistir((p) => ({ ...p, kartlar: { ...p.kartlar, [hangi]: { ...p.kartlar[hangi], ...alan } } }));
  const muzikAyari = (alan: Partial<NonNullable<Proje["muzik"]>>) => degistir((p) => (p.muzik ? { ...p, muzik: { ...p.muzik, ...alan } } : p));

  // --- müzik dosyaları (muzik/ klasörü) ---
  const [muzikler, setMuzikler] = useState<MuzikDosyasi[]>([]);
  const [muzikHatasi, setMuzikHatasi] = useState<string | null>(null);
  const muzikleriYenile = useCallback(() => api<MuzikDosyasi[]>("/api/muzikler").then(setMuzikler).catch(() => {}), []);
  useEffect(() => { muzikleriYenile(); }, [muzikleriYenile]);
  const muzikSec = (dosya: string) =>
    degistir((p) => ({ ...p, muzik: dosya ? { dosya, ses: p.muzik?.ses ?? 0.5, girisYumusak: p.muzik?.girisYumusak ?? 1, cikisYumusak: p.muzik?.cikisYumusak ?? 2, baslangic: 0 } : null }));
  const muzikYukle = async (dosya: File) => {
    setMuzikHatasi(null);
    try {
      const r = await fetch(`/api/muzik/${encodeURIComponent(dosya.name)}`, { method: "PUT", body: dosya });
      const v = await r.json();
      if (!r.ok) throw new Error(v.hata);
      await muzikleriYenile();
      muzikSec(v.ad);
    } catch (e) {
      setMuzikHatasi((e as Error).message);
    }
  };

  // --- oynatıcıda çizim: vurgu kutusu ya da yakınlaştırma merkezi ---
  const cizimAlani = useRef<HTMLDivElement>(null);
  const [cizilen, setCizilen] = useState<Kutu | null>(null);
  const noktaAl = (e: { clientX: number; clientY: number }) => {
    const r = cizimAlani.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * gunluk.genislik;
    const y = ((e.clientY - r.top) / r.height) * gunluk.yukseklik;
    return { x: Math.max(0, Math.min(gunluk.genislik, x)), y: Math.max(0, Math.min(gunluk.yukseklik, y)) };
  };
  const cizimBasla = (e: React.MouseEvent) => {
    if (!cizim) return;
    e.preventDefault();
    const a = noktaAl(e);
    if (cizim.ne === "merkez") {
      katmanGuncelle("yakinlastirmalar", cizim.id, { merkez: { x: Math.round(a.x), y: Math.round(a.y) } });
      setCizim(null);
      return;
    }
    if (cizim.ne === "kadraj") {
      cikisAyari({ kadraj: { x: +(a.x / gunluk.genislik).toFixed(3), y: +(a.y / gunluk.yukseklik).toFixed(3) }, kadrajTakip: false });
      setCizim(null);
      return;
    }
    const kutuYap = (b: { x: number; y: number }) => ({ x: Math.round(Math.min(a.x, b.x)), y: Math.round(Math.min(a.y, b.y)), w: Math.round(Math.abs(b.x - a.x)), h: Math.round(Math.abs(b.y - a.y)) });
    const hareket = (m: MouseEvent) => setCizilen(kutuYap(noktaAl(m)));
    const birak = (m: MouseEvent) => {
      window.removeEventListener("mousemove", hareket);
      window.removeEventListener("mouseup", birak);
      const k = kutuYap(noktaAl(m));
      setCizilen(null);
      if (k.w > 6 && k.h > 6) katmanGuncelle("vurgular", cizim.id, { kutu: k });
      setCizim(null);
    };
    window.addEventListener("mousemove", hareket);
    window.addEventListener("mouseup", birak);
  };

  // --- klavye ---
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, select, textarea")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === "Escape" && cizim) setCizim(null);
      else if (ctrl && e.key.toLowerCase() === "z") (e.shiftKey ? yinele() : geriAl());
      else if (ctrl && e.key.toLowerCase() === "y") yinele();
      else if (e.key === " ") oynatici.current?.toggle();
      else if (e.key === "ArrowLeft") git(kare - (e.shiftKey ? FPS : 1));
      else if (e.key === "ArrowRight") git(kare + (e.shiftKey ? FPS : 1));
      else if (e.key === "Home") git(0);
      else if (e.key === "End") git(kareSayisi - 1);
      else if (e.key.toLowerCase() === "s" && !ctrl) bol();
      else if (e.key === "Delete" || e.key === "Backspace") sil();
      // I / O: video editörlerindeki giriş-çıkış işareti; Türkçe klavyede [ ] için AltGr gerektiği için asıl kısayol bunlar.
      else if (e.key === "[" || (!ctrl && e.key.toLowerCase() === "i")) basiBuraya();
      else if (e.key === "]" || (!ctrl && e.key.toLowerCase() === "o")) sonuBuraya();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  });

  // --- dışa aktarma ---
  const [is, setIs] = useState<Is | null>(null);
  const [aktarOranlari, setAktarOranlari] = useState<Oran[]>([proje.cikis.oran]);
  const oranAc = (o: Oran, acik: boolean) => setAktarOranlari((l) => (acik ? ORANLAR.filter((x) => x === o || l.includes(x)) : l.filter((x) => x !== o)));
  const disaAktar = async () => {
    try {
      oynatici.current?.pause();
      await kaydet();
      const { id } = await api<{ id: string }>(`/api/kayit/${ad}/disa-aktar`, { method: "POST", body: JSON.stringify({ oranlar: aktarOranlari }) });
      setIs({ durum: "sırada", ilerleme: 0 });
      const yokla = async () => {
        const d = await api<Is>(`/api/is/${id}`);
        setIs(d);
        if (d.durum !== "bitti" && d.durum !== "hata") setTimeout(yokla, 700);
      };
      yokla();
    } catch (e) {
      setIs({ durum: "hata", ilerleme: 0, hata: (e as Error).message });
    }
  };
  const isSuruyor = is && is.durum !== "bitti" && is.durum !== "hata";

  // Seçili katmanın sağ paneldeki alanları.
  const katmanPaneli = () => {
    if (!secim || secim.tur === "kesim" || !seciliKatman) return null;
    const tur = secim.tur;
    const x = seciliKatman;
    const guncelle = (alan: Record<string, unknown>) => katmanGuncelle(tur, x.id, alan);
    return (
      <section>
        <h3>Seçili {KATMAN_ADI[tur].toLowerCase()}</h3>
        <div className="satir"><span>Kayıttaki yeri</span><b>{sureYaz(x.bas)} – {sureYaz(x.son)}</b></div>
        {tur === "altyazilar" ? (
          <label className="alan">Metin
            <textarea rows={3} value={(x as Altyazi).metin} onChange={(e) => guncelle({ metin: e.target.value })} />
          </label>
        ) : null}
        {tur === "vurgular" ? (
          <>
            <label className="alan">Biçim
              <div className="dugmeler">
                <button className={(x as Vurgu).bicim === "kutu" ? "secili" : ""} onClick={() => guncelle({ bicim: "kutu" })}>Çerçeve</button>
                <button className={(x as Vurgu).bicim === "karart" ? "secili" : ""} onClick={() => guncelle({ bicim: "karart" })}>Çevreyi karart</button>
              </div>
            </label>
            <button onClick={() => setCizim({ ne: "kutu", id: x.id })} className={cizim?.id === x.id ? "secili" : ""}>Oynatıcıda yeniden çiz</button>
          </>
        ) : null}
        {tur === "yakinlastirmalar" ? (
          <>
            <label className="alan">Yakınlık <b>{(x as Yakinlastirma).oran.toFixed(1)}x</b>
              <input type="range" min={1.1} max={3} step={0.1} value={(x as Yakinlastirma).oran} onChange={(e) => guncelle({ oran: Number(e.target.value) })} />
            </label>
            <label className="alan">Geçiş süresi <b>{(x as Yakinlastirma).gecis.toFixed(1)} sn</b>
              <input type="range" min={0.2} max={1.5} step={0.1} value={(x as Yakinlastirma).gecis} onChange={(e) => guncelle({ gecis: Number(e.target.value) })} />
            </label>
            <label className="kutucuk"><input type="checkbox" checked={(x as Yakinlastirma).takip} onChange={(e) => guncelle({ takip: e.target.checked })} /> İmleci izle</label>
            {!(x as Yakinlastirma).takip ? (
              <button onClick={() => setCizim({ ne: "merkez", id: x.id })} className={cizim?.id === x.id ? "secili" : ""}>Merkezi oynatıcıda seç</button>
            ) : null}
          </>
        ) : null}
        <button className="tehlike" onClick={sil}>Sil (Del)</button>
      </section>
    );
  };

  return (
    <>
      <header className="ust">
        <div className="marka">Sezar <span>Video Editörü</span></div>
        <select value={ad} onChange={(e) => kayitSec(e.target.value)} className="kayit-sec" title="Kayıt">
          {kayitlar.map((k) => (
            <option key={k.ad} value={k.ad}>
              {k.ad} · {k.sure.toFixed(1)} sn{k.durum === "hata" ? " · kısmi" : ""}
            </option>
          ))}
        </select>
        <div className={`kayit-durumu ${kayitDurumu}`}>
          {{ kaydedildi: "Kaydedildi", bekliyor: "Değişiklik var…", kaydediliyor: "Kaydediliyor…", hata: "Kaydedilemedi!" }[kayitDurumu]}
        </div>
        <div className="bosluk" />
        <button onClick={geriAl} disabled={!gecmis.current.length} title="Geri al (Ctrl+Z)">↶ Geri al</button>
        <button onClick={yinele} disabled={!ileri.current.length} title="Yinele (Ctrl+Y)">↷ Yinele</button>
        <div className="oran-secimi" title="Dışa aktarılacak oranlar">
          {ORANLAR.map((o) => (
            <label key={o} className={aktarOranlari.includes(o) ? "secili" : ""}>
              <input type="checkbox" checked={aktarOranlari.includes(o)} onChange={(e) => oranAc(o, e.target.checked)} /> {o}
            </label>
          ))}
        </div>
        <button className="ana" onClick={disaAktar} disabled={!!isSuruyor || !aktarOranlari.length}>
          {isSuruyor ? `${is!.durum === "işleniyor" ? `İşleniyor ${is!.sira ?? ""}` : "Hazırlanıyor"} %${Math.round(is!.ilerleme * 100)}` : "Dışa aktar (MP4)"}
        </button>
      </header>

      {is?.durum === "bitti" ? (
        <div className="bildirim">
          {(is.ciktilar ?? [is.cikti]).length > 1 ? `${is.ciktilar!.length} video hazır:` : "Video hazır:"} <code>{(is.ciktilar ?? [is.cikti]).map((c) => c!.split(/[\\/]/).pop()).join(", ")}</code>
          <button onClick={() => api("/api/klasoru-ac", { method: "POST", body: JSON.stringify({ dosya: is.cikti }) })}>Klasörde göster</button>
          <button onClick={() => setIs(null)}>Kapat</button>
        </div>
      ) : is?.durum === "hata" ? (
        <div className="bildirim hata">
          Dışa aktarma başarısız: {is.hata}
          <button onClick={() => setIs(null)}>Kapat</button>
        </div>
      ) : null}

      <main className="orta">
        <div className="sahne" ref={sahne}>
          <div className="cerceve" style={{ width: W * olcek, height: H * olcek }}>
            <Player
              ref={oynatici}
              component={Kompozisyon}
              inputProps={inputProps}
              durationInFrames={kareSayisi}
              compositionWidth={W}
              compositionHeight={H}
              fps={FPS}
              style={{ width: W * olcek, height: H * olcek }}
              controls={false}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              acknowledgeRemotionLicense
            />
            {cizim ? (
              <div className="cizim-alani" ref={cizimAlani} onMouseDown={cizimBasla}>
                <div className="cizim-ipucu">
                  {{ kutu: "Vurgulanacak alanı sürükleyerek çizin", merkez: "Yakınlaştırılacak noktaya tıklayın", kadraj: "Kadrajın ortalanacağı yere tıklayın" }[cizim.ne]} · Esc: vazgeç
                </div>
                {cizilen ? (
                  <div
                    className="cizilen"
                    style={{ left: `${(cizilen.x / gunluk.genislik) * 100}%`, top: `${(cizilen.y / gunluk.yukseklik) * 100}%`, width: `${(cizilen.w / gunluk.genislik) * 100}%`, height: `${(cizilen.h / gunluk.yukseklik) * 100}%` }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="yan">
          <section>
            <h3>Katman ekle</h3>
            <div className="dugmeler">
              <button onClick={() => katmanEkle("altyazilar")} title="Oynatıcının olduğu yere altyazı ekle">+ Altyazı</button>
              <button onClick={() => katmanEkle("vurgular")} title="Oynatıcının olduğu yere vurgu ekle">+ Vurgu</button>
              <button onClick={() => katmanEkle("yakinlastirmalar")} title="Oynatıcının olduğu yere yakınlaştırma ekle">+ Yakınlaştırma</button>
            </div>
            <button onClick={senaryodanDoldur} disabled={!eklenebilir} title="Senaryodaki altyazi, vurgu ve yakinlas adımlarından ekler; eklenmiş olanları tekrar eklemez">
              Senaryodan doldur{eklenebilir ? ` (${eklenebilir})` : ""}
            </button>
          </section>

          {katmanPaneli()}

          {seciliKesim ? (
            <section>
              <h3>Seçili bölüm</h3>
              <div className="satir"><span>Kayıttaki yeri</span><b>{sureYaz(seciliKesim.bas)} – {sureYaz(seciliKesim.son)}</b></div>
              <div className="satir"><span>Videoda süresi</span><b>{((seciliKesim.son - seciliKesim.bas) / seciliKesim.hiz).toFixed(1)} sn</b></div>
              <label className="alan">Hız
                <div className="dugmeler">
                  {HIZLAR.map((h) => (
                    <button key={h} className={seciliKesim.hiz === h ? "secili" : ""} onClick={() => kesimGuncelle(seciliKesim.id, { hiz: h })}>{h}x</button>
                  ))}
                </div>
              </label>
              <div className="dugmeler">
                <button onClick={basiBuraya} title="Oynatıcının olduğu bölümün başını buraya çek (I)">Başı buraya (I)</button>
                <button onClick={sonuBuraya} title="Oynatıcının olduğu bölümün sonunu buraya çek (O)">Sonu buraya (O)</button>
              </div>
              <button className="tehlike" onClick={sil} disabled={proje.kesimler.length < 2}>Bölümü sil (Del)</button>
            </section>
          ) : !seciliKatman ? (
            <section><p className="soluk">Zaman çizelgesinde bir bölüme ya da katmana tıklayın.</p></section>
          ) : null}

          <section>
            <h3>Çıkış</h3>
            <label className="alan">Önizleme oranı
              <div className="dugmeler">
                {ORANLAR.map((o) => (
                  <button key={o} className={proje.cikis.oran === o ? "secili" : ""} onClick={() => cikisAyari({ oran: o })}>
                    {o} {{ "16:9": "yatay", "4:5": "LinkedIn", "9:16": "dikey" }[o]}
                  </button>
                ))}
              </div>
            </label>
            {gunluk.gorunum === "telefon" ? (
              <label className="kutucuk"><input type="checkbox" checked={proje.cikis.telefonCercevesi} onChange={(e) => cikisAyari({ telefonCercevesi: e.target.checked })} /> Telefon çerçevesi</label>
            ) : null}
            {!(gunluk.gorunum === "telefon" && proje.cikis.telefonCercevesi) ? (
              <label className="alan">Kayıt orana uymazsa
                <div className="dugmeler">
                  <button className={proje.cikis.yerlesim === "sigdir" ? "secili" : ""} onClick={() => cikisAyari({ yerlesim: "sigdir" })}>Tamamını göster</button>
                  <button className={proje.cikis.yerlesim === "kirp" ? "secili" : ""} onClick={() => cikisAyari({ yerlesim: "kirp" })}>Kırp</button>
                </div>
              </label>
            ) : null}
            {proje.cikis.yerlesim === "sigdir" || (gunluk.gorunum === "telefon" && proje.cikis.telefonCercevesi) ? (
              <label className="alan">Boş kalan yer
                <div className="dugmeler">
                  <button className={proje.cikis.zemin === "renk" ? "secili" : ""} onClick={() => cikisAyari({ zemin: "renk" })}>Sezar moru</button>
                  <button className={proje.cikis.zemin === "bulanik" ? "secili" : ""} onClick={() => cikisAyari({ zemin: "bulanik" })}>Bulanık kayıt</button>
                </div>
              </label>
            ) : (
              <>
                <label className="kutucuk"><input type="checkbox" checked={proje.cikis.kadrajTakip} onChange={(e) => cikisAyari({ kadrajTakip: e.target.checked })} /> Kadraj imleci izlesin</label>
                {!proje.cikis.kadrajTakip ? <button onClick={() => setCizim({ ne: "kadraj", id: "kadraj" })} className={cizim?.ne === "kadraj" ? "secili" : ""}>Kadrajı oynatıcıda seç</button> : null}
              </>
            )}
          </section>

          <section>
            <h3>Kartlar</h3>
            {(["giris", "kapanis"] as const).map((hangi) => {
              const k = proje.kartlar[hangi];
              return (
                <div key={hangi} className="alan">
                  <label className="kutucuk alt-baslik"><input type="checkbox" checked={k.acik} onChange={(e) => kartAyari(hangi, { acik: e.target.checked })} /> {hangi === "giris" ? "Giriş kartı" : "Kapanış kartı"}</label>
                  {k.acik ? (
                    <>
                      <input type="text" value={k.baslik} placeholder="Başlık" onChange={(e) => kartAyari(hangi, { baslik: e.target.value })} />
                      <textarea rows={2} value={k.altBaslik} placeholder="Alt satır" onChange={(e) => kartAyari(hangi, { altBaslik: e.target.value })} />
                      <div className="dugmeler">
                        {(["mor", "koyu", "acik"] as const).map((t) => (
                          <button key={t} className={k.tema === t ? "secili" : ""} onClick={() => kartAyari(hangi, { tema: t })}>{{ mor: "Mor", koyu: "Koyu", acik: "Açık" }[t]}</button>
                        ))}
                        <button className={k.logo ? "secili" : ""} onClick={() => kartAyari(hangi, { logo: !k.logo })}>Logo</button>
                      </div>
                      <label className="alan">Süre <b>{k.sure.toFixed(1)} sn</b>
                        <input type="range" min={1} max={6} step={0.5} value={k.sure} onChange={(e) => kartAyari(hangi, { sure: Number(e.target.value) })} />
                      </label>
                      <button onClick={() => git(hangi === "giris" ? Math.round(FPS * 0.8) : kareSayisi - Math.round(FPS * 0.6))}>Önizle</button>
                    </>
                  ) : null}
                </div>
              );
            })}
          </section>

          <section>
            <h3>Müzik</h3>
            <select value={proje.muzik?.dosya ?? ""} onChange={(e) => muzikSec(e.target.value)}>
              <option value="">Müzik yok</option>
              {muzikler.map((m) => <option key={m.ad} value={m.ad}>{m.ad}</option>)}
              {proje.muzik && !muzikler.some((m) => m.ad === proje.muzik!.dosya) ? <option value={proje.muzik.dosya}>{proje.muzik.dosya} (bulunamadı)</option> : null}
            </select>
            <label className="dosya-sec">
              <input type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) muzikYukle(f); e.target.value = ""; }} />
              <span>Müzik dosyası ekle…</span>
            </label>
            {muzikHatasi ? <p className="hata-yazi">{muzikHatasi}</p> : null}
            {proje.muzik ? (
              <>
                <label className="alan">Ses <b>%{Math.round(proje.muzik.ses * 100)}</b>
                  <input type="range" min={0} max={1} step={0.05} value={proje.muzik.ses} onChange={(e) => muzikAyari({ ses: Number(e.target.value) })} />
                </label>
                <label className="alan">Başta açılma <b>{proje.muzik.girisYumusak.toFixed(1)} sn</b>
                  <input type="range" min={0} max={5} step={0.5} value={proje.muzik.girisYumusak} onChange={(e) => muzikAyari({ girisYumusak: Number(e.target.value) })} />
                </label>
                <label className="alan">Sonda kısılma <b>{proje.muzik.cikisYumusak.toFixed(1)} sn</b>
                  <input type="range" min={0} max={6} step={0.5} value={proje.muzik.cikisYumusak} onChange={(e) => muzikAyari({ cikisYumusak: Number(e.target.value) })} />
                </label>
                <label className="alan">Müziğin başlangıcı <b>{proje.muzik.baslangic.toFixed(1)}. sn</b>
                  <input type="range" min={0} max={120} step={0.5} value={proje.muzik.baslangic} onChange={(e) => muzikAyari({ baslangic: Number(e.target.value) })} />
                </label>
              </>
            ) : (
              <p className="soluk">Kendi müzik dosyanızı ekleyin; dosya <code>muzik/</code> klasörüne kopyalanır. Telifli müzik kullanmayın.</p>
            )}
          </section>

          <section>
            <h3>Altyazı görünümü</h3>
            <div className="dugmeler">
              {(["koyu", "acik", "mor"] as const).map((g) => (
                <button key={g} className={proje.altyaziStili.gorunum === g ? "secili" : ""} onClick={() => altyaziStili({ gorunum: g })}>{{ koyu: "Koyu", acik: "Açık", mor: "Mor" }[g]}</button>
              ))}
              <button className={proje.altyaziStili.konum === "alt" ? "secili" : ""} onClick={() => altyaziStili({ konum: "alt" })}>Altta</button>
              <button className={proje.altyaziStili.konum === "ust" ? "secili" : ""} onClick={() => altyaziStili({ konum: "ust" })}>Üstte</button>
            </div>
            <label className="alan">Boyut <b>{proje.altyaziStili.boyut.toFixed(1)}x</b>
              <input type="range" min={0.6} max={2} step={0.1} value={proje.altyaziStili.boyut} onChange={(e) => altyaziStili({ boyut: Number(e.target.value) })} />
            </label>
          </section>

          <section>
            <h3>İmleç</h3>
            <label className="kutucuk"><input type="checkbox" checked={proje.imlec.goster} onChange={(e) => imlecAyari({ goster: e.target.checked })} /> İmleci göster</label>
            <label className="kutucuk"><input type="checkbox" checked={proje.imlec.tik} onChange={(e) => imlecAyari({ tik: e.target.checked })} /> Tıklamada halka</label>
            <label className="alan">Boyut <b>{proje.imlec.boyut.toFixed(1)}x</b>
              <input type="range" min={0.6} max={2.5} step={0.1} value={proje.imlec.boyut} onChange={(e) => imlecAyari({ boyut: Number(e.target.value) })} />
            </label>
            {gunluk.gorunum === "telefon" ? <p className="soluk">Telefon kaydında ok imleci çizilmez, yalnız dokunma halkası görünür.</p> : null}
          </section>
          <section>
            <h3>Kayıt</h3>
            <div className="satir"><span>Görünüm</span><b>{gunluk.gorunum} · {kayit.w}×{kayit.h}</b></div>
            <div className="satir"><span>Ham süre</span><b>{gunluk.sure.toFixed(1)} sn</b></div>
            <div className="satir"><span>Düzenlenmiş video</span><b>{cikisSuresi(proje).toFixed(1)} sn</b></div>
            <div className="satir"><span>Kartlarla toplam</span><b>{(kareSayisi / FPS).toFixed(1)} sn</b></div>
          </section>
          <section className="kisayollar">
            <h3>Kısayollar</h3>
            <p><kbd>Boşluk</kbd> oynat/durdur · <kbd>←</kbd><kbd>→</kbd> kare (Shift: 1 sn) · <kbd>S</kbd> böl · <kbd>Del</kbd> sil · <kbd>I</kbd> <kbd>O</kbd> başı/sonu buraya · <kbd>Ctrl+Z</kbd> geri al · <kbd>Esc</kbd> çizimden çık</p>
          </section>
        </aside>
      </main>

      <footer className="alt">
        <div className="tasima">
          <button onClick={() => git(0)} title="Başa (Home)">⏮</button>
          <button className="oynat" onClick={() => oynatici.current?.toggle()} title="Oynat / durdur (Boşluk)">{oynuyor ? "⏸" : "▶"}</button>
          <span className="zaman">{sureYaz(kare / FPS)} <span className="soluk">/ {sureYaz(kareSayisi / FPS)}</span></span>
          <button onClick={bol} title="Oynatıcının olduğu yerden böl (S)">✂ Böl</button>
          {simdi ? <span className="soluk">kayıtta {sureYaz(simdi.t)}</span> : null}
        </div>
        <ZamanCizelgesi
          ad={ad}
          gunluk={gunluk}
          proje={proje}
          duzen={duzen}
          kare={kare}
          secim={secim}
          onSec={setSecim}
          onGit={git}
          onKesimSurukle={(id, alan) => geciciDegistir((p) => ({ ...p, kesimler: p.kesimler.map((k) => (k.id === id ? { ...k, ...alan } : k)) }))}
          onKatmanSurukle={(tur, id, alan) => geciciDegistir((p) => ({ ...p, [tur]: (p[tur] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...alan } : x)) }))}
          onSurukleBitti={surukleBitti}
        />
      </footer>
    </>
  );
}
