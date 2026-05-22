import React, { useMemo, useState } from "react";
import { AppShell } from "../../ui/AppShell";
import { convocatoriaStore } from "../convocatorias/convocatoria.store";
import { medicosStore } from "../admin/medicos.store";

type Period = "7d" | "30d" | "90d";

const PERIOD_MS: Record<Period, number> = {
  "7d":  7  * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
  "90d": 90 * 24 * 3600 * 1000,
};

function pct(a: number, b: number) {
  if (b === 0) return 0;
  return Math.round((a / b) * 100);
}

function StatCard({ label, value, sub, rgb }: {
  label: string; value: string | number; sub?: string; rgb: string;
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)",
      borderTop: `3px solid rgb(${rgb})`,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: `rgb(${rgb})`, letterSpacing: "-0.03em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--subtle)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, rgb }: { label: string; value: number; max: number; rgb: string }) {
  const w = max === 0 ? 0 : Math.max(4, Math.round((value / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ minWidth: 140, fontSize: 12.5, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--border-2)", overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: 4, background: `rgb(${rgb})`, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ minWidth: 28, fontSize: 12, fontWeight: 700, color: `rgb(${rgb})`, textAlign: "right" }}>
        {value}
      </div>
    </div>
  );
}

export function KpiDashboard() {
  const [period, setPeriod] = useState<Period>("30d");

  const stats = useMemo(() => {
    const all = convocatoriaStore.list();
    const medicos = medicosStore.list();
    const now = Date.now();
    const from = now - PERIOD_MS[period];

    const inRange = all.filter(c => new Date(c.inicio).getTime() >= from);

    const total    = inRange.length;
    const cubiertas = inRange.filter(c => c.estado === "CUBIERTA").length;
    const parciales = inRange.filter(c => c.estado === "PARCIAL").length;
    const vencidas  = inRange.filter(c => c.estado === "VENCIDA").length;
    const enviadas  = inRange.filter(c => c.estado === "ENVIADA" || c.estado === "PARCIAL").length;
    const canceladas= inRange.filter(c => c.estado === "CANCELADA").length;

    // Top médicos activos: por cantidad de guardias confirmadas en el período
    const medicoCount = new Map<string, number>();
    for (const c of inRange) {
      for (const a of c.asignaciones ?? []) {
        if (a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA") {
          medicoCount.set(a.medicoId, (medicoCount.get(a.medicoId) ?? 0) + 1);
        }
      }
    }
    const medicoMap = new Map(medicos.map(m => [m.userId, m.displayName]));
    const topMedicos = Array.from(medicoCount.entries())
      .map(([id, n]) => ({ id, name: medicoMap.get(id) ?? id, count: n }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Top sectores sin cubrir: vencidas + enviadas (no cubiertas)
    const sectorUncovered = new Map<string, number>();
    for (const c of inRange) {
      if (c.estado === "VENCIDA" || c.estado === "CANCELADA") {
        sectorUncovered.set(c.sector, (sectorUncovered.get(c.sector) ?? 0) + 1);
      }
    }
    const topSectoresSinCubrir = Array.from(sectorUncovered.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Cobertura por sector
    const sectorTotal = new Map<string, { total: number; cubiertas: number }>();
    for (const c of inRange) {
      const prev = sectorTotal.get(c.sector) ?? { total: 0, cubiertas: 0 };
      sectorTotal.set(c.sector, {
        total: prev.total + 1,
        cubiertas: prev.cubiertas + (c.estado === "CUBIERTA" ? 1 : 0),
      });
    }
    const sectorCobertura = Array.from(sectorTotal.entries())
      .map(([name, { total, cubiertas }]) => ({ name, total, cubiertas, pct: pct(cubiertas, total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return {
      total, cubiertas, parciales, vencidas, enviadas, canceladas,
      coberturaGlobal: pct(cubiertas, total),
      topMedicos,
      topSectoresSinCubrir,
      sectorCobertura,
    };
  }, [period]);

  const maxMedico  = Math.max(...stats.topMedicos.map(x => x.count), 1);
  const maxSinCubr = Math.max(...stats.topSectoresSinCubrir.map(x => x.count), 1);
  const maxSector  = Math.max(...stats.sectorCobertura.map(x => x.total), 1);

  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>KPIs de Cobertura</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Métricas de cobertura y actividad médica
          </p>
        </div>
        {/* Period selector */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["7d","30d","90d"] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "7px 16px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              border: `1.5px solid ${period === p ? "rgba(21,101,192,0.60)" : "var(--border)"}`,
              background: period === p ? "rgba(21,101,192,0.10)" : "var(--surface)",
              color: period === p ? "var(--blue)" : "var(--muted)",
              transition: "all 0.12s",
            }}>
              {p === "7d" ? "7 días" : p === "30d" ? "30 días" : "90 días"}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 22 }}>
        <StatCard label="Cobertura global" value={`${stats.coberturaGlobal}%`} sub={`${stats.cubiertas} de ${stats.total} conv.`} rgb="109,191,60" />
        <StatCard label="Cubiertas" value={stats.cubiertas} sub="guardias confirmadas" rgb="22,163,74" />
        <StatCard label="Vencidas" value={stats.vencidas} sub="sin cubrir al vencer" rgb="220,38,38" />
        <StatCard label="En curso" value={stats.enviadas} sub="activas / parciales" rgb="21,101,192" />
        <StatCard label="Canceladas" value={stats.canceladas} sub="en el período" rgb="100,116,139" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* Top médicos activos */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>Top médicos activos</h3>
          {stats.topMedicos.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Sin datos en el período.</p>
          ) : (
            stats.topMedicos.map((m, i) => (
              <BarRow key={m.id} label={`${i + 1}. ${m.name}`} value={m.count} max={maxMedico} rgb="21,101,192" />
            ))
          )}
        </div>

        {/* Sectores sin cubrir */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>Sectores con más vencidas</h3>
          {stats.topSectoresSinCubrir.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Sin vencidas en el período.</p>
          ) : (
            stats.topSectoresSinCubrir.map(s => (
              <BarRow key={s.name} label={s.name} value={s.count} max={maxSinCubr} rgb="220,38,38" />
            ))
          )}
        </div>

        {/* Cobertura por sector */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)", gridColumn: "1 / -1" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>Cobertura por sector</h3>
          {stats.sectorCobertura.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Sin convocatorias en el período.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "6px 24px" }}>
              {stats.sectorCobertura.map(s => {
                const rgb = s.pct >= 80 ? "22,163,74" : s.pct >= 50 ? "217,119,6" : "220,38,38";
                return (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>{s.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: `rgb(${rgb})` }}>{s.pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--border-2)", overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ width: `${s.pct}%`, height: "100%", borderRadius: 3, background: `rgb(${rgb})`, transition: "width 0.4s ease" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--subtle)", marginBottom: 10 }}>
                      {s.cubiertas} cubiertas de {s.total} convocatorias
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
