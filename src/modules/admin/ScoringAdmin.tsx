import React, { useMemo, useState } from "react";
import { medicosStore } from "./medicos.store";
import { convocatoriaStore } from "../convocatorias/convocatoria.store";
import { DoctorAvatar } from "./DoctorAvatar";
import { computeNuevoScore } from "./scoring";
import type { ScoreResult } from "./scoring";

// ── W constants for Pts display (max values) ──────────────────────────────

const W = {
  tecnico:          64,
  postgrado:        49,
  relacionamiento:  36,
  quejas:           25,
  coberturaNoche:   16,
  rechazos:         9,
  horasMensuales:   4,
  antiguedad:       1,
};

// ── Helpers ───────────────────────────────────────────────────────────────

function sortScores(scores: ScoreResult[]): ScoreResult[] {
  const normales  = scores.filter(s => !s.descalificado && !s.quedaUltimo);
  const ultimos   = scores.filter(s => !s.descalificado &&  s.quedaUltimo);
  const desc      = scores.filter(s =>  s.descalificado);
  normales.sort((a, b) => b.total - a.total);
  ultimos.sort((a, b) => b.total - a.total);
  return [...normales, ...ultimos, ...desc];
}

const TECNICO_LABELS: Record<string, string> = {
  EXCELENTE: "Excelente", BUENO: "Bueno", REGULAR: "Regular", MALO: "Malo"
};
const POSTGRADO_LABELS: Record<string, string> = {
  COMPLETO: "Completo", EN_CURSO: "En curso", NO_REALIZA: "No realiza"
};
const REL_LABELS: Record<string, string> = {
  BUENO: "Bueno", REGULAR: "Regular", MALO: "Malo"
};
const QUEJAS_LABELS: Record<string, string> = {
  NINGUNA: "Ninguna/aisladas", RECURRENTES: "Recurrentes", FRECUENTES: "Frecuentes"
};

function Pts({ v, max }: { v: number; max: number }) {
  const pct = max > 0 ? v / max : 0;
  const rgb = pct >= 0.7 ? "109,191,60" : pct >= 0.4 ? "217,119,6" : "220,38,38";
  return (
    <span style={{ fontWeight: 700, fontSize: 12, color: `rgb(${rgb})` }}>
      {Math.round(v)}
    </span>
  );
}

