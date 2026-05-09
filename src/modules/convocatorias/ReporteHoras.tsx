import React, { useMemo, useRef, useState } from "react";
import { toLocalDateTimeInputValue, minutesFromNow } from "../../core/date";
import { convocatoriaStore } from "./convocatoria.store";
import { medicosStore } from "../admin/medicos.store";
import { AppShell } from "../../ui/AppShell";
import { parseCsv } from "../../core/csv";
import type { Convocatoria, Invitacion } from "./convocatoria.types";

type TabReporte = "hechas" | "aceptadas" | "rechazadas" | "horas" | "marcas";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers de formato ────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-UY", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function fmtHour(iso: string) {
  return new Date(iso).toLocaleString("es-UY", { hour: "2-digit", minute: "2-digit" });
}
function hoursBetween(a: string, b: string) {
  return Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 36e5 * 10) / 10;
}

// ── EstadoConvBadge ────────────────────────────────────────────────────────
const CONV_COLORS: Record<string, string> = {
  CUBIERTA:   "22,163,74",
  PARCIAL:    "217,119,6",
  ENVIADA:    "21,101,192",
  BORRADOR:   "100,116,139",
  VENCIDA:    "220,38,38",
  CANCELADA:  "220,38,38",
};
function ConvBadge({ estado }: { estado: string }) {
  const rgb = CONV_COLORS[estado] ?? "100,116,139";
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
      border: `1px solid rgba(${rgb},0.25)`, whiteSpace: "nowrap",
    }}>{estado}</span>
  );
}

