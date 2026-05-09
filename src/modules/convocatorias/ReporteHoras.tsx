import React, { useMemo, useRef, useState } from "react";
import { toLocalDateTimeInputValue, minutesFromNow } from "../../core/date";
import { convocatoriaStore } from "./convocatoria.store";
import { medicosStore } from "../admin/medicos.store";
import { AppShell } from "../../ui/AppShell";
import { parseCsv } from "../../core/csv";

type TabReporte = "horas" | "marcas";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Tab: Reporte de Horas ─────────────────────────────────────────────────
function ReporteHorasTab({ medicoName }: { medicoName: (id: string) => string }) {
  const [from, setFrom] = useState(toLocalDateTimeInputValue(minutesFromNow(-7 * 24 * 60)));
  const [to,   setTo]   = useState(toLocalDateTimeInputValue(minutesFromNow(0)));

  const rows = useMemo(() => convocatoriaStore.buildHorasReport({
    fromIso: new Date(from).toISOString(),
    toIso:   new Date(to).toISOString(),
  }), [from, to]);

  const totales = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.medicoId] = (map[r.medicoId] ?? 0) + r.horas;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function exportar() {
    const header = ["medicoId","medicoNombre","sector","sede","inicio","fin","estado","horas","convocatoriaId"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.medicoId, medicoName(r.medicoId), r.sector, r.sede ?? "",
        r.inicio, r.fin, r.estado, String(r.horas), r.convocatoriaId,
      ].map(v => `"${String(v).replaceAll('"', '""')}"`).join(","));
    }
    downloadCsv(`mediflow_horas_${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Filtros */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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

        <div style={panelStyle}>
          <h3 style={h3Style}>Totales por médico</h3>
          {totales.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Sin cierres en el rango.</p>
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
                  }}>{Math.round(horas * 100) / 100} h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detalle */}
      <div style={panelStyle}>
        <h3 style={h3Style}>Detalle de asignaciones</h3>
        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>Sin datos.</p>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 1, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-2)" }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 80px", background: "var(--surface-2)", padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <div>Médico</div><div>Sector / Sede</div><div>Inicio</div><div>Fin</div><div>Horas</div>
            </div>
            {rows.map((r, idx) => (
              <div key={idx} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 80px",
                padding: "9px 12px", fontSize: 12.5,
                background: idx % 2 === 0 ? "transparent" : "var(--surface-2)",
                borderTop: "1px solid var(--border-2)",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{medicoName(r.medicoId)}</div>
                  <div style={{ fontSize: 11, color: "var(--subtle)" }}>{r.estado}</div>
                </div>
                <div style={{ color: "var(--muted)" }}>{r.sector}{r.sede ? ` · ${r.sede}` : ""}</div>
                <div style={{ color: "var(--muted)" }}>{new Date(r.inicio).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                <div style={{ color: "var(--muted)" }}>{new Date(r.fin).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                <div style={{ fontWeight: 700, color: "var(--blue)" }}>{r.horas} h</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Marcas de asistencia ─────────────────────────────────────────────
interface Marca {
  funcionario: string;
  fechaHora: Date;
  tipo: "E" | "S" | "?";
  raw: string;
}

interface VerificacionRow {
  medicoId:    string;
  medicoNombre: string;
  sector:      string;
  sede:        string;
  inicio:      Date;
  fin:         Date;
  estado:      "CUMPLIDA" | "PENDIENTE" | "SIN_MARCA" | "FUERA_RANGO";
  marcaEntrada: string | null;
  marcaSalida:  string | null;
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
      raw: JSON.stringify(r),
    });
  }
  return { marcas, errores };
}

function verificarMarcas(
  convocatorias: any[],
  marcas: Marca[],
  medicoMap: Map<string, string>,
  medicos: any[],
  margenMin = 30
): VerificacionRow[] {
  const rows: VerificacionRow[] = [];

  // mapa de funcionario → medicoId
  const funcToMedico = new Map<string, string>();
  for (const m of medicos) {
    if (m.funcionario) funcToMedico.set(String(m.funcionario).trim(), m.userId);
    if (m.cedula)      funcToMedico.set(String(m.cedula).trim(), m.userId);
    funcToMedico.set(m.userId, m.userId);
  }

  for (const conv of convocatorias) {
    for (const asig of conv.asignaciones ?? []) {
      if (!["CONFIRMADA", "CUMPLIDA", "NO_CUMPLIDA"].includes(asig.estado)) continue;

      const medicoId   = asig.medicoId;
      const inicio     = new Date(conv.inicio);
      const fin        = new Date(conv.fin);
      const margen     = margenMin * 60_000;

      // Buscar el nro funcionario del médico para cruzar con marcas
      const medico = medicos.find(m => m.userId === medicoId);
      const candidatos: string[] = [medicoId];
      if (medico?.funcionario) candidatos.push(String(medico.funcionario).trim());
      if (medico?.cedula)      candidatos.push(String(medico.cedula).trim());

      // Marcas del médico en ventana [inicio - margen, fin + margen]
      const marcasMedico = marcas.filter(mk =>
        candidatos.includes(mk.funcionario) &&
        mk.fechaHora.getTime() >= inicio.getTime() - margen &&
        mk.fechaHora.getTime() <= fin.getTime() + margen
      ).sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());

      const entrada = marcasMedico.find(m => m.tipo === "E") ?? marcasMedico[0] ?? null;
      const salida  = marcasMedico.filter(m => m.tipo === "S").at(-1) ?? null;

      let estado: VerificacionRow["estado"] = "SIN_MARCA";
      let diffMin: number | null = null;

      if (entrada) {
        diffMin = Math.round((entrada.fechaHora.getTime() - inicio.getTime()) / 60_000);
        estado = asig.estado === "CUMPLIDA" ? "CUMPLIDA" : "PENDIENTE";
      } else if (asig.estado === "CUMPLIDA") {
        estado = "CUMPLIDA"; // marcada manualmente sin marca de reloj
      }

      rows.push({
        medicoId,
        medicoNombre: medicoMap.get(medicoId) ?? medicoId,
        sector:       conv.sector,
        sede:         conv.sede ?? "",
        inicio, fin,
        estado,
        marcaEntrada: entrada ? entrada.fechaHora.toLocaleString("es-UY") : null,
        marcaSalida:  salida  ? salida.fechaHora.toLocaleString("es-UY")  : null,
        diffMinEntrada: diffMin,
      });
    }
  }

  return rows.sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
}

function EstadoMarca({ e }: { e: VerificacionRow["estado"] }) {
  const map: Record<string, { rgb: string; label: string }> = {
    CUMPLIDA:   { rgb: "22,163,74",   label: "Verificado"  },
    PENDIENTE:  { rgb: "217,119,6",   label: "Con marca"   },
    SIN_MARCA:  { rgb: "220,38,38",   label: "Sin marca"   },
    FUERA_RANGO:{ rgb: "100,116,139", label: "Fuera rango" },
  };
  const { rgb, label } = map[e] ?? map.SIN_MARCA;
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 20,
      background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
      border: `1px solid rgba(${rgb},0.25)`,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function ReporteMarcasTab({ medicoName, medicos, medicoMap }: {
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

  function procesar() {
    if (!csvText.trim()) return;
    setParsed(parseMarcas(csvText));
  }

  const convsFiltradas = useMemo(() => {
    const f = new Date(from + "T00:00:00").getTime();
    const t = new Date(to   + "T23:59:59").getTime();
    return convs.filter(c => {
      const ts = new Date(c.inicio).getTime();
      return ts >= f && ts <= t;
    });
  }, [convs, from, to]);

  const verificacion = useMemo(() => {
    if (!parsed) return [];
    return verificarMarcas(convsFiltradas, parsed.marcas, medicoMap, medicos, margen);
  }, [parsed, convsFiltradas, medicoMap, medicos, margen]);

  const stats = useMemo(() => ({
    total:    verificacion.length,
    verif:    verificacion.filter(r => r.estado === "CUMPLIDA").length,
    conMarca: verificacion.filter(r => r.estado === "PENDIENTE").length,
    sinMarca: verificacion.filter(r => r.estado === "SIN_MARCA").length,
  }), [verificacion]);

  function exportarVerif() {
    const h = ["Médico","ID","Sector","Sede","Inicio","Fin","Estado","Marca Entrada","Marca Salida","Diff min entrada"];
    const lines = [h.join(",")];
    for (const r of verificacion) {
      lines.push([
        r.medicoNombre, r.medicoId, r.sector, r.sede,
        r.inicio.toISOString(), r.fin.toISOString(), r.estado,
        r.marcaEntrada ?? "", r.marcaSalida ?? "", String(r.diffMinEntrada ?? ""),
      ].map(v => `"${String(v).replaceAll('"', '""')}"`).join(","));
    }
    downloadCsv(`mediflow_marcas_${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Configuración */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={panelStyle}>
          <h3 style={h3Style}>Cargar marcas del reloj</h3>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 12px" }}>
            CSV con columnas: <code style={{ fontFamily: "monospace", fontSize: 12 }}>funcionario, fecha_hora, tipo</code>
            <br />Tipo: <b>E</b> = entrada · <b>S</b> = salida (o cualquier texto, se infiere)
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btnGhost" onClick={() => fileRef.current?.click()} style={{ fontSize: 12 }}>
              Subir archivo CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={cargarArchivo} />
          </div>
          <textarea
            style={{
              width: "100%", marginTop: 10, minHeight: 100, padding: "8px 10px",
              borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)",
              fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box",
            }}
            placeholder={"funcionario,fecha_hora,tipo\n93598,2026-05-09 08:02,E\n93598,2026-05-09 20:15,S"}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
          />
          {parsed && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
              {parsed.marcas.length} marcas cargadas · {parsed.errores} filas ignoradas
            </div>
          )}
          <button
            className="btn" onClick={procesar}
            style={{ marginTop: 10, fontSize: 13 }}
            disabled={!csvText.trim()}
          >Procesar marcas</button>
        </div>

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
              <label style={labelStyle}>Margen de tolerancia (minutos)</label>
              <input
                className="input" type="number" min={0} max={120} value={margen}
                onChange={e => setMargen(Number(e.target.value))}
              />
              <p style={{ fontSize: 11.5, color: "var(--subtle)", margin: "4px 0 0" }}>
                La marca se considera válida si está dentro de ±{margen} min del inicio/fin del turno.
              </p>
            </div>
          </div>

          {/* Summary chips */}
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

      {/* Tabla de resultados */}
      {verificacion.length > 0 && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ ...h3Style, margin: 0 }}>Resultados de verificación</h3>
            <button className="btnGhost" onClick={exportarVerif} style={{ fontSize: 12 }}>Exportar CSV</button>
          </div>

          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-2)" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr 1fr",
              padding: "7px 12px", background: "var(--surface-2)",
              fontSize: 11, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <div>Médico</div><div>Turno</div><div>Sede / Sector</div>
              <div>Entrada</div><div>Salida</div><div>Estado</div>
            </div>

            {verificacion.map((r, i) => {
              const fmtDt = (d: Date) => d.toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr 1fr",
                  padding: "10px 12px",
                  background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
                  borderTop: "1px solid var(--border-2)",
                  alignItems: "center", fontSize: 12.5,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>{r.medicoNombre}</div>
                    <div style={{ fontSize: 11, color: "var(--subtle)" }}>{r.medicoId}</div>
                  </div>
                  <div style={{ color: "var(--muted)" }}>
                    <div>{fmtDt(r.inicio)}</div>
                    <div style={{ fontSize: 11, color: "var(--subtle)" }}>→ {fmtDt(r.fin)}</div>
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
                  <div><EstadoMarca e={r.estado} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {!parsed && (
        <div style={{ textAlign: "center", padding: "32px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🕐</div>
          <p style={{ margin: 0, fontSize: 13 }}>Cargá el CSV del reloj biométrico y presioná <b>Procesar marcas</b></p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--subtle)" }}>Soporta relojes faciales, de tarjeta o huella que exporten CSV.</p>
        </div>
      )}
    </div>
  );
}

// ── Main ReporteHoras (con tabs) ──────────────────────────────────────────
export function ReporteHoras() {
  const [tab, setTab] = useState<TabReporte>("horas");

  const medicos = useMemo(() => medicosStore.list(), []);
  const medicoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of medicos) map.set(m.userId, m.displayName);
    return map;
  }, [medicos]);
  const medicoName = (id: string) => medicoMap.get(id) ?? id;

  const TABS: { key: TabReporte; label: string }[] = [
    { key: "horas",  label: "Horas trabajadas" },
    { key: "marcas", label: "Marcas de asistencia" },
  ];

  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Reportes</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Análisis de asistencia, horas y verificación con relojes biométricos.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", borderRadius: "8px 8px 0 0",
            border: "1px solid var(--border)",
            borderBottom: tab === t.key ? "2px solid var(--blue)" : "1px solid var(--border)",
            background: tab === t.key ? "var(--blue-tint)" : "var(--surface)",
            color: tab === t.key ? "var(--blue)" : "var(--muted)",
            fontWeight: tab === t.key ? 700 : 500,
            fontSize: 13.5, cursor: "pointer", marginBottom: -1,
            transition: "all 0.12s",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "horas"  && <ReporteHorasTab medicoName={medicoName} />}
      {tab === "marcas" && <ReporteMarcasTab medicoName={medicoName} medicos={medicos} medicoMap={medicoMap} />}
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
