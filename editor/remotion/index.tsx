// Dışa aktarma için Remotion girişi (editor/sunucu.mjs bunu paketleyip MP4 üretir).
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Kompozisyon, type KompozisyonProps } from "../ortak/Kompozisyon";
import { FPS, cikisBoyutu, projeyiTamamla, toplamKare } from "../ortak/proje";

const Kok: React.FC = () => (
  <Composition
    id="Kayit"
    component={Kompozisyon as React.FC<Record<string, unknown>>}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={1}
    defaultProps={{} as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as KompozisyonProps;
      // Eski sürümde kaydedilmiş proje dosyalarında yeni alanlar eksik olabilir.
      const proje = projeyiTamamla(p.proje, p.gunluk);
      const { w, h } = cikisBoyutu(proje.cikis.oran);
      return { durationInFrames: toplamKare(proje), width: w, height: h, props: { ...p, proje } as unknown as Record<string, unknown> };
    }}
  />
);

registerRoot(Kok);
