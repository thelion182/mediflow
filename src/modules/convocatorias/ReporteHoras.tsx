import React, { useMemo, useState } from "react";
import { toLocalDateTimeInputValue, minutesFromNow } from "../../core/date";
import { convocatoriaStore } from "./convocatoria.store";
import { medicosStore } from "../admin/medicos.store";
import { AppShell } from "../../ui/AppShell";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReporteHoras() {
  const [from, setFrom] = useState(toLocalDateTimeInputValue(minutesFromNow(-7 * 24 * 60)));
  const [to, setTo] = useState(toLocalDateTimeInputValue(minutesFromNow(0)));

  // Mapa de nombres desde catálogo
  const medicoNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of medicosStore.list()) map.set(m.userId, m.displayName);
    return map;
  }, []);

  const medicoName = (medicoId: string) => medicoNameMap.get(medicoId) ?? medicoId;

  const rows = useMemo(() => {
    return convocatoriaStore.buildHorasReport({
      fromIso: new Date(from).toISOString(),
      toIso: new Date(to).toISOString()
    });
  }, [from, to]);

  const totales = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.medicoId] = (map[r.medicoId] ?? 0) + r.horas;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function exportar() {
    const header = ["medicoId","medicoNombre","sector","sede","inicio","fin","estado","horas","convocatoriaId"];
    const lines = [header.join(",")];

    for (const r of rows) {
      const line = [
        r.medicoId,
        medicoName(r.medicoId),
        r.sector,
        r.sede ?? "",
        r.inicio,
        r.fin,
        r.estado,
        String(r.horas),
        r.convocatoriaId
      ]
        .map(v => `"${String(v).replaceAll('"', '""')}"`)
        .join(",");
      lines.push(line);
    }

    downloadCsv(
      `mediflow_reporte_horas_${new Date().toISOString().slice(0, 10)}.csv`,
      lines.join("\n")
    );
  }

  return (
    <AppShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Reporte de horas</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Incluye solo asignaciones cerradas (Cumplida / No cumplida).</p>
        </div>
        <button className="btnGhost" onClick={exportar}>Exportar CSV</button>
      </div>

      <div className="grid">
        <div className="panel half">
            <h3 style={{ margin: 0, fontSize: 14 }}>Rango</h3>
            <div className="field">
              <label className="label">Desde</label>
              <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Hasta</label>
              <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="pill" style={{ marginTop: 10 }}>Filas: {rows.length}</div>
          </div>

          <div className="panel half">
            <h3 style={{ margin: 0, fontSize: 14 }}>Totales por médico</h3>
            {totales.length === 0 ? (
              <p className="sub" style={{ marginTop: 10 }}>No hay cierres en el rango seleccionado.</p>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {totales.map(([medicoId, horas]) => (
                  <div key={medicoId} className="btnGhost" style={{ padding: 10 }}>
                    <div className="row">
                      <b>{medicoName(medicoId)}</b>
                      <span className="pill">{Math.round(horas * 100) / 100} h</span>
                    </div>
                    <div className="sub" style={{ marginTop: 6 }}>{medicoId}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h3 style={{ margin: 0, fontSize: 14 }}>Detalle</h3>
            {rows.length === 0 ? (
              <p className="sub" style={{ marginTop: 10 }}>Sin datos.</p>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {rows.map((r, idx) => (
                  <div key={idx} className="btnGhost" style={{ padding: 12 }}>
                    <div className="row" style={{ gap: 10 }}>
                      <b>{medicoName(r.medicoId)}</b>
                      <span className="pill">{r.estado}</span>
                      <span className="pill">{r.horas} h</span>
                    </div>
                    <div className="sub" style={{ marginTop: 6 }}>
                      {r.sector}{r.sede ? ` · ${r.sede}` : ""} · {new Date(r.inicio).toLocaleString()} → {new Date(r.fin).toLocaleString()}
                    </div>
                    <div className="sub" style={{ marginTop: 6 }}>Convocatoria: {r.convocatoriaId}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </div>
    </AppShell>
  );
}
