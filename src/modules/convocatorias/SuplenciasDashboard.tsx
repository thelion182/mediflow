import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { convocatoriaStore } from "./convocatoria.store";
import { medicosStore } from "../admin/medicos.store";
import { AppShell } from "../../ui/AppShell";
import type { Canal } from "./convocatoria.types";
import { CANAL_META } from "../config/config.types";
import { authStore } from "../../auth/auth.store";

// ── Constants ─────────────────────────────────────────────────────────────
const AUTO_REFRESH_MS = 10_000;
const UI_TICK_MS = 1_000;

// ── Helpers ───────────────────────────────────────────────────────────────
function pad2(n: number) { return String(Math.max(0, Math.floor(n))).padStart(2, "0"); }
function fmtMmSs(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}
function isSequential1Cupo(c: any) {
  return (c?.modoEnvio ?? "MASIVO") === "SECUENCIAL" && (Number(c?.cupos) || 1) === 1;
}
function findActiveInvIndex(c: any) {
  return (c?.invitaciones || []).findIndex((i: any) => i.estado === "ENVIADA" || i.estado === "VISTA");
}
function findNextWaitingIndex(c: any, startIdx = 0) {
  const invs = (c?.invitaciones || []) as any[];
  for (let i = Math.max(0, startIdx); i < invs.length; i++) {
    if (invs[i]?.estado === "EN_ESPERA") return i;
  }
  return -1;
}
function getTimeouts(c: any) {
  return {
    sinVerMin: Number(c?.timeouts?.sinVerMin) || 60,
    sinResponderMin: Number(c?.timeouts?.sinResponderMin) || 60,
  };
}
function computeSecuencialStatus(c: any) {
  if (!isSequential1Cupo(c)) return null;
  if (c?.estado === "CANCELADA") return null;
  const confirmadas = (c?.asignaciones || []).filter(
    (a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA"
  ).length;
  if (confirmadas >= (Number(c?.cupos) || 1)) return null;
  const invs = (c?.invitaciones || []) as any[];
  const activeIdx = findActiveInvIndex(c);
  if (activeIdx < 0) return null;
  const inv = invs[activeIdx];
  const { sinVerMin, sinResponderMin } = getTimeouts(c);
  const now = Date.now();
  const sentAt = inv?.sentAt ? new Date(inv.sentAt).getTime() : null;
  const seenAt = inv?.seenAt ? new Date(inv.seenAt).getTime() : null;
  let phase: "ESPERANDO_VER" | "ESPERANDO_RESPUESTA" = "ESPERANDO_VER";
  let deadlineMs: number | null = null;
  if (inv?.estado === "ENVIADA") {
    phase = "ESPERANDO_VER";
    deadlineMs = sentAt ? sentAt + sinVerMin * 60_000 : null;
  } else {
    phase = "ESPERANDO_RESPUESTA";
    deadlineMs = seenAt ? seenAt + sinResponderMin * 60_000 : null;
  }
  const remainingSec =
    deadlineMs !== null ? Math.max(0, Math.round((deadlineMs - now) / 1000)) : null;
  const nextIdx = findNextWaitingIndex(c, activeIdx + 1);
  return {
    activeMedicoId: String(inv?.medicoId || ""),
    activeEstado: String(inv?.estado || ""),
    phase,
    remainingSec,
    nextMedicoId: nextIdx >= 0 ? String(invs[nextIdx]?.medicoId || "") : null,
  };
}

function buildInvStats(invs: any[]) {
  const total     = invs.length;
  const acepto    = invs.filter(i => i.estado === "ACEPTO").length;
  const rechazo   = invs.filter(i => i.estado === "RECHAZO").length;
  const pendiente = invs.filter(i => i.estado === "ENVIADA" || i.estado === "VISTA").length;
  const espera    = invs.filter(i => i.estado === "EN_ESPERA").length;
  const canales   = [...new Set(invs.filter(i => i.estado !== "EN_ESPERA").map(i => i.canal as Canal))];
  return { total, acepto, rechazo, pendiente, espera, canales };
}

// ── Color palette by estado ───────────────────────────────────────────────
const ESTADO_COLORS: Record<string, { rgb: string; label: string }> = {
  ENVIADA:   { rgb: "21,101,192",  label: "Enviada"   },
  PARCIAL:   { rgb: "217,119,6",   label: "Parcial"   },
  CUBIERTA:  { rgb: "22,163,74",   label: "Cubierta"  },
  VENCIDA:   { rgb: "220,38,38",   label: "Vencida"   },
  CANCELADA: { rgb: "100,116,139", label: "Cancelada" },
  BORRADOR:  { rgb: "148,163,184", label: "Borrador"  },
};

function estadoColor(estado: string) {
  return ESTADO_COLORS[estado] ?? { rgb: "100,116,139", label: estado };
}

function BadgeEstado({ estado }: { estado: string }) {
  const { rgb, label } = estadoColor(estado);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 9px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      background: `rgba(${rgb}, 0.12)`,
      color: `rgb(${rgb})`,
      border: `1px solid rgba(${rgb}, 0.25)`,
    }}>{label}</span>
  );
}

