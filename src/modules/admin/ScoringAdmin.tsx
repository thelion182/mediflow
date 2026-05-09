import React, { useMemo, useState } from "react";
import { medicosStore } from "./medicos.store";
import { convocatoriaStore } from "../convocatorias/convocatoria.store";
import { configStore } from "../config/config.store";
import { DoctorAvatar } from "./DoctorAvatar";
import type { Medico } from "./medicos.types";
import type { Convocatoria } from "../convocatorias/convocatoria.types";

type SortKey = "score" | "aceptacion" | "velocidad" | "puntualidad" | "nombre";

interface DocScore {
  medico: Medico;
  invTotal: number;
  aceptacion: number;    // 0–1
  velocidad: number;     // 0–1  (normalizado: 0 min = 1, 60 min = 0)
  puntualidad: number;   // 0–1
  disponibilidad: number;// 0–1 (proxy: acepta turnos nocturnos/finde)
  score: number;         // 0–100
}

function velNorm(avgMs: number | null): number {
  if (avgMs === null) return 0.5;
  const mins = avgMs / 60000;
  if (mins <= 3) return 1;
  if (mins >= 60) return 0;
  return 1 - mins / 60;
}

function computeScores(
  medicos: Medico[],
  convs: Convocatoria[],
  periodosDias: number,
  pesos: { a: number; v: number; p: number; d: number }
): DocScore[] {
  const cutoff = Date.now() - periodosDias * 864e5;

  return medicos
    .filter(m => m.activo)
    .map(m => {
      const invs = convs
        .filter(c => new Date(c.createdAt).getTime() >= cutoff)
        .flatMap(c => c.invitaciones.filter(i => i.medicoId === m.userId));

      const responded = invs.filter(i => i.estado === "ACEPTO" || i.estado === "RECHAZO");
      const accepted  = invs.filter(i => i.estado === "ACEPTO");

      const aceptacion = responded.length > 0 ? accepted.length / responded.length : 0;

      const responseTimes = responded
        .filter(i => i.sentAt && i.respondedAt)
        .map(i => new Date(i.respondedAt!).getTime() - new Date(i.sentAt!).getTime())
        .filter(ms => ms > 0);
      const avgMs = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : null;
      const velocidad = velNorm(avgMs);

      const asigs = convs.flatMap(c =>
        c.asignaciones.filter(a => a.medicoId === m.userId && a.closedAt)
      );
      const cumplidas   = asigs.filter(a => a.estado === "CUMPLIDA").length;
      const puntualidad = asigs.length > 0 ? cumplidas / asigs.length : 0;

      // Disponibilidad: proxy — turnos nocturnos o fin de semana aceptados
      const nocheFinde = convs.filter(c => {
        const h = new Date(c.inicio).getHours();
        const wd = new Date(c.inicio).getDay();
        return (h >= 20 || h < 7 || wd === 0 || wd === 6) &&
          c.invitaciones.some(i => i.medicoId === m.userId);
      });
      const nocheAcept = nocheFinde.filter(c =>
        c.invitaciones.some(i => i.medicoId === m.userId && i.estado === "ACEPTO")
      );
      const disponibilidad = nocheFinde.length > 0
        ? nocheAcept.length / nocheFinde.length
        : aceptacion;

      const score =
        aceptacion    * pesos.a +
        velocidad     * pesos.v +
        puntualidad   * pesos.p +
        disponibilidad * pesos.d;

      return {
        medico: m,
        invTotal: invs.length,
        aceptacion,
        velocidad,
        puntualidad,
        disponibilidad,
        score,
      };
    });
}

function Pct({ v }: { v: number }) {
  const pct = Math.round(v * 100);
  const rgb = pct >= 70 ? "109,191,60" : pct >= 40 ? "217,119,6" : "220,38,38";
  return (
    <span style={{ color: `rgb(${rgb})`, fontWeight: 600, fontSize: 13 }}>
      {pct}%
    </span>
  );
}

function MiniBar({ v, rgb }: { v: number; rgb: string }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: "var(--border-2)", overflow: "hidden", width: 60 }}>
      <div style={{ height: "100%", width: `${Math.round(v * 100)}%`, background: `rgb(${rgb})`, borderRadius: 2 }} />
    </div>
  );
}

