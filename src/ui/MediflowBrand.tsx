import React from "react";

import iconPng from "../assets/branding/mediflow-icon.png";
import wordmarkPng from "../assets/branding/mediflow-wordmark.png";

type BrandProps = {
  /** Alto del icono en px */
  iconSize?: number;
  /** Alto del wordmark en px (si no se pasa, se calcula en base al icono) */
  wordmarkHeight?: number;
  /** Mostrar u ocultar el wordmark */
  showWordmark?: boolean;
  className?: string;
};

export function MediflowBrand({
  iconSize = 36,
  wordmarkHeight,
  showWordmark = true,
  className
}: BrandProps) {
  const wmH = wordmarkHeight ?? Math.round(iconSize * 0.85);

  return (
    <div className={`mfBrand ${className ?? ""}`}>
      <img
        className="mfBrandIcon"
        src={iconPng}
        alt="MediFlow"
        width={iconSize}
        height={iconSize}
        draggable={false}
      />

      {showWordmark && (
        <img
          className="mfBrandWordmark"
          src={wordmarkPng}
          alt="MediFlow"
          style={{ height: wmH, width: "auto" }}
          draggable={false}
        />
      )}
    </div>
  );
}

export function MediflowIcon({
  size = 28,
  className
}: { size?: number; className?: string }) {
  return (
    <img
      className={`mfBrandIcon ${className ?? ""}`}
      src={iconPng}
      alt="MediFlow"
      width={size}
      height={size}
      draggable={false}
    />
  );
}