function CanalTag({ canal }: { canal: Canal }) {
  const meta = CANAL_META[canal] ?? { label: canal, rgb: "100,116,139" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 7px", borderRadius: 5,
      fontSize: 10.5, fontWeight: 700,
      background: `rgba(${meta.rgb}, 0.10)`,
      color: `rgb(${meta.rgb})`,
      border: `1px solid rgba(${meta.rgb}, 0.22)`,
    }}>
      {meta.icon} {meta.label}
    </span>
  );
}

// ── Coverage panel ────────────────────────────────────────────────────────
type Period = "hoy" | "semana" | "mes" | "rango";

function getPeriodRange(period: Period, rangeFrom?: string, rangeTo?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "hoy") {
    return { from: today.getTime(), to: today.getTime() + 86400_000 - 1 };
  }
  if (period === "semana") {
    const day = today.getDay();
    const mon = new Date(today); mon.setDate(today.getDate() - ((day + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: mon.getTime(), to: sun.getTime() + 86400_000 - 1 };
  }
  if (period === "mes") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: from.getTime(), to: to.getTime() };
  }
  // rango custom
  const from = rangeFrom ? new Date(rangeFrom + "T00:00:00").getTime() : today.getTime();
  const to   = rangeTo   ? new Date(rangeTo   + "T23:59:59").getTime() : today.getTime() + 86400_000;
  return { from, to };
}

function computeCoverage(all: any[], period: Period, rangeFrom?: string, rangeTo?: string) {
  const { from, to } = getPeriodRange(period, rangeFrom, rangeTo);
  const filtered = all.filter(c => {
    const t = new Date(c.inicio).getTime();
    return t >= from && t <= to;
  });

  const byEstado: Record<string, number> = {};
  const bySector: Record<string, { total: number; cubierta: number; parcial: number }> = {};
  const bySede:   Record<string, { total: number; cubierta: number; parcial: number }> = {};

  for (const c of filtered) {
    const e = c.estado || "ENVIADA";
    byEstado[e] = (byEstado[e] || 0) + 1;

    const sect = c.sector || "Sin sector";
    if (!bySector[sect]) bySector[sect] = { total: 0, cubierta: 0, parcial: 0 };
    bySector[sect].total++;
    if (e === "CUBIERTA") bySector[sect].cubierta++;
    if (e === "PARCIAL")  bySector[sect].parcial++;

    const sede = c.sede || "Sin sede";
    if (!bySede[sede]) bySede[sede] = { total: 0, cubierta: 0, parcial: 0 };
    bySede[sede].total++;
    if (e === "CUBIERTA") bySede[sede].cubierta++;
    if (e === "PARCIAL")  bySede[sede].parcial++;
  }

  return {
    total: filtered.length,
    byEstado,
    bySector: Object.entries(bySector).sort((a, b) => b[1].total - a[1].total),
    bySede:   Object.entries(bySede).sort((a, b) => b[1].total - a[1].total),
  };
}

function CoverageBar({ cubierta, parcial, total }: { cubierta: number; parcial: number; total: number }) {
  if (total === 0) return <div style={{ height: 6, borderRadius: 4, background: "var(--border)", width: "100%" }} />;
  const pctC = (cubierta / total) * 100;
  const pctP = (parcial / total) * 100;
  const pctR = 100 - pctC - pctP;
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", width: "100%", background: "var(--border-2)" }}>
      {pctC > 0 && <div style={{ width: `${pctC}%`, background: "rgb(22,163,74)", transition: "width 0.4s" }} />}
      {pctP > 0 && <div style={{ width: `${pctP}%`, background: "rgb(217,119,6)", transition: "width 0.4s" }} />}
      {pctR > 0 && <div style={{ width: `${pctR}%`, background: "var(--border)", transition: "width 0.4s" }} />}
    </div>
  );
}

