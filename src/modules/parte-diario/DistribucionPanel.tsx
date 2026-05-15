import React, { useMemo, useState } from "react";
import { convocatoriaStore } from "../convocatorias/convocatoria.store";
import { medicosStore } from "../admin/medicos.store";

type Periodo = "semana" | "mes" | "mes_anterior";

function getRange(periodo: Periodo): { from: number; to: number; label: string } {
  const now = new Date();
  if (periodo === "semana") {
    const dow = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { from: mon.getTime(), to: sun.getTime(), label: "Esta semana" };
  }
  if (periodo === "mes_anterior") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last  = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: first.getTime(), to: last.getTime(), label: "Mes anterior" };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from: first.getTime(), to: last.getTime(), label: "Este mes" };
}

function fmtHoras(h: number) {
  return h === 1 ? "1h" : `${h}h`;
}

export function DistribucionPanel({ onClose }: { onClose: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");

  const { from, to, label } = useMemo(() => getRange(periodo), [periodo]);

  const medicos = useMemo(() => medicosStore.list().filter(m => m.activo ?? true), []);

  const stats = useMemo(() => {
    const all = convocatoriaStore.list();
    const map = new Map<string, { confirmadas: number; horasTotales: number; ultimaConv?: number }>();

    for (const c of all) {
      const inicioMs = new Date(c.inicio).getTime();
      if (inicioMs < from || inicioMs > to) continue;
      const horas = Math.round((new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 3_600_000);

      for (const inv of c.invitaciones ?? []) {
        // Solo médicos invitados en este período
        const prev = map.get(inv.medicoId) ?? { confirmadas: 0, horasTotales: 0 };
        // Registrar última convocatoria recibida
        if (!prev.ultimaConv || inicioMs > prev.ultimaConv) {
          map.set(inv.medicoId, { ...prev, ultimaConv: inicioMs });
        } else {
          map.set(inv.medicoId, prev);
        }
      }
      for (const a of c.asignaciones ?? []) {
        if (a.estado !== "CONFIRMADA" && a.estado !== "CUMPLIDA") continue;
        const prev = map.get(a.medicoId) ?? { confirmadas: 0, horasTotales: 0 };
        map.set(a.medicoId, {
          ...prev,
          confirmadas: prev.confirmadas + 1,
          horasTotales: prev.horasTotales + horas,
        });
      }
    }
    return map;
  }, [from, to]);

  const ranking = useMemo(() => {
    return medicos.map(m => ({
      ...m,
      confirmadas: stats.get(m.userId)?.confirmadas ?? 0,
      horasTotales: stats.get(m.userId)?.horasTotales ?? 0,
      ultimaConv: stats.get(m.userId)?.ultimaConv,
    })).sort((a, b) => b.confirmadas - a.confirmadas || b.horasTotales - a.horasTotales);
  }, [medicos, stats]);

  const maxGuardias = ranking[0]?.confirmadas ?? 1;
  const sinConvocar = ranking.filter(m => !m.ultimaConv);
  const convocados  = ranking.filter(m => !!m.ultimaConv);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", justifyContent: "flex-end",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: 440, height: "100%", overflowY: "auto",
        background: "var(--surface)", boxShadow: "-4px 0 24px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px", borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>Distribución de guardias</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              Guía para distribuir equitativamente — {label}
            </div>
          </div>
          <button onClick={onClose} style={{
            padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--surface-2)", cursor: "pointer", fontSize: 14, color: "var(--muted)",
          }}>✕</button>
        </div>

        {/* Período */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-2)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Período
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {([
              ["semana", "Esta semana"],
              ["mes",    "Este mes"],
              ["mes_anterior", "Mes anterior"],
            ] as [Periodo, string][]).map(([p, lbl]) => (
              <button key={p} onClick={() => setPeriodo(p)} style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: periodo === p ? 700 : 500,
                border: `1.5px solid ${periodo === p ? "rgba(21,101,192,0.60)" : "var(--border)"}`,
                background: periodo === p ? "rgba(21,101,192,0.10)" : "var(--surface-2)",
                color: periodo === p ? "var(--blue)" : "var(--muted)", cursor: "pointer",
              }}>{lbl}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "16px 20px", flex: 1 }}>
          {/* Sin convocar */}
          {sinConvocar.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: 10,
              }}>
                Sin convocatorias en el período ({sinConvocar.length})
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {sinConvocar.map(m => (
                  <div key={m.userId} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 10,
                    border: "1px solid rgba(100,116,139,0.20)",
                    background: "rgba(100,116,139,0.05)",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.displayName}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {m.especialidad ?? "Sin especialidad"} · {m.tipo ?? "Suplente"}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                      background: "rgba(100,116,139,0.10)", color: "var(--muted)",
                      border: "1px solid rgba(100,116,139,0.20)",
                    }}>Sin convocar</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ranking */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
              letterSpacing: "0.05em", marginBottom: 10,
            }}>
              Ranking de carga ({convocados.length} médico{convocados.length !== 1 ? "s" : ""})
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {convocados.map((m, i) => {
                const pct = maxGuardias > 0 ? (m.confirmadas / maxGuardias) * 100 : 0;
                const barColor = pct > 75 ? "rgba(220,38,38,0.70)" : pct > 40 ? "rgba(217,119,6,0.70)" : "rgba(22,163,74,0.70)";
                return (
                  <div key={m.userId} style={{
                    padding: "10px 12px", borderRadius: 10,
                    border: "1px solid var(--border-2)",
                    background: "var(--surface-2)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", minWidth: 20 }}>
                        #{i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.displayName}</span>
                        {m.especialidad && (
                          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>{m.especialidad}</span>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                          {m.confirmadas} guardia{m.confirmadas !== 1 ? "s" : ""}
                        </div>
                        {m.horasTotales > 0 && (
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{fmtHoras(m.horasTotales)}</div>
                        )}
                      </div>
                    </div>
                    {/* Bar */}
                    <div style={{ height: 4, borderRadius: 2, background: "var(--border-2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
              {convocados.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>
                  Sin guardias registradas en el período seleccionado.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
