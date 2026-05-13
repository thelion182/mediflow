import React, { useMemo, useState } from "react";
import { especialidadesStore } from "./especialidades.store";

const EMOJI_GRID = [
  "🩺","❤️","🫀","🧠","🦴","👶","🌸","🔬","💊","🩹",
  "🚑","🩻","💉","🧬","🫁","👁️","👂","🦷","🧴","🎗️",
  "⚗️","🧘","🏥","🫂","🔪","🦿","⚕️","🩺","🩸","🌡️",
];

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8, boxSizing: "border-box",
  border: "1.5px solid var(--border)", background: "var(--surface-2)",
  fontSize: 13, color: "var(--text)", fontFamily: "inherit",
};

export function EspecialidadesAdmin() {
  const [tick,    setTick]    = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [input,   setInput]   = useState("");
  const [newEsp,  setNewEsp]  = useState("");

  const iconos        = useMemo(() => especialidadesStore.getAll(), [tick]);
  const especialidades = useMemo(() => especialidadesStore.listNames(), [tick]);

  function startEdit(esp: string) {
    setEditing(esp);
    setInput(iconos[esp] ?? "🏥");
  }

  function save(esp: string) {
    if (input.trim()) especialidadesStore.setIcono(esp, input.trim());
    setEditing(null);
    setTick(t => t + 1);
  }

  function addEsp() {
    const name = newEsp.trim();
    if (!name) return;
    especialidadesStore.add(name);
    setNewEsp("");
    setTick(t => t + 1);
  }

  function removeEsp(esp: string) {
    if (!confirm(`Eliminar la especialidad "${esp}"?\nLos médicos que la tengan asignada quedarán sin especialidad en el desplegable.`)) return;
    especialidadesStore.remove(esp);
    setTick(t => t + 1);
  }

  return (
    <div>
      <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
        Administrá el catálogo de especialidades. Esta lista se usa como desplegable al crear o editar médicos
        y al crear guardias fijas. Cada especialidad tiene un emoji identificador que aparece en el{" "}
        <b>Parte Diario</b> y en los filtros de destaque.
      </p>

      {/* Nueva especialidad */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 20, alignItems: "flex-end",
        padding: "14px 16px", borderRadius: 12,
        background: "rgba(21,101,192,0.04)", border: "1px solid rgba(21,101,192,0.15)",
      }}>
        <div style={{ flex: 1 }}>
          <label style={{
            display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)",
            marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            Nueva especialidad
          </label>
          <input
            value={newEsp}
            onChange={e => setNewEsp(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addEsp()}
            placeholder="Ej: Infectología, Hematología…"
            style={inp}
          />
        </div>
        <button onClick={addEsp} style={{
          padding: "8px 20px", borderRadius: 9, border: "none",
          background: "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 13,
          cursor: "pointer", whiteSpace: "nowrap",
        }}>+ Agregar</button>
      </div>

      {/* Lista */}
      <div style={{ display: "grid", gap: 8 }}>
        {especialidades.length === 0 && (
          <p style={{ color: "var(--subtle)", fontSize: 13 }}>
            No hay especialidades. Agregá la primera arriba.
          </p>
        )}

        {especialidades.map(esp => {
          const icono  = iconos[esp] ?? "🏥";
          const isOpen = editing === esp;
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
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {EMOJI_GRID.map((e, i) => (
                      <button key={i} onClick={() => setInput(e)} style={{
                        fontSize: 20, padding: "3px 5px", borderRadius: 7, cursor: "pointer",
                        border: input === e ? "2px solid var(--blue)" : "1.5px solid var(--border-2)",
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
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(esp)} style={{
                    padding: "5px 13px", borderRadius: 8, fontSize: 12,
                    border: "1px solid var(--border)", background: "var(--surface)",
                    color: "var(--muted)", cursor: "pointer",
                  }}>✏ Cambiar ícono</button>
                  <button onClick={() => removeEsp(esp)} style={{
                    padding: "5px 10px", borderRadius: 8, fontSize: 12,
                    border: "1px solid rgba(220,38,38,0.25)",
                    background: "rgba(220,38,38,0.06)",
                    color: "rgb(220,38,38)", cursor: "pointer",
                  }}>🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
