import React, { useMemo, useState } from "react";
import { medicosStore } from "./medicos.store";
import { especialidadesStore } from "./especialidades.store";

const EMOJI_GRID = [
  "🩺","❤️","🫀","🧠","🦴","👶","🌸","🔬","💊","🩹",
  "🚑","🩻","💉","🧬","🫁","👁️","👂","🦷","🧴","🎗️",
  "⚗️","🧘","🏥","🫂","🔪","🦿","⚕️","🩺","🩸","🌡️",
];

export function EspecialidadesAdmin() {
  const [tick,    setTick]    = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [input,   setInput]   = useState("");

  const iconos = useMemo(() => especialidadesStore.getAll(), [tick]);

  const especialidades = useMemo(() => {
    const set = new Set<string>();
    for (const m of medicosStore.list()) if (m.especialidad) set.add(m.especialidad);
    return Array.from(set).sort();
  }, []);

  function startEdit(esp: string) {
    setEditing(esp);
    setInput(iconos[esp] ?? "🏥");
  }

  function save(esp: string) {
    if (input.trim()) especialidadesStore.setIcono(esp, input.trim());
    setEditing(null);
    setTick(t => t + 1);
  }

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
        Configurá el emoji que representa cada especialidad.
        Aparece en el <b>Parte Diario</b> junto al nombre del médico y en el filtro de destaque.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {especialidades.length === 0 && (
          <p style={{ color: "var(--subtle)", fontSize: 13 }}>
            No hay especialidades registradas en el catálogo de médicos.
          </p>
        )}
        {especialidades.map(esp => {
          const icono   = iconos[esp] ?? "🏥";
          const isOpen  = editing === esp;
          return (
            <div key={esp} style={{
              display: "flex", alignItems: isOpen ? "flex-start" : "center",
              gap: 12, padding: "10px 14px", borderRadius: 12,
              border: `1.5px solid ${isOpen ? "rgba(21,101,192,0.45)" : "var(--border)"}`,
              background: isOpen ? "rgba(21,101,192,0.04)" : "var(--surface-2)",
              transition: "all 0.15s", flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{icono}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 140 }}>
                {esp}
              </span>

              {isOpen ? (
                <div style={{ display: "grid", gap: 10, flex: "1 1 300px" }}>
                  {/* Emoji grid */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {EMOJI_GRID.map((e, i) => (
                      <button key={i} onClick={() => setInput(e)} style={{
                        fontSize: 20, padding: "3px 5px", borderRadius: 7, cursor: "pointer",
                        border: input === e
                          ? "2px solid var(--blue)"
                          : "1.5px solid var(--border-2)",
                        background: input === e ? "rgba(21,101,192,0.10)" : "var(--surface)",
                        transition: "all 0.10s",
                      }}>{e}</button>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                      O escribí / pegá:
                    </span>
                    <input
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder="🩺"
                      maxLength={6}
                      style={{
                        width: 58, textAlign: "center", fontSize: 22,
                        padding: "4px 8px", borderRadius: 8,
                        border: "1.5px solid var(--border)",
                        background: "var(--surface)", fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                    />
                    <span style={{ fontSize: 26 }}>{input || "?"}</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button onClick={() => save(esp)} style={{
                        padding: "6px 16px", borderRadius: 8, border: "none",
                        background: "var(--blue)", color: "#fff",
                        fontWeight: 700, fontSize: 12.5, cursor: "pointer",
                      }}>Guardar</button>
                      <button onClick={() => setEditing(null)} style={{
                        padding: "6px 10px", borderRadius: 8,
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--muted)", fontSize: 12, cursor: "pointer",
                      }}>✕</button>
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => startEdit(esp)} style={{
                  padding: "5px 13px", borderRadius: 8, fontSize: 12,
                  border: "1px solid var(--border)", background: "var(--surface)",
                  color: "var(--muted)", cursor: "pointer",
                }}>✏ Cambiar ícono</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