// ── Tabla compartida de convocatorias ─────────────────────────────────────
function ConvTable({
  convs, medicoName, extraCol,
}: {
  convs: Convocatoria[];
  medicoName: (id: string) => string;
  extraCol?: (c: Convocatoria) => React.ReactNode;
}) {
  if (convs.length === 0) {
    return (
      <p style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
        Sin datos para el rango y filtro seleccionados.
      </p>
    );
  }

  const cols = extraCol
    ? "2fr 1.4fr 1.2fr 1fr 80px 90px 1.5fr"
    : "2fr 1.4fr 1.2fr 1fr 80px 90px";

  const hdr: React.CSSProperties = {
    display: "grid", gridTemplateColumns: cols,
    padding: "8px 14px", background: "var(--surface-2)",
    fontSize: 11, fontWeight: 700, color: "var(--subtle)",
    textTransform: "uppercase", letterSpacing: "0.05em",
    borderBottom: "1px solid var(--border-2)",
  };

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-2)" }}>
      <div style={hdr}>
        <div>Sector / Sede</div>
        <div>Turno</div>
        <div>Estado</div>
        <div>Cupos</div>
        <div>Horas</div>
        <div>Inv / Asig</div>
        {extraCol && <div>Detalle</div>}
      </div>
      {convs.map((c, i) => {
        const confirmadas = (c.asignaciones ?? []).filter(a =>
          ["CONFIRMADA","CUMPLIDA"].includes(a.estado)
        ).length;
        const rechazos = (c.invitaciones ?? []).filter(i => i.estado === "RECHAZO").length;
        const horas = hoursBetween(c.inicio, c.fin);

        return (
          <div key={c.id} style={{
            display: "grid", gridTemplateColumns: cols,
            padding: "11px 14px", fontSize: 12.5,
            background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
            borderTop: "1px solid var(--border-2)",
            alignItems: "center", gap: 4,
          }}>
            {/* Sector / Sede */}
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)" }}>{c.sector}</div>
              {c.sede && <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>{c.sede}</div>}
            </div>

            {/* Turno */}
            <div style={{ color: "var(--muted)", lineHeight: 1.4 }}>
              <div>{fmtDate(c.inicio)}</div>
              <div style={{ fontSize: 11, color: "var(--subtle)" }}>
                {fmtHour(c.inicio)} → {fmtHour(c.fin)}
              </div>
            </div>

            {/* Estado */}
            <div><ConvBadge estado={c.estado} /></div>

            {/* Cupos: confirmados/total */}
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: confirmadas > 0 ? "rgb(22,163,74)" : "var(--text)" }}>
                {confirmadas}
              </span>
              <span style={{ color: "var(--subtle)" }}> / {c.cupos}</span>
              {rechazos > 0 && (
                <div style={{ fontSize: 10.5, color: "rgb(220,38,38)", marginTop: 1 }}>{rechazos} rechazo{rechazos > 1 ? "s" : ""}</div>
              )}
            </div>

            {/* Horas */}
            <div style={{ fontWeight: 600, color: "var(--blue)" }}>{horas}h</div>

            {/* Inv / Asig conteo */}
            <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              <div>{(c.invitaciones ?? []).length} inv.</div>
              <div>{(c.asignaciones ?? []).length} asig.</div>
            </div>

            {/* Extra col */}
            {extraCol && <div>{extraCol(c)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Convocatorias Hechas ─────────────────────────────────────────────
function TabHechas({ convs, medicoName }: { convs: Convocatoria[]; medicoName: (id: string) => string }) {
  function exportar() {
    const h = ["Sector","Sede","Inicio","Fin","Estado","Cupos","Confirmadas","Rechazos","Invitados","Horas","CreadoPor","CreadoEn"];
    const lines = [h.join(",")];
    for (const c of convs) {
      const conf = (c.asignaciones ?? []).filter(a => ["CONFIRMADA","CUMPLIDA"].includes(a.estado)).length;
      const rech = (c.invitaciones ?? []).filter(i => i.estado === "RECHAZO").length;
      lines.push([
        c.sector, c.sede ?? "", fmtDateTime(c.inicio), fmtDateTime(c.fin),
        c.estado, c.cupos, conf, rech, (c.invitaciones ?? []).length,
        hoursBetween(c.inicio, c.fin), c.createdBy, fmtDateTime(c.createdAt),
      ].map(v => `"${String(v).replaceAll('"','""')}"`).join(","));
    }
    downloadCsv(`mediflow_hechas_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{convs.length} convocatoria{convs.length !== 1 ? "s" : ""}</span>
        <button className="btnGhost" onClick={exportar} style={{ fontSize: 12 }}>Exportar CSV</button>
      </div>
      <ConvTable convs={convs} medicoName={medicoName} />
    </div>
  );
}

// ── Tab: Convocatorias Aceptadas ──────────────────────────────────────────
function TabAceptadas({ convs, medicoName }: { convs: Convocatoria[]; medicoName: (id: string) => string }) {
  // Filas: una por asignación confirmada/cumplida
  const rows = useMemo(() => {
    const out: Array<{ conv: Convocatoria; medicoId: string; estado: string; createdAt: string; horas: number }> = [];
    for (const c of convs) {
      for (const a of c.asignaciones ?? []) {
        if (!["CONFIRMADA","CUMPLIDA"].includes(a.estado)) continue;
        out.push({
          conv: c,
          medicoId: a.medicoId,
          estado: a.estado,
          createdAt: a.createdAt,
          horas: typeof a.horas === "number" ? a.horas : hoursBetween(c.inicio, c.fin),
        });
      }
    }
    return out.sort((a, b) => new Date(b.conv.inicio).getTime() - new Date(a.conv.inicio).getTime());
  }, [convs]);

  function exportar() {
    const h = ["Médico","ID Médico","Sector","Sede","Inicio","Fin","Estado","Horas","AceptadoEn"];
    const lines = [h.join(",")];
    for (const r of rows) {
      lines.push([
        medicoName(r.medicoId), r.medicoId, r.conv.sector, r.conv.sede ?? "",
        fmtDateTime(r.conv.inicio), fmtDateTime(r.conv.fin),
        r.estado, r.horas, fmtDateTime(r.createdAt),
      ].map(v => `"${String(v).replaceAll('"','""')}"`).join(","));
    }
    downloadCsv(`mediflow_aceptadas_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));
  }

  if (rows.length === 0) {
    return <p style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Sin aceptaciones en el período.</p>;
  }

  const cols = "2fr 1.6fr 1.4fr 1.2fr 80px 100px";
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{rows.length} aceptación{rows.length !== 1 ? "es" : ""}</span>
        <button className="btnGhost" onClick={exportar} style={{ fontSize: 12 }}>Exportar CSV</button>
      </div>
      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-2)" }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: cols,
          padding: "8px 14px", background: "var(--surface-2)",
          fontSize: 11, fontWeight: 700, color: "var(--subtle)",
          textTransform: "uppercase", letterSpacing: "0.05em",
          borderBottom: "1px solid var(--border-2)",
        }}>
          <div>Médico</div><div>Sector / Sede</div><div>Turno</div>
          <div>Estado asig.</div><div>Horas</div><div>Aceptado</div>
        </div>

        {rows.map((r, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: cols,
            padding: "10px 14px", fontSize: 12.5,
            background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
            borderTop: "1px solid var(--border-2)", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)" }}>{medicoName(r.medicoId)}</div>
              <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>{r.medicoId}</div>
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.4 }}>
              <div>{r.conv.sector}</div>
              {r.conv.sede && <div style={{ fontSize: 11, color: "var(--subtle)" }}>{r.conv.sede}</div>}
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.4 }}>
              <div>{fmtDate(r.conv.inicio)}</div>
              <div style={{ fontSize: 11, color: "var(--subtle)" }}>{fmtHour(r.conv.inicio)} → {fmtHour(r.conv.fin)}</div>
            </div>
            <div>
              <span style={{
                padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: r.estado === "CUMPLIDA" ? "rgba(22,163,74,0.12)" : "rgba(21,101,192,0.12)",
                color: r.estado === "CUMPLIDA" ? "rgb(22,163,74)" : "rgb(21,101,192)",
                border: `1px solid ${r.estado === "CUMPLIDA" ? "rgba(22,163,74,0.25)" : "rgba(21,101,192,0.25)"}`,
              }}>{r.estado}</span>
            </div>
            <div style={{ fontWeight: 700, color: "var(--blue)" }}>{r.horas}h</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{fmtDateTime(r.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Convocatorias Rechazadas ─────────────────────────────────────────
function TabRechazadas({ convs, medicoName }: { convs: Convocatoria[]; medicoName: (id: string) => string }) {
  // Filas: una por rechazo (invitación con estado RECHAZO)
  const rows = useMemo(() => {
    const out: Array<{ conv: Convocatoria; inv: Invitacion }> = [];
    for (const c of convs) {
      for (const inv of c.invitaciones ?? []) {
        if (inv.estado !== "RECHAZO") continue;
        out.push({ conv: c, inv });
      }
    }
    return out.sort((a, b) => new Date(b.conv.inicio).getTime() - new Date(a.conv.inicio).getTime());
  }, [convs]);

  function exportar() {
    const h = ["Médico","ID Médico","Sector","Sede","Inicio","Fin","Canal","RechazadoEn","EstadoConv"];
    const lines = [h.join(",")];
    for (const r of rows) {
      lines.push([
        medicoName(r.inv.medicoId), r.inv.medicoId, r.conv.sector, r.conv.sede ?? "",
        fmtDateTime(r.conv.inicio), fmtDateTime(r.conv.fin), r.inv.canal,
        r.inv.respondedAt ? fmtDateTime(r.inv.respondedAt) : "", r.conv.estado,
      ].map(v => `"${String(v).replaceAll('"','""')}"`).join(","));
    }
    downloadCsv(`mediflow_rechazadas_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));
  }

  if (rows.length === 0) {
    return <p style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Sin rechazos en el período.</p>;
  }

  const cols = "2fr 1.6fr 1.4fr 1.2fr 80px 100px";
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{rows.length} rechazo{rows.length !== 1 ? "s" : ""}</span>
        <button className="btnGhost" onClick={exportar} style={{ fontSize: 12 }}>Exportar CSV</button>
      </div>
      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-2)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: cols,
          padding: "8px 14px", background: "var(--surface-2)",
          fontSize: 11, fontWeight: 700, color: "var(--subtle)",
          textTransform: "uppercase", letterSpacing: "0.05em",
          borderBottom: "1px solid var(--border-2)",
        }}>
          <div>Médico</div><div>Sector / Sede</div><div>Turno</div>
          <div>Canal</div><div>Horas</div><div>Rechazó</div>
        </div>

        {rows.map((r, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: cols,
            padding: "10px 14px", fontSize: 12.5,
            background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
            borderTop: "1px solid var(--border-2)", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)" }}>{medicoName(r.inv.medicoId)}</div>
              <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>{r.inv.medicoId}</div>
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.4 }}>
              <div>{r.conv.sector}</div>
              {r.conv.sede && <div style={{ fontSize: 11, color: "var(--subtle)" }}>{r.conv.sede}</div>}
            </div>
            <div style={{ color: "var(--muted)", lineHeight: 1.4 }}>
              <div>{fmtDate(r.conv.inicio)}</div>
              <div style={{ fontSize: 11, color: "var(--subtle)" }}>{fmtHour(r.conv.inicio)} → {fmtHour(r.conv.fin)}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.inv.canal}</div>
            <div style={{ fontWeight: 600, color: "var(--muted)" }}>{hoursBetween(r.conv.inicio, r.conv.fin)}h</div>
            <div style={{ fontSize: 11.5, color: "rgb(220,38,38)" }}>
              {r.inv.respondedAt ? fmtDateTime(r.inv.respondedAt) : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Horas trabajadas ─────────────────────────────────────────────────
function TabHoras({ medicoName }: { medicoName: (id: string) => string }) {
  const [from, setFrom] = useState(toLocalDateTimeInputValue(minutesFromNow(-7 * 24 * 60)));
  const [to,   setTo]   = useState(toLocalDateTimeInputValue(minutesFromNow(0)));

  // Incluye CONFIRMADA, CUMPLIDA y NO_CUMPLIDA para mostrar datos útiles
  const rows = useMemo(() => {
    const all = convocatoriaStore.list();
    const f = new Date(from).getTime();
    const t = new Date(to).getTime();
    const out: Array<{
      convId: string; sector: string; sede?: string;
      inicio: string; fin: string; medicoId: string; estado: string; horas: number;
    }> = [];

    for (const c of all) {
      const start = new Date(c.inicio).getTime();
      if (start < f || start > t) continue;
      for (const a of c.asignaciones ?? []) {
        if (!["CONFIRMADA","CUMPLIDA","NO_CUMPLIDA"].includes(a.estado)) continue;
        out.push({
          convId: c.id, sector: c.sector, sede: c.sede,
          inicio: c.inicio, fin: c.fin, medicoId: a.medicoId, estado: a.estado,
          horas: typeof a.horas === "number" ? a.horas : hoursBetween(c.inicio, c.fin),
        });
      }
    }
    return out.sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
  }, [from, to]);

  const totales = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (r.estado !== "NO_CUMPLIDA") map[r.medicoId] = (map[r.medicoId] ?? 0) + r.horas;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function exportar() {
    const h = ["Médico","ID","Sector","Sede","Inicio","Fin","Estado","Horas"];
    const lines = [h.join(",")];
    for (const r of rows) {
      lines.push([
        medicoName(r.medicoId), r.medicoId, r.sector, r.sede ?? "",
        fmtDateTime(r.inicio), fmtDateTime(r.fin), r.estado, r.horas,
      ].map(v => `"${String(v).replaceAll('"','""')}"`).join(","));
    }
    downloadCsv(`mediflow_horas_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Filtro */}
        <div style={panelStyle}>
          <h3 style={h3Style}>Rango de fechas</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div>
              <label style={labelStyle}>Desde</label>
              <input className="input" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Hasta</label>
              <input className="input" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{rows.length} registros</span>
            <button className="btnGhost" onClick={exportar} style={{ fontSize: 12 }}>Exportar CSV</button>
          </div>
        </div>

        {/* Totales por médico */}
        <div style={panelStyle}>
          <h3 style={h3Style}>Totales por médico</h3>
          {totales.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Sin datos en el rango.</p>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {totales.map(([medicoId, horas]) => (
                <div key={medicoId} style={rowStyle}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{medicoName(medicoId)}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{medicoId}</div>
                  </div>
                  <span style={{
                    padding: "3px 10px", borderRadius: 8,
                    background: "var(--blue-tint)", color: "var(--blue)",
                    fontWeight: 700, fontSize: 13,
                  }}>{Math.round(horas * 10) / 10} h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detalle */}
      {rows.length > 0 && (
        <div style={panelStyle}>
          <h3 style={h3Style}>Detalle de asignaciones</h3>
          <div style={{ marginTop: 12, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-2)" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.4fr 1.2fr 1.2fr 80px",
              padding: "7px 12px", background: "var(--surface-2)",
              fontSize: 11, fontWeight: 700, color: "var(--subtle)",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <div>Médico</div><div>Sector / Sede</div><div>Inicio</div><div>Fin</div><div>Horas</div>
            </div>
            {rows.map((r, idx) => (
              <div key={idx} style={{
                display: "grid", gridTemplateColumns: "2fr 1.4fr 1.2fr 1.2fr 80px",
                padding: "9px 12px", fontSize: 12.5,
                background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                borderTop: "1px solid var(--border-2)", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{medicoName(r.medicoId)}</div>
                  <div style={{ fontSize: 11, color: "var(--subtle)" }}>{r.estado}</div>
                </div>
                <div style={{ color: "var(--muted)" }}>{r.sector}{r.sede ? ` · ${r.sede}` : ""}</div>
                <div style={{ color: "var(--muted)" }}>{fmtDateTime(r.inicio)}</div>
                <div style={{ color: "var(--muted)" }}>{fmtDateTime(r.fin)}</div>
                <div style={{ fontWeight: 700, color: r.estado === "NO_CUMPLIDA" ? "rgb(220,38,38)" : "var(--blue)" }}>
                  {r.horas}h
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Marcas de asistencia ─────────────────────────────────────────────
interface Marca {
  funcionario: string;
  fechaHora: Date;
  tipo: "E" | "S" | "?";
}

interface VerificacionRow {
  medicoId:      string;
  medicoNombre:  string;
  sector:        string;
  sede:          string;
  inicio:        Date;
  fin:           Date;
  estado:        "CUMPLIDA" | "PENDIENTE" | "SIN_MARCA";
  marcaEntrada:  string | null;
  marcaSalida:   string | null;
  diffMinEntrada: number | null;
}

function parseMarcas(csv: string): { marcas: Marca[]; errores: number } {
  const { rows } = parseCsv(csv);
  const marcas: Marca[] = [];
  let errores = 0;
  for (const r of rows) {
    const func = String(r.funcionario ?? r.funcion ?? r.func ?? r.id ?? r.ID ?? "").trim();
    const dtRaw = String(r.fecha_hora ?? r.fechahora ?? r.datetime ?? r.fecha ?? r.timestamp ?? "").trim();
    const tipoRaw = String(r.tipo ?? r.type ?? r.event ?? "").trim().toUpperCase();
    if (!func || !dtRaw) { errores++; continue; }
    const dt = new Date(dtRaw);
    if (isNaN(dt.getTime())) { errores++; continue; }
    marcas.push({
      funcionario: func,
      fechaHora: dt,
      tipo: tipoRaw.startsWith("E") || tipoRaw === "1" ? "E"
          : tipoRaw.startsWith("S") || tipoRaw === "2" ? "S" : "?",
    });
  }
  return { marcas, errores };
}

function TabMarcas({ medicoName, medicos, medicoMap }: {
  medicoName: (id: string) => string;
  medicos: any[];
  medicoMap: Map<string, string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText]   = useState("");
  const [margen, setMargen]     = useState(30);
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
  const [to,   setTo]   = useState(() => new Date().toISOString().slice(0, 10));
  const [parsed, setParsed] = useState<{ marcas: Marca[]; errores: number } | null>(null);

  const convs = useMemo(() => convocatoriaStore.list(), []);

  function cargarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(String(ev.target?.result ?? ""));
    reader.readAsText(f);
  }

  const convsFiltradas = useMemo(() => {
    const f = new Date(from + "T00:00:00").getTime();
    const t = new Date(to   + "T23:59:59").getTime();
    return convs.filter(c => {
      const ts = new Date(c.inicio).getTime();
      return ts >= f && ts <= t;
    });
  }, [convs, from, to]);

  const verificacion = useMemo((): VerificacionRow[] => {
    if (!parsed) return [];
    const margenMs = margen * 60_000;
    const funcToMedico = new Map<string, string>();
    for (const m of medicos) {
      if (m.funcionario) funcToMedico.set(String(m.funcionario).trim(), m.userId);
      if (m.cedula)      funcToMedico.set(String(m.cedula).trim(), m.userId);
      funcToMedico.set(m.userId, m.userId);
    }

    const rows: VerificacionRow[] = [];
    for (const c of convsFiltradas) {
      for (const asig of c.asignaciones ?? []) {
        if (!["CONFIRMADA","CUMPLIDA","NO_CUMPLIDA"].includes(asig.estado)) continue;
        const medico = medicos.find(m => m.userId === asig.medicoId);
        const candidatos: string[] = [asig.medicoId];
        if (medico?.funcionario) candidatos.push(String(medico.funcionario).trim());
        if (medico?.cedula)      candidatos.push(String(medico.cedula).trim());

        const inicio = new Date(c.inicio);
        const fin    = new Date(c.fin);
        const marcasMedico = parsed.marcas.filter(mk =>
          candidatos.includes(mk.funcionario) &&
          mk.fechaHora.getTime() >= inicio.getTime() - margenMs &&
          mk.fechaHora.getTime() <= fin.getTime() + margenMs
        ).sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());

        const entrada = marcasMedico.find(m => m.tipo === "E") ?? marcasMedico[0] ?? null;
        const salida  = marcasMedico.filter(m => m.tipo === "S").at(-1) ?? null;
        const diffMin = entrada ? Math.round((entrada.fechaHora.getTime() - inicio.getTime()) / 60_000) : null;

        rows.push({
          medicoId:    asig.medicoId,
          medicoNombre: medicoMap.get(asig.medicoId) ?? asig.medicoId,
          sector: c.sector, sede: c.sede ?? "",
          inicio, fin,
          estado: entrada ? (asig.estado === "CUMPLIDA" ? "CUMPLIDA" : "PENDIENTE") : "SIN_MARCA",
          marcaEntrada: entrada ? entrada.fechaHora.toLocaleString("es-UY") : null,
          marcaSalida:  salida  ? salida.fechaHora.toLocaleString("es-UY")  : null,
          diffMinEntrada: diffMin,
        });
      }
    }
    return rows.sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
  }, [parsed, convsFiltradas, medicos, medicoMap, margen]);

  const stats = {
    total:    verificacion.length,
    verif:    verificacion.filter(r => r.estado === "CUMPLIDA").length,
    conMarca: verificacion.filter(r => r.estado === "PENDIENTE").length,
    sinMarca: verificacion.filter(r => r.estado === "SIN_MARCA").length,
  };

  function exportarVerif() {
    const h = ["Médico","ID","Sector","Sede","Inicio","Fin","Estado","Marca Entrada","Marca Salida","Diff min"];
    const lines = [h.join(",")];
    for (const r of verificacion) {
      lines.push([
        r.medicoNombre, r.medicoId, r.sector, r.sede,
        r.inicio.toISOString(), r.fin.toISOString(), r.estado,
        r.marcaEntrada ?? "", r.marcaSalida ?? "", String(r.diffMinEntrada ?? ""),
      ].map(v => `"${String(v).replaceAll('"','""')}"`).join(","));
    }
    downloadCsv(`mediflow_marcas_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Cargar CSV */}
        <div style={panelStyle}>
          <h3 style={h3Style}>Cargar marcas del reloj</h3>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 12px" }}>
            CSV: <code style={{ fontFamily: "monospace", fontSize: 12 }}>funcionario, fecha_hora, tipo</code>
            <br />Tipo: <b>E</b> = entrada · <b>S</b> = salida
          </p>
          <button className="btnGhost" onClick={() => fileRef.current?.click()} style={{ fontSize: 12 }}>
            Subir archivo CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={cargarArchivo} />
          <textarea
            style={{
              width: "100%", marginTop: 10, minHeight: 90, padding: "8px 10px",
              borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)",
              fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box",
            }}
            placeholder={"funcionario,fecha_hora,tipo\n93598,2026-05-09 08:02,E\n93598,2026-05-09 20:15,S"}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
          />
          {parsed && (
            <div style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0" }}>
              {parsed.marcas.length} marcas · {parsed.errores} filas ignoradas
            </div>
          )}
          <button className="btn" onClick={() => setParsed(parseMarcas(csvText))}
            style={{ marginTop: 8, fontSize: 13 }} disabled={!csvText.trim()}>
            Procesar marcas
          </button>
        </div>

        {/* Parámetros */}
        <div style={panelStyle}>
          <h3 style={h3Style}>Parámetros de cruce</h3>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div>
              <label style={labelStyle}>Período (inicio de convocatorias)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                <input className="input" type="date" value={to}   onChange={e => setTo(e.target.value)}   />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Tolerancia (minutos)</label>
              <input className="input" type="number" min={0} max={120} value={margen}
                onChange={e => setMargen(Number(e.target.value))} />
              <p style={{ fontSize: 11.5, color: "var(--subtle)", margin: "4px 0 0" }}>
                Válida si está dentro de ±{margen} min del turno.
              </p>
            </div>
          </div>
          {parsed && (
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Total turnos",   n: stats.total,    rgb: "100,116,139" },
                { label: "Verificados",    n: stats.verif,    rgb: "22,163,74"   },
                { label: "Con marca",      n: stats.conMarca, rgb: "217,119,6"   },
                { label: "Sin marca",      n: stats.sinMarca, rgb: "220,38,38"   },
              ].map(s => (
                <div key={s.label} style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: `rgba(${s.rgb},0.08)`, border: `1px solid rgba(${s.rgb},0.20)`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: `rgb(${s.rgb})` }}>{s.n}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {verificacion.length > 0 && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ ...h3Style, margin: 0 }}>Resultados de verificación</h3>
            <button className="btnGhost" onClick={exportarVerif} style={{ fontSize: 12 }}>Exportar CSV</button>
          </div>
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-2)" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr 1fr",
              padding: "7px 12px", background: "var(--surface-2)",
              fontSize: 11, fontWeight: 700, color: "var(--subtle)",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <div>Médico</div><div>Turno</div><div>Sede / Sector</div>
              <div>Entrada</div><div>Salida</div><div>Estado</div>
            </div>
            {verificacion.map((r, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr 1fr",
                padding: "10px 12px",
                background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                borderTop: "1px solid var(--border-2)", alignItems: "center", fontSize: 12.5,
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{r.medicoNombre}</div>
                  <div style={{ fontSize: 11, color: "var(--subtle)" }}>{r.medicoId}</div>
                </div>
                <div style={{ color: "var(--muted)", lineHeight: 1.4 }}>
                  <div>{fmtDate(r.inicio.toISOString())}</div>
                  <div style={{ fontSize: 11, color: "var(--subtle)" }}>{fmtHour(r.inicio.toISOString())} → {fmtHour(r.fin.toISOString())}</div>
                </div>
                <div style={{ color: "var(--muted)" }}>
                  <div>{r.sector}</div>
                  {r.sede && <div style={{ fontSize: 11, color: "var(--subtle)" }}>{r.sede}</div>}
                </div>
                <div style={{ fontSize: 12 }}>
                  {r.marcaEntrada ? (
                    <>
                      <div style={{ color: "var(--text)" }}>{r.marcaEntrada}</div>
                      {r.diffMinEntrada !== null && (
                        <div style={{ fontSize: 11, color: r.diffMinEntrada > 15 ? "rgb(220,38,38)" : "rgb(22,163,74)" }}>
                          {r.diffMinEntrada > 0 ? `+${r.diffMinEntrada}` : r.diffMinEntrada} min
                        </div>
                      )}
                    </>
                  ) : <span style={{ color: "var(--subtle)" }}>—</span>}
                </div>
                <div style={{ fontSize: 12, color: r.marcaSalida ? "var(--text)" : "var(--subtle)" }}>
                  {r.marcaSalida ?? "—"}
                </div>
                <div>
                  {(() => {
                    const map: Record<string, { rgb: string; label: string }> = {
                      CUMPLIDA: { rgb: "22,163,74", label: "Verificado" },
                      PENDIENTE:{ rgb: "217,119,6", label: "Con marca"  },
                      SIN_MARCA:{ rgb: "220,38,38", label: "Sin marca"  },
                    };
                    const { rgb, label } = map[r.estado] ?? map.SIN_MARCA;
                    return (
                      <span style={{
                        padding: "3px 9px", borderRadius: 20,
                        background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
                        border: `1px solid rgba(${rgb},0.25)`,
                        fontSize: 11, fontWeight: 700,
                      }}>{label}</span>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!parsed && (
        <div style={{ textAlign: "center", padding: "32px 20px", border: "1px solid var(--border)", borderRadius: 14, color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🕐</div>
          <p style={{ margin: 0, fontSize: 13 }}>Cargá el CSV del reloj biométrico y presioná <b>Procesar marcas</b></p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--subtle)" }}>Soporta relojes faciales, de tarjeta o huella.</p>
        </div>
      )}
    </div>
  );
}

// ── Main ReporteHoras ─────────────────────────────────────────────────────
export function ReporteHoras() {
  const [tab, setTab] = useState<TabReporte>("hechas");

  // Filtro de fecha compartido para las 3 tabs de convocatorias
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to,   setTo]   = useState(today);

  const medicos    = useMemo(() => medicosStore.list(), []);
  const medicoMap  = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of medicos) map.set(m.userId, m.displayName);
    return map;
  }, [medicos]);
  const medicoName = (id: string) => medicoMap.get(id) ?? id;

  const allConvs = useMemo(() => convocatoriaStore.list(), []);

  const convsFiltradas = useMemo(() => {
    const f = new Date(from + "T00:00:00").getTime();
    const t = new Date(to   + "T23:59:59").getTime();
    return allConvs
      .filter(c => {
        const ts = new Date(c.inicio).getTime();
        return ts >= f && ts <= t;
      })
      .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
  }, [allConvs, from, to]);

  const convsConRechazo = useMemo(() =>
    convsFiltradas.filter(c => (c.invitaciones ?? []).some(i => i.estado === "RECHAZO")),
  [convsFiltradas]);

  const convsConAceptacion = useMemo(() =>
    convsFiltradas.filter(c => (c.asignaciones ?? []).some(a => ["CONFIRMADA","CUMPLIDA"].includes(a.estado))),
  [convsFiltradas]);

  const TABS: { key: TabReporte; label: string; count?: number }[] = [
    { key: "hechas",     label: "Convocatorias hechas",     count: convsFiltradas.length },
    { key: "aceptadas",  label: "Aceptadas",                count: convsConAceptacion.length },
    { key: "rechazadas", label: "Rechazadas",               count: convsConRechazo.length },
    { key: "horas",      label: "Horas trabajadas" },
    { key: "marcas",     label: "Marcas de asistencia" },
  ];

  const isConvTab = ["hechas","aceptadas","rechazadas"].includes(tab);

  return (
    <AppShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Reportes</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Convocatorias, horas trabajadas y verificación biométrica.
          </p>
        </div>

        {/* Filtro de fecha compartido para tabs de convocatorias */}
        {isConvTab && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Período:</label>
            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ width: 140, fontSize: 13 }} />
            <span style={{ color: "var(--subtle)", fontSize: 13 }}>→</span>
            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ width: 140, fontSize: 13 }} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: "8px 8px 0 0",
            border: "1px solid var(--border)",
            borderBottom: tab === t.key ? "2px solid var(--blue)" : "1px solid var(--border)",
            background: tab === t.key ? "var(--blue-tint)" : "var(--surface)",
            color: tab === t.key ? "var(--blue)" : "var(--muted)",
            fontWeight: tab === t.key ? 700 : 500,
            fontSize: 13.5, cursor: "pointer", marginBottom: -1,
            transition: "all 0.12s",
          }}>
            {t.label}
            {t.count !== undefined && (
              <span style={{
                padding: "1px 7px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: tab === t.key ? "rgba(21,101,192,0.15)" : "var(--surface-2)",
                color: tab === t.key ? "var(--blue)" : "var(--subtle)",
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "hechas"     && <TabHechas     convs={convsFiltradas}       medicoName={medicoName} />}
      {tab === "aceptadas"  && <TabAceptadas  convs={convsConAceptacion}   medicoName={medicoName} />}
      {tab === "rechazadas" && <TabRechazadas convs={convsConRechazo}      medicoName={medicoName} />}
      {tab === "horas"      && <TabHoras      medicoName={medicoName} />}
      {tab === "marcas"     && <TabMarcas     medicoName={medicoName} medicos={medicos} medicoMap={medicoMap} />}
    </AppShell>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "16px 18px",
  boxShadow: "var(--shadow-sm)",
};

const h3Style: React.CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  fontWeight: 700,
  color: "var(--text)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--muted)",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 10px",
  borderRadius: 8,
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
};
