import React from "react";

type Props = {
  size?: number;          // tamaño del ícono
  showText?: boolean;     // mostrar u ocultar wordmark
  className?: string;
};

export function MediflowBrand({ size = 28, showText = true, className }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <img
        src="/src/assets/branding/mediflow-icon.png"
        alt="MediFlow"
        width={size}
        height={size}
        style={{ display: "block" }}
      />

      {showText && (
        <img
          src="/src/assets/branding/mediflow-wordmark.png"
          alt="MediFlow"
          height={Math.round(size * 0.9)}
          style={{ display: "block", height: Math.round(size * 0.9) }}
        />
      )}
    </div>
  );
}