function CoveragePanel({ all }: { all: any[] }) {
  const [period, setPeriod] = useState<Period>("hoy");
  const [rangeFrom, setRangeFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [rangeTo, setRangeTo] = useState(() => new Date().toISOString().slice(0, 10));

  const cov = useMemo(
    () => computeCoverage(all, period, rangeFrom, rangeTo),
    [all, period, rangeFrom, rangeTo]
  );

  const cubierta   = cov.byEstado["CUBIERTA"]  || 0;
  const parcial    = cov.byEstado["PARCIAL"]   || 0;
  const enviada    = cov.byEstado["ENVIADA"]   || 0;
  const vencida    = cov.byEstado["VENCIDA"]   || 0;
  const cancelada  = cov.byEstado["CANCELADA"] || 0;
  const coveragePct = cov.total > 0 ? Math.round(((cubierta + parcial * 0.5) / cov.total) * 100) : 0;

  const periodLabels: { key: Period; label: string }[] = [
    { key: "hoy",    label: "Hoy"    },
    { key: "semana", label: "Semana" },
    { key: "mes",    label: "Mes"    },
    { key: "rango",  label: "Rango"  },
  ];

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "var(--shadow-sm)",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Cobertura
        </div>
        {/* Period tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {periodLabels.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                flex: 1,
                padding: "5px 0",
                borderRadius: 7,
                border: "none",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                background: period === p.key ? "var(--blue)" : "transparent",
                color: period === p.key ? "#fff" : "var(--muted)",
                transition: "all 0.15s",
              }}
            >{p.label}</button>
          ))}
        </div>
        {period === "rango" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
            <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
              style={{ padding: "4px 6px", fontSize: 11, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)" }} />
            <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
              style={{ padding: "4px 6px", fontSize: 11, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)" }} />
          </div>
        )}
      </div>

      <div style={{ padding: "12px 14px" }}>
        {cov.total === 0 ? (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, textAlign: "center", padding: "12px 0" }}>
            Sin convocatorias en el período
          </p>
        ) : (
          <>
            {/* Summary */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{cov.total} convocatoria{cov.total !== 1 ? "s" : ""}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: coveragePct >= 70 ? "rgb(22,163,74)" : coveragePct >= 40 ? "rgb(217,119,6)" : "rgb(220,38,38)" }}>
                  {coveragePct}%
                </span>
              </div>
              <CoverageBar cubierta={cubierta} parcial={parcial} total={cov.total} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", marginTop: 8 }}>
                {[
                  { label: "Cubiertas",  count: cubierta,  rgb: "22,163,74"   },
                  { label: "Parciales",  count: parcial,   rgb: "217,119,6"   },
                  { label: "En curso",   count: enviada,   rgb: "21,101,192"  },
                  { label: "Vencidas",   count: vencida,   rgb: "220,38,38"   },
                  { label: "Canceladas", count: cancelada, rgb: "100,116,139" },
                ].filter(x => x.count > 0).map(x => (
                  <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: `rgb(${x.rgb})`, flexShrink: 0 }} />
                    <span style={{ color: "var(--muted)" }}>{x.label}</span>
                    <span style={{ fontWeight: 700, color: "var(--text)", marginLeft: "auto" }}>{x.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By sector */}
            {cov.bySector.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "var(--subtle)", textTransform: "uppercase", marginBottom: 8 }}>
                  Por sector
                </div>
                <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                  {cov.bySector.slice(0, 6).map(([sector, s]) => (
                    <div key={sector}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: "var(--text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{sector}</span>
                        <span style={{ color: "var(--muted)", flexShrink: 0 }}>{s.cubierta + s.parcial}/{s.total}</span>
                      </div>
                      <CoverageBar cubierta={s.cubierta} parcial={s.parcial} total={s.total} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* By sede */}
            {cov.bySede.length > 1 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "var(--subtle)", textTransform: "uppercase", marginBottom: 8 }}>
                  Por sede
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {cov.bySede.slice(0, 5).map(([sede, s]) => (
                    <div key={sede}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: "var(--text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{sede}</span>
                        <span style={{ color: "var(--muted)", flexShrink: 0 }}>{s.cubierta + s.parcial}/{s.total}</span>
                      </div>
                      <CoverageBar cubierta={s.cubierta} parcial={s.parcial} total={s.total} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Convocatoria Card ─────────────────────────────────────────────────────
function ConvCard({ c, medicoName, nav }: { c: any; medicoName: (id: string) => string; nav: (path: string) => void }) {
  const confirmadas = (c.asignaciones || []).filter(
    (a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA"
  ).length;
  const sec = computeSecuencialStatus(c);
  const stats = buildInvStats(c.invitaciones || []);
  const { rgb } = estadoColor(c.estado);
  const isAlta = c.prioridad === "ALTA";

  const fmtDt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })
      + " " + d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <button
      onClick={() => nav(`/dashboard/c/${c.id}`)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 0,
        borderRadius: 12,
        border: `1px solid ${isAlta ? "rgba(220,38,38,0.25)" : "var(--border)"}`,
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "box-shadow 0.15s, transform 0.1s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* Left accent stripe */}
        <div style={{
          width: 4,
          flexShrink: 0,
          background: isAlta ? "rgb(220,38,38)" : `rgb(${rgb})`,
          borderRadius: "0",
        }} />

        {/* Content */}
        <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
          {/* Row 1: title + badges */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)", letterSpacing: "-0.01em" }}>
                {c.sector}
              </span>
              {c.sede && (
                <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)", marginLeft: 6 }}>
                  · {c.sede}
                </span>
              )}
              {isAlta && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 800,
                  color: "rgb(220,38,38)", letterSpacing: "0.05em",
                  background: "rgba(220,38,38,0.10)", padding: "1px 6px",
                  borderRadius: 4, border: "1px solid rgba(220,38,38,0.20)"
                }}>URGENTE</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap" }}>
              <BadgeEstado estado={c.estado} />
              {c.modoEnvio && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                  background: "var(--surface-2)", color: "var(--muted)",
                  border: "1px solid var(--border)", letterSpacing: "0.03em"
                }}>{c.modoEnvio}</span>
              )}
            </div>
          </div>

          {/* Row 2: sequential active doctor */}
          {sec && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", marginBottom: 8,
              background: `rgba(${rgb}, 0.06)`, borderRadius: 8,
              border: `1px solid rgba(${rgb}, 0.15)`,
              flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 12, color: `rgb(${rgb})`, fontWeight: 600 }}>
                Activo: {medicoName(sec.activeMedicoId)}
              </span>
              <span style={{
                fontSize: 11, fontFamily: "ui-monospace, monospace",
                background: `rgba(${rgb}, 0.12)`, color: `rgb(${rgb})`,
                padding: "2px 7px", borderRadius: 5, fontWeight: 700,
              }}>
                ⏱ T–{typeof sec.remainingSec === "number" ? fmtMmSs(sec.remainingSec) : "—"}
              </span>
              {sec.nextMedicoId && (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  Siguiente: {medicoName(sec.nextMedicoId).split(" ")[0]}
                </span>
              )}
            </div>
          )}

          {/* Row 3: dates + cupos */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              📅 {fmtDt(c.inicio)} → {fmtDt(c.fin)}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: confirmadas >= c.cupos ? "rgb(22,163,74)" : "var(--muted)",
            }}>
              Cupos {confirmadas}/{c.cupos}
            </span>
            <span style={{ fontSize: 11, color: "var(--subtle)" }}>
              Vence {fmtDt(c.vencimiento)}
            </span>
          </div>

          {/* Row 4: canal tags + inv stats */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {(c.canales || stats.canales).slice(0, 4).map((canal: Canal) => (
              <CanalTag key={canal} canal={canal} />
            ))}
            {stats.total > 0 && (
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>
                {stats.total} inv.
                {stats.acepto   > 0 && <span style={{ color: "rgb(22,163,74)",  marginLeft: 4, fontWeight: 700 }}>✓{stats.acepto}</span>}
                {stats.rechazo  > 0 && <span style={{ color: "rgb(220,38,38)", marginLeft: 4, fontWeight: 700 }}>✗{stats.rechazo}</span>}
                {stats.pendiente> 0 && <span style={{ color: "rgb(21,101,192)", marginLeft: 4, fontWeight: 700 }}>⏳{stats.pendiente}</span>}
                {stats.espera   > 0 && <span style={{ color: "var(--subtle)",  marginLeft: 4 }}>…{stats.espera}</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── KPI stat card ─────────────────────────────────────────────────────────
function KpiCard({ label, count, rgb, active, onClick }: {
  label: string; count: number; rgb: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: active ? `1.5px solid rgba(${rgb},0.4)` : "1px solid var(--border)",
        background: active ? `rgba(${rgb},0.08)` : "var(--surface)",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        boxShadow: "var(--shadow-sm)",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color: `rgb(${rgb})`, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, fontWeight: 500 }}>{label}</div>
    </button>
  );
}

// ── Sequential live card ───────────────────────────────────────────────────
function SeqCard({ c, st, medicoName, nav }: {
  c: any; st: NonNullable<ReturnType<typeof computeSecuencialStatus>>;
  medicoName: (id: string) => string; nav: (path: string) => void;
}) {
  const { rgb } = estadoColor(c.estado);
  const phaseLabel = st.phase === "ESPERANDO_VER" ? "Sin ver" : "Sin responder";
  const remaining  = typeof st.remainingSec === "number" ? fmtMmSs(st.remainingSec) : "—";
  const isUrgent   = typeof st.remainingSec === "number" && st.remainingSec < 300;

  return (
    <button
      onClick={() => nav(`/dashboard/c/${c.id}`)}
      style={{
        textAlign: "left", padding: 0,
        borderRadius: 12,
        border: `1px solid ${isUrgent ? "rgba(220,38,38,0.30)" : `rgba(${rgb},0.20)`}`,
        background: "var(--surface)",
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ width: 4, background: isUrgent ? "rgb(220,38,38)" : `rgb(${rgb})` }} />
        <div style={{ padding: "10px 12px", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            {c.sector}{c.sede ? ` · ${c.sede}` : ""}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            Médico: <b style={{ color: "var(--text)" }}>{medicoName(st.activeMedicoId)}</b>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{
              fontSize: 12, fontFamily: "ui-monospace, monospace",
              fontWeight: 800, letterSpacing: "-0.01em",
              color: isUrgent ? "rgb(220,38,38)" : `rgb(${rgb})`,
              background: isUrgent ? "rgba(220,38,38,0.10)" : `rgba(${rgb},0.10)`,
              padding: "3px 8px", borderRadius: 6,
            }}>⏱ {remaining}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{phaseLabel}</span>
          </div>
          {st.nextMedicoId && (
            <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 4 }}>
              Siguiente: {medicoName(st.nextMedicoId)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── List row view ─────────────────────────────────────────────────────────
function ConvRow({ c, medicoName, nav, deleteAction }: {
  c: any; medicoName: (id: string) => string; nav: (path: string) => void;
  deleteAction?: React.ReactNode;
}) {
  const confirmadas = (c.asignaciones || []).filter(
    (a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA"
  ).length;
  const sec = computeSecuencialStatus(c);
  const stats = buildInvStats(c.invitaciones || []);
  const { rgb } = estadoColor(c.estado);
  const isAlta = c.prioridad === "ALTA";

  const fmtShort = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })
      + " " + d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <button
      onClick={() => nav(`/dashboard/c/${c.id}`)}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: 0,
        border: "1px solid var(--border)",
        borderLeft: `3px solid rgb(${isAlta ? "220,38,38" : rgb})`,
        borderRadius: 10,
        background: "var(--surface)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "background 0.12s, box-shadow 0.12s",
        gap: 0,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
    >
      {/* Sector + sede */}
      <div style={{ flex: "0 0 200px", padding: "10px 14px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.sector}
          {isAlta && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: "rgb(220,38,38)", letterSpacing: "0.05em", verticalAlign: "middle" }}>URGENTE</span>}
        </div>
        {c.sede && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sede}</div>}
      </div>

      {/* Estado */}
      <div style={{ flex: "0 0 110px", padding: "0 10px" }}>
        <BadgeEstado estado={c.estado} />
      </div>

      {/* Fechas */}
      <div style={{ flex: "1 1 0", padding: "0 10px", fontSize: 11.5, color: "var(--muted)", minWidth: 0 }}>
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {fmtShort(c.inicio)} → {fmtShort(c.fin)}
        </div>
        <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>Vence {fmtShort(c.vencimiento)}</div>
      </div>

      {/* Cupos */}
      <div style={{ flex: "0 0 80px", padding: "0 10px", textAlign: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: confirmadas >= c.cupos ? "rgb(22,163,74)" : "var(--muted)" }}>
          {confirmadas}/{c.cupos}
        </span>
        <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 1 }}>cupos</div>
      </div>

      {/* Inv stats */}
      <div style={{ flex: "0 0 90px", padding: "0 10px", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
        {stats.total > 0 && (
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            {stats.acepto   > 0 && <span style={{ color: "rgb(22,163,74)",  fontWeight: 700 }}>✓{stats.acepto}</span>}
            {stats.rechazo  > 0 && <span style={{ color: "rgb(220,38,38)", fontWeight: 700 }}>✗{stats.rechazo}</span>}
            {stats.pendiente> 0 && <span style={{ color: "rgb(21,101,192)", fontWeight: 700 }}>⏳{stats.pendiente}</span>}
            {stats.espera   > 0 && <span style={{ color: "var(--subtle)" }}>…{stats.espera}</span>}
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 1 }}>{stats.total} inv</div>
      </div>

      {/* Canal + seq */}
      <div style={{ flex: "0 0 120px", padding: "0 6px 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
        {(c.canales || stats.canales).slice(0, 2).map((canal: Canal) => (
          <CanalTag key={canal} canal={canal} />
        ))}
        {sec && (
          <span style={{
            fontSize: 11, fontFamily: "ui-monospace, monospace", fontWeight: 700,
            color: typeof sec.remainingSec === "number" && sec.remainingSec < 300 ? "rgb(220,38,38)" : `rgb(${rgb})`,
            background: typeof sec.remainingSec === "number" && sec.remainingSec < 300 ? "rgba(220,38,38,0.10)" : `rgba(${rgb},0.10)`,
            padding: "2px 6px", borderRadius: 5,
          }}>⏱{typeof sec.remainingSec === "number" ? fmtMmSs(sec.remainingSec) : "—"}</span>
        )}
      </div>

      {/* Acción de borrado — columna fija al final */}
      <div style={{ flex: "0 0 36px", display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={e => e.stopPropagation()}>
        {deleteAction}
      </div>
    </button>
  );
}

// ── FILTROS (chips) ────────────────────────────────────────────────────────
type FiltroEstado = "TODAS" | "ENVIADA" | "PARCIAL" | "CUBIERTA" | "VENCIDA" | "CANCELADA";
const FILTROS: { key: FiltroEstado; label: string; rgb?: string }[] = [
  { key: "TODAS",    label: "Todas" },
  { key: "ENVIADA",  label: "En curso",  rgb: "21,101,192"  },
  { key: "PARCIAL",  label: "Parcial",   rgb: "217,119,6"   },
  { key: "CUBIERTA", label: "Cubiertas", rgb: "22,163,74"   },
  { key: "VENCIDA",  label: "Vencidas",  rgb: "220,38,38"   },
  { key: "CANCELADA",label: "Canceladas",rgb: "100,116,139" },
];

type ViewMode = "cards" | "list";

// ── Main Dashboard ────────────────────────────────────────────────────────
export function SuplenciasDashboard() {
  const nav = useNavigate();
  const [filtro, setFiltro] = useState<FiltroEstado>("TODAS");
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem("mf.dash.view") as ViewMode) ?? "cards"
  );
  const [tick, setTick]     = useState(0);
  const [uiTick, setUiTick] = useState(0);

  function changeView(v: ViewMode) {
    setViewMode(v);
    localStorage.setItem("mf.dash.view", v);
  }

  useEffect(() => {
    convocatoriaStore.seedIfEmpty();
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      if (id) return;
      id = window.setInterval(() => {
        if (document.visibilityState === "visible") setTick(t => t + 1);
      }, AUTO_REFRESH_MS);
    };
    const stop = () => { if (id) { window.clearInterval(id); id = null; } };
    const onVis = () => document.visibilityState === "visible" ? (setTick(t => t + 1), start()) : stop();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); stop(); };
  }, []);

  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      if (id) return;
      id = window.setInterval(() => {
        if (document.visibilityState === "visible") setUiTick(x => x + 1);
      }, UI_TICK_MS);
    };
    const stop = () => { if (id) { window.clearInterval(id); id = null; } };
    const onVis = () => document.visibilityState === "visible" ? start() : stop();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); stop(); };
  }, []);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const session      = authStore.getSession();
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  function aprobarDev(convId: string, asgId: string) {
    convocatoriaStore.aprobarDevolucion(convId, asgId, session?.userId ?? "");
    setTick(t => t + 1);
  }
  function rechazarDev(convId: string, asgId: string) {
    convocatoriaStore.rechazarDevolucion(convId, asgId);
    setTick(t => t + 1);
  }

  function handleDelete(c: any) {
    const label = `${c.sector}${c.sede ? " · " + c.sede : ""} — ${new Date(c.inicio).toLocaleDateString("es-UY")}`;
    const ok = window.confirm(
      `⚠️ BORRADO PERMANENTE\n\n"${label}"\n\nEsta acción no se puede deshacer. ¿Confirmar?`
    );
    if (!ok) return;
    convocatoriaStore.hardDelete(c.id);
    setTick(t => t + 1);
  }

  const all = useMemo(() => convocatoriaStore.list(), [tick]);

  const list = useMemo(() => {
    if (filtro === "TODAS") return all;
    return all.filter(c => c.estado === filtro);
  }, [all, filtro]);

  const kpis = useMemo(() => {
    const base = { ENVIADA: 0, PARCIAL: 0, CUBIERTA: 0, VENCIDA: 0, CANCELADA: 0 };
    for (const c of all) (base as any)[c.estado] = ((base as any)[c.estado] || 0) + 1;
    return base;
  }, [all]);

  const medicosById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of medicosStore.list()) map.set(m.userId, m.displayName);
    return map;
  }, [tick]);
  const medicoName = (id: string) => medicosById.get(id) ?? id;

  const devolucionesPendientes = useMemo(() => {
    const items: { c: any; asg: any }[] = [];
    for (const c of all) {
      for (const asg of c.asignaciones ?? []) {
        if (asg.estado === "DEVOLUCION_PENDIENTE") items.push({ c, asg });
      }
    }
    return items;
  }, [all]);

  const secuencialesActivas = useMemo(() => {
    void uiTick;
    const out = [];
    for (const c of all) {
      const st = computeSecuencialStatus(c);
      if (st) out.push({ c, st });
    }
    return out;
  }, [all, uiTick]);

  return (
    <AppShell>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Inicio</h1>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--subtle)" }}>
            Refresh cada {Math.round(AUTO_REFRESH_MS / 1000)}s · solo pestaña activa
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{
              padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--muted)", fontSize: 13, cursor: "pointer"
            }}
            onClick={() => setTick(t => t + 1)}
          >↺</button>
          <button
            onClick={() => nav("/dashboard/nueva")}
            style={{
              padding: "8px 18px", borderRadius: 10,
              border: "none",
              background: "var(--blue)", color: "#fff",
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(21,101,192,0.25)",
            }}
          >+ Nueva convocatoria</button>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

        {/* ── Main column ── */}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 16 }}>

          {/* Devoluciones pendientes */}
          {devolucionesPendientes.length > 0 && (
            <div style={{
              background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.25)",
              borderRadius: 14, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgb(217,119,6)" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  Devoluciones pendientes · {devolucionesPendientes.length}
                </span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {devolucionesPendientes.map(({ c, asg }) => {
                  const fmtDt = (iso: string) => new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={`${c.id}-${asg.id}`} style={{
                      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                      padding: "10px 14px", borderRadius: 10,
                      background: "var(--surface)", border: "1px solid rgba(217,119,6,0.25)",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                          {c.sector}{c.sede ? ` · ${c.sede}` : ""}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                          {medicoName(asg.medicoId)} · {fmtDt(c.inicio)}
                        </div>
                        {asg.devolucionMotivo && (
                          <div style={{ fontSize: 11.5, color: "rgb(150,80,0)", marginTop: 4, fontStyle: "italic" }}>
                            Motivo: {asg.devolucionMotivo}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => aprobarDev(c.id, asg.id)}
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                            border: "1px solid rgba(22,163,74,0.35)", background: "rgba(22,163,74,0.10)", color: "rgb(22,163,74)",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(22,163,74,0.20)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "rgba(22,163,74,0.10)")}
                        >✓ Aprobar</button>
                        <button
                          onClick={() => rechazarDev(c.id, asg.id)}
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                            border: "1px solid rgba(220,38,38,0.30)", background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(220,38,38,0.18)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "rgba(220,38,38,0.08)")}
                        >✕ Rechazar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sequential live panel */}
          {secuencialesActivas.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgb(22,163,74)", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  Secuencial en vivo · {secuencialesActivas.length}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {secuencialesActivas.map(({ c, st }) => (
                  <SeqCard key={c.id} c={c} st={st as any} medicoName={medicoName} nav={nav} />
                ))}
              </div>
            </div>
          )}

          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            <KpiCard label="En curso"   count={kpis.ENVIADA}   rgb="21,101,192"  active={filtro === "ENVIADA"}   onClick={() => setFiltro(f => f === "ENVIADA"   ? "TODAS" : "ENVIADA")}   />
            <KpiCard label="Cubiertas"  count={kpis.CUBIERTA}  rgb="22,163,74"   active={filtro === "CUBIERTA"}  onClick={() => setFiltro(f => f === "CUBIERTA"  ? "TODAS" : "CUBIERTA")}  />
            <KpiCard label="Parciales"  count={kpis.PARCIAL}   rgb="217,119,6"   active={filtro === "PARCIAL"}   onClick={() => setFiltro(f => f === "PARCIAL"   ? "TODAS" : "PARCIAL")}   />
            <KpiCard label="Vencidas"   count={kpis.VENCIDA}   rgb="220,38,38"   active={filtro === "VENCIDA"}   onClick={() => setFiltro(f => f === "VENCIDA"   ? "TODAS" : "VENCIDA")}   />
            <KpiCard label="Canceladas" count={kpis.CANCELADA} rgb="100,116,139" active={filtro === "CANCELADA"} onClick={() => setFiltro(f => f === "CANCELADA" ? "TODAS" : "CANCELADA")} />
          </div>

          {/* Filter chips + view toggle */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {FILTROS.map(f => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: filtro === f.key
                    ? `1.5px solid rgba(${f.rgb || "21,101,192"},0.4)`
                    : "1px solid var(--border)",
                  background: filtro === f.key
                    ? `rgba(${f.rgb || "21,101,192"},0.10)`
                    : "var(--surface)",
                  color: filtro === f.key
                    ? `rgb(${f.rgb || "21,101,192"})`
                    : "var(--muted)",
                  fontSize: 12, fontWeight: filtro === f.key ? 700 : 500,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >{f.label}</button>
            ))}
            <span style={{ fontSize: 12, color: "var(--subtle)", alignSelf: "center", marginLeft: 4 }}>
              {list.length} resultado{list.length !== 1 ? "s" : ""}
            </span>

            {/* View toggle */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 8, padding: 3, border: "1px solid var(--border-2)" }}>
              {([
                { key: "cards" as ViewMode, icon: "⊞", title: "Tarjetas" },
                { key: "list"  as ViewMode, icon: "☰", title: "Lista"    },
              ]).map(v => (
                <button
                  key={v.key}
                  title={v.title}
                  onClick={() => changeView(v.key)}
                  style={{
                    width: 28, height: 26, border: "none", borderRadius: 6,
                    background: viewMode === v.key ? "var(--surface)" : "transparent",
                    boxShadow: viewMode === v.key ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
                    color: viewMode === v.key ? "var(--blue)" : "var(--subtle)",
                    fontSize: 14, cursor: "pointer", transition: "all 0.12s",
                  }}
                >{v.icon}</button>
              ))}
            </div>

          </div>

          {/* Convocatoria list */}
          {list.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 20px",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, color: "var(--muted)",
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <p style={{ margin: 0, fontSize: 13 }}>Sin convocatorias en este filtro</p>
            </div>
          ) : viewMode === "list" ? (
            /* ── List view ── */
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              {/* List header */}
              <div style={{
                display: "flex", alignItems: "center",
                padding: "7px 14px 7px 17px",
                background: "var(--surface-2)", borderBottom: "1px solid var(--border-2)",
                fontSize: 11, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                <div style={{ flex: "0 0 200px" }}>Sector / Sede</div>
                <div style={{ flex: "0 0 110px" }}>Estado</div>
                <div style={{ flex: "1 1 0" }}>Fechas</div>
                <div style={{ flex: "0 0 80px", textAlign: "center" }}>Cupos</div>
                <div style={{ flex: "0 0 90px", textAlign: "center" }}>Inv.</div>
                <div style={{ flex: "0 0 120px" }}>Canales</div>
                {isSuperAdmin && <div style={{ flex: "0 0 36px" }} />}
              </div>
              <div style={{ display: "grid", gap: 0 }}>
                {list.map((c, i) => (
                  <div
                    key={c.id}
                    style={{ borderBottom: i < list.length - 1 ? "1px solid var(--border-2)" : "none" }}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <ConvRow
                      c={c} medicoName={medicoName} nav={nav}
                      deleteAction={isSuperAdmin ? (
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(c); }}
                          title="Borrar permanentemente"
                          style={{
                            ...rowDeleteBtnStyle,
                            opacity: hoveredId === c.id ? 1 : 0,
                            pointerEvents: hoveredId === c.id ? "auto" : "none",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(220,38,38,0.18)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "rgba(220,38,38,0.07)")}
                        >🗑</button>
                      ) : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── Cards view ── */
            <div style={{ display: "grid", gap: 10 }}>
              {list.map(c => (
                <div
                  key={c.id}
                  style={{ position: "relative" }}
                  onMouseEnter={() => setHoveredId(c.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <ConvCard c={c} medicoName={medicoName} nav={nav} />
                  {isSuperAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(c); }}
                      title="Borrar permanentemente (Solo Super Admin)"
                      style={{ ...deleteOverlayStyle, opacity: hoveredId === c.id ? 1 : 0, pointerEvents: hoveredId === c.id ? "auto" : "none" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(220,38,38,0.18)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(220,38,38,0.07)")}
                    >🗑</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: coverage panel ── */}
        <div style={{ width: 260, flexShrink: 0, position: "sticky", top: 22 }}>
          <CoveragePanel all={all} />
        </div>
      </div>
    </AppShell>
  );
}

// Botón de borrado para cards (overlay absoluto top-right, sin solapar contenido)
const deleteOverlayStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  right: 8,
  zIndex: 10,
  padding: "5px 9px",
  borderRadius: 8,
  border: "1px solid rgba(220,38,38,0.30)",
  background: "rgba(220,38,38,0.07)",
  color: "rgb(220,38,38)",
  fontSize: 14,
  cursor: "pointer",
  lineHeight: 1,
  opacity: 0,
  transition: "opacity 0.15s, background 0.12s",
};

// Botón de borrado para filas de lista (columna propia, no overlay)
const rowDeleteBtnStyle: React.CSSProperties = {
  padding: "5px 7px",
  borderRadius: 7,
  border: "1px solid rgba(220,38,38,0.30)",
  background: "rgba(220,38,38,0.07)",
  color: "rgb(220,38,38)",
  fontSize: 13,
  cursor: "pointer",
  lineHeight: 1,
  transition: "opacity 0.15s, background 0.12s",
};
