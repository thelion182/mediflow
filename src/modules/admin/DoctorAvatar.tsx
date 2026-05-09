import React, { useEffect, useState } from "react";
import { configStore } from "../config/config.store";
import type { Medico } from "./medicos.types";

const CACHE_PREFIX = "mediflow.avatar.v1.";

function initials(name: string) {
  return (name || "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function avatarRgb(name: string): string {
  const palette = [
    "21,101,192", "38,166,154", "217,119,6", "109,191,60",
    "156,39,176", "233,30,99", "0,150,136", "63,81,181",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function photoUrl(medico: Medico): string | null {
  const cfg = configStore.get().fotos;
  if (!cfg.baseUrl) return null;
  const val = medico[cfg.campo as keyof Medico] as string | undefined;
  if (!val) return null;
  return `${cfg.baseUrl}/${val}.${cfg.extension}`;
}

interface Props {
  medico: Medico;
  size?: number;
}

export function DoctorAvatar({ medico, size = 36 }: Props) {
  const cacheKey = CACHE_PREFIX + medico.userId;
  const [imgSrc, setImgSrc] = useState<string | null>(
    () => localStorage.getItem(cacheKey)
  );
  const [failed, setFailed] = useState(false);

  const url = !failed ? photoUrl(medico) : null;

  useEffect(() => {
    if (!url || imgSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 72;
        canvas.height = 72;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, 72, 72);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          try { localStorage.setItem(cacheKey, dataUrl); } catch { /* quota */ }
          setImgSrc(dataUrl);
        } else {
          setImgSrc(url);
        }
      } catch {
        setImgSrc(url);
      }
    };
    img.onerror = () => setFailed(true);
    img.src = url;
  }, [url, imgSrc, cacheKey]);

  const br = Math.round(size * 0.25);
  const rgb = avatarRgb(medico.displayName);

  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={medico.displayName}
        style={{ width: size, height: size, borderRadius: br, objectFit: "cover", flexShrink: 0 }}
        onError={() => { setImgSrc(null); setFailed(true); }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: br,
      background: `rgba(${rgb}, 0.13)`,
      border: `1px solid rgba(${rgb}, 0.25)`,
      color: `rgb(${rgb})`,
      display: "grid", placeItems: "center",
      fontSize: Math.round(size * 0.34), fontWeight: 700, flexShrink: 0,
      userSelect: "none",
    }}>
      {initials(medico.displayName)}
    </div>
  );
}