export function ScoringAdmin() {
  const [tick, setTick] = useState(0);

  const { scores, maxTotal } = useMemo(() => {
    const medicos = medicosStore.list().filter(m => m.activo);
    const convs   = convocatoriaStore.list();
    const s = medicos.map(m => computeNuevoScore(m, convs));
    const maxTotal = Math.max(1, ...s.filter(x => !x.descalificado).map(x => x.total));
    return { scores: sortScores(s), maxTotal };
  }, [tick]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{
        padding: "10px 16px", borderRadius: 10,
        background: "rgba(21,101,192,0.06)", border: "1px solid rgba(21,101,192,0.15)",
        fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6,
      }}>
        <b style={{ color: "var(--blue)" }}>Score caso a caso.</b> Orden: normales (mayor puntaje arriba) → quedan último → descalificados.
        Los criterios manuales se configuran en la ficha de cada médico (Médicos → Editar). Los automáticos se calculan desde el historial.
        <button onClick={() => setTick(t => t + 1)} style={{ marginLeft: 12, padding: "2px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 12 }}>↺ Actualizar</button>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 70px 60px 60px 60px 60px 60px 60px 60px 80px",
          padding: "8px 14px", background: "var(--surface-2)",
          borderBottom: "1px solid var(--border-2)", fontSize: 11, fontWeight: 700,
          color: "var(--muted)", letterSpacing: "0.04em",
        }}>
          <span>MÉDICO</span>
          <span style={{ textAlign: "center" }}>TOTAL</span>
          <span style={{ textAlign: "center" }}>TÉC.</span>
          <span style={{ textAlign: "center" }}>POST.</span>
          <span style={{ textAlign: "center" }}>REL.</span>
          <span style={{ textAlign: "center" }}>QUEJAS</span>
          <span style={{ textAlign: "center" }}>NOC/FD</span>
          <span style={{ textAlign: "center" }}>RECHAZ.</span>
          <span style={{ textAlign: "center" }}>ANTIG.</span>
          <span style={{ textAlign: "center" }}>ESTADO</span>
        </div>

        {scores.map((s, i) => {
          const totalPct = s.total / maxTotal;
          const totalRgb = s.descalificado ? "220,38,38" : s.quedaUltimo ? "217,119,6" : totalPct >= 0.6 ? "109,191,60" : "21,101,192";

          return (
            <div key={s.medico.userId} style={{
              display: "grid",
              gridTemplateColumns: "2fr 70px 60px 60px 60px 60px 60px 60px 60px 80px",
              padding: "10px 14px",
              borderBottom: i < scores.length - 1 ? "1px solid var(--border-2)" : "none",
              alignItems: "center",
              background: s.descalificado ? "rgba(220,38,38,0.04)" : s.quedaUltimo ? "rgba(217,119,6,0.04)" : "transparent",
              opacity: s.descalificado ? 0.65 : 1,
            }}>
              {/* Médico */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <DoctorAvatar medico={s.medico} size={30} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{s.medico.displayName}</div>
                  <div style={{ fontSize: 10.5, color: "var(--subtle)" }}>{s.medico.tipo} · {s.medico.gremio ?? "SMU"}</div>
                </div>
              </div>

              {/* Total */}
              <div style={{ textAlign: "center" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 46, height: 26, borderRadius: 8,
                  background: `rgba(${totalRgb},0.12)`, border: `1px solid rgba(${totalRgb},0.25)`,
                  fontWeight: 800, fontSize: 14, color: `rgb(${totalRgb})`,
                }}>{Math.round(s.total)}</span>
              </div>

              {/* Criterios manuales */}
              <div style={{ textAlign: "center" }}>
                <Pts v={s.detalle.tecnico ?? 0} max={3 * W.tecnico} />
                <div style={{ fontSize: 9.5, color: "var(--subtle)", marginTop: 1 }}>{TECNICO_LABELS[s.medico.scoreManual?.tecnico ?? ""] ?? "—"}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <Pts v={s.detalle.postgrado ?? 0} max={2 * W.postgrado} />
                <div style={{ fontSize: 9.5, color: "var(--subtle)", marginTop: 1 }}>{POSTGRADO_LABELS[s.medico.scoreManual?.postgrado ?? ""] ?? "—"}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <Pts v={s.detalle.relacionamiento ?? 0} max={2 * W.relacionamiento} />
                <div style={{ fontSize: 9.5, color: "var(--subtle)", marginTop: 1 }}>{REL_LABELS[s.medico.scoreManual?.relacionamiento ?? ""] ?? "—"}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <Pts v={s.detalle.quejas ?? 0} max={2 * W.quejas} />
                <div style={{ fontSize: 9.5, color: "var(--subtle)", marginTop: 1 }}>{QUEJAS_LABELS[s.medico.scoreManual?.quejas ?? ""] ?? "—"}</div>
              </div>

              {/* Criterios automáticos */}
              <div style={{ textAlign: "center" }}>
                <Pts v={s.detalle.coberturaNoche ?? 0} max={2 * W.coberturaNoche} />
              </div>
              <div style={{ textAlign: "center" }}>
                <Pts v={s.detalle.rechazos ?? 0} max={2 * W.rechazos} />
              </div>
              <div style={{ textAlign: "center" }}>
                <Pts v={s.detalle.antiguedad ?? 0} max={2 * W.antiguedad} />
                <div style={{ fontSize: 9.5, color: "var(--subtle)", marginTop: 1 }}>
                  {s.medico.antiguedadAnios != null ? `${s.medico.antiguedadAnios}a` : "—"}
                </div>
              </div>

              {/* Estado */}
              <div style={{ textAlign: "center" }}>
                {s.descalificado ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgb(220,38,38)", background: "rgba(220,38,38,0.10)", padding: "2px 7px", borderRadius: 20 }}>Descalif.</span>
                ) : s.quedaUltimo ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgb(217,119,6)", background: "rgba(217,119,6,0.10)", padding: "2px 7px", borderRadius: 20 }}>Último</span>
                ) : (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgb(109,191,60)", background: "rgba(109,191,60,0.10)", padding: "2px 7px", borderRadius: 20 }}>Normal</span>
                )}
              </div>
            </div>
          );
        })}

        {scores.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "var(--subtle)", fontSize: 13 }}>
            Sin médicos activos.
          </div>
        )}
      </div>
    </div>
  );
}