export function ScoringAdmin() {
  const cfg = configStore.get();
  const sc = cfg.scoring;
  const [sort, setSort] = useState<SortKey>("score");
  const [asc, setAsc]   = useState(false);

  const scores = useMemo(() => {
    const medicos = medicosStore.list();
    const convs   = convocatoriaStore.list();
    const pesos = {
      a: sc.pesoAceptacion    / 100,
      v: sc.pesoVelocidad     / 100,
      p: sc.pesoPuntualidad   / 100,
      d: sc.pesoDisponibilidad / 100,
    };
    return computeScores(medicos, convs, sc.periodosDias, pesos);
  }, [sc.periodosDias, sc.pesoAceptacion, sc.pesoVelocidad, sc.pesoPuntualidad, sc.pesoDisponibilidad]);

  const sorted = useMemo(() => {
    const copy = [...scores];
    copy.sort((a, b) => {
      let diff = 0;
      if (sort === "score")       diff = a.score - b.score;
      if (sort === "aceptacion")  diff = a.aceptacion - b.aceptacion;
      if (sort === "velocidad")   diff = a.velocidad - b.velocidad;
      if (sort === "puntualidad") diff = a.puntualidad - b.puntualidad;
      if (sort === "nombre")      diff = a.medico.displayName.localeCompare(b.medico.displayName);
      return asc ? diff : -diff;
    });
    return copy;
  }, [scores, sort, asc]);

  function toggleSort(k: SortKey) {
    if (sort === k) setAsc(a => !a);
    else { setSort(k); setAsc(false); }
  }

  if (!sc.enabled) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
        El scoring est deshabilitado. Activalo en <b>Configuracion &rarr; Scoring</b>.
      </div>
    );
  }

  const colBtn = (k: SortKey, label: string) => (
    <button onClick={() => toggleSort(k)} style={{
      background: "none", border: "none", cursor: "pointer",
      fontWeight: sort === k ? 700 : 600,
      color: sort === k ? "var(--blue)" : "var(--muted)",
      fontSize: 12, padding: "4px 6px",
    }}>
      {label}{sort === k ? (asc ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Config summary */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap",
        padding: "10px 14px", borderRadius: 10,
        background: "var(--surface-2)", border: "1px solid var(--border-2)",
        fontSize: 12.5, color: "var(--muted)",
      }}>
        <span>Periodo: <b style={{ color: "var(--text)" }}>{sc.periodosDias} dias</b></span>
        <span style={{ color: "var(--border)" }}>|</span>
        <span>Aceptacion <b style={{ color: "var(--text)" }}>{sc.pesoAceptacion}%</b></span>
        <span>Velocidad <b style={{ color: "var(--text)" }}>{sc.pesoVelocidad}%</b></span>
        <span>Puntualidad <b style={{ color: "var(--text)" }}>{sc.pesoPuntualidad}%</b></span>
        <span>Disponibilidad <b style={{ color: "var(--text)" }}>{sc.pesoDisponibilidad}%</b></span>
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 80px 80px 80px 80px 90px",
          padding: "8px 14px",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border-2)",
          alignItems: "center",
        }}>
          {colBtn("nombre",      "Medico")}
          {colBtn("aceptacion",  "Acept.")}
          {colBtn("velocidad",   "Veloc.")}
          {colBtn("puntualidad", "Puntual.")}
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", padding: "4px 6px" }}>Dispon.</span>
          {colBtn("score",       "Score")}
        </div>

        {sorted.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--subtle)", fontSize: 13 }}>
            Sin medicos activos en el sistema.
          </div>
        )}

        {sorted.map((ds, i) => {
          const scoreNum = Math.round(ds.score * 100);
          const scoreRgb = scoreNum >= 70 ? "109,191,60" : scoreNum >= 40 ? "217,119,6" : "220,38,38";
          return (
            <div key={ds.medico.userId} style={{
              display: "grid",
              gridTemplateColumns: "2fr 80px 80px 80px 80px 90px",
              padding: "10px 14px",
              borderBottom: i < sorted.length - 1 ? "1px solid var(--border-2)" : "none",
              alignItems: "center",
              background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <DoctorAvatar medico={ds.medico} size={32} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{ds.medico.displayName}</div>
                  <div style={{ fontSize: 11, color: "var(--subtle)" }}>
                    {ds.invTotal} inv · {ds.medico.tipo}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "center" }}>
                <Pct v={ds.aceptacion} />
                <MiniBar v={ds.aceptacion} rgb="109,191,60" />
              </div>
              <div style={{ textAlign: "center" }}>
                <Pct v={ds.velocidad} />
                <MiniBar v={ds.velocidad} rgb="21,101,192" />
              </div>
              <div style={{ textAlign: "center" }}>
                <Pct v={ds.puntualidad} />
                <MiniBar v={ds.puntualidad} rgb="217,119,6" />
              </div>
              <div style={{ textAlign: "center" }}>
                <Pct v={ds.disponibilidad} />
                <MiniBar v={ds.disponibilidad} rgb="156,39,176" />
              </div>

              <div style={{ textAlign: "center" }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 48, height: 28, borderRadius: 8,
                  background: `rgba(${scoreRgb}, 0.12)`,
                  border: `1px solid rgba(${scoreRgb}, 0.25)`,
                  fontWeight: 800, fontSize: 14, color: `rgb(${scoreRgb})`,
                }}>
                  {scoreNum}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
