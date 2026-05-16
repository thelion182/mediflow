import React, { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../ui/AppShell";
import { authStore } from "../../auth/auth.store";
import { convocatoriaStore } from "../convocatorias/convocatoria.store";
import { medicosStore } from "../admin/medicos.store";
import { sedesStore } from "../admin/sedes.store";
import { guardiasFijasStore } from "../admin/guardias-fijas.store";
import { especialidadesStore } from "../admin/especialidades.store";
import { DistribucionPanel } from "./DistribucionPanel";
import { storage } from "../../core/storage";

// ── Date helpers ──────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-UY", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Dom, 1=Lun
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(dateStr, diff);
}
function getWeekDays(dateStr: string): { dateStr: string; label: string; shortLabel: string; isToday: boolean }[] {
  const monday = getMondayOf(dateStr);
  const today = todayStr();
  return Array.from({ length: 7 }, (_, i) => {
    const ds = addDays(monday, i);
    const d = new Date(ds + "T12:00:00");
    return {
      dateStr: ds,
      label: d.toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short" }),
      shortLabel: d.toLocaleDateString("es-UY", { weekday: "short", day: "numeric" }),
      isToday: ds === today,
    };
  });
}
function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}
function overlapsDay(c: any, dayStr: string): boolean {
  const dayStart = new Date(dayStr + "T00:00:00").getTime();
  const dayEnd   = new Date(dayStr + "T23:59:59").getTime();
  return new Date(c.inicio).getTime() <= dayEnd && new Date(c.fin).getTime() >= dayStart;
}

// ── Timeline math ─────────────────────────────────────────────────────────
function pctOf(isoStr: string, dayStr: string): number {
  const t = new Date(isoStr).getTime();
  const s = new Date(dayStr + "T00:00:00").getTime();
  const e = new Date(dayStr + "T24:00:00").getTime();
  return Math.max(0, Math.min(100, ((t - s) / (e - s)) * 100));
}
function fmtHour(h: number) { return `${String(h).padStart(2, "0")}:00`; }
function dChip(active: boolean, rgb: string): React.CSSProperties {
  return {
    padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
    border: `1.5px solid ${active ? `rgba(${rgb},0.60)` : "var(--border-2)"}`,
    background: active ? `rgba(${rgb},0.12)` : "var(--surface-2)",
    color: active ? `rgb(${rgb})` : "var(--muted)",
    cursor: "pointer", transition: "all 0.12s",
  };
}

// ── Status colors ─────────────────────────────────────────────────────────
function estadoColor(estado: string) {
  switch (estado) {
    case "CUBIERTA": return { bg: "rgba(109,191,60,0.18)", border: "rgba(109,191,60,0.45)", text: "#2d7a0f", rgb: "109,191,60" };
    case "ENVIADA":
    case "PARCIAL":  return { bg: "rgba(21,101,192,0.12)", border: "rgba(21,101,192,0.35)", text: "#1565C0", rgb: "21,101,192" };
    case "VENCIDA":  return { bg: "rgba(217,119,6,0.12)",  border: "rgba(217,119,6,0.35)",  text: "#92400e", rgb: "217,119,6" };
    case "CANCELADA":return { bg: "rgba(100,116,139,0.10)",border: "rgba(100,116,139,0.25)",text: "#64748b", rgb: "100,116,139" };
    default:         return { bg: "rgba(21,101,192,0.08)", border: "rgba(21,101,192,0.20)", text: "#1565C0", rgb: "21,101,192" };
  }
}

function BadgeAsignacion({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    CONFIRMADA:         { bg: "rgba(22,163,74,0.12)",  color: "rgb(22,163,74)",   label: "Confirmada"         },
    CANCELADA_POR_MEDICO:{ bg: "rgba(220,38,38,0.10)", color: "rgb(220,38,38)",   label: "Canceló"            },
    CUMPLIDA:           { bg: "rgba(22,163,74,0.10)",  color: "rgb(22,163,74)",   label: "Cumplida"           },
    NO_CUMPLIDA:        { bg: "rgba(220,38,38,0.10)",  color: "rgb(220,38,38)",   label: "No cumplida"        },
    REEMPLAZADA:        { bg: "rgba(217,119,6,0.10)",  color: "rgb(217,119,6)",   label: "Reemplazada"        },
  };
  const s = map[estado] ?? { bg: "var(--surface-2)", color: "var(--muted)", label: estado };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 10.5, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.color}30`,
    }}>{s.label}</span>
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────
function EditPanel({
  conv, day, medicoName, allMedicos, onClose, onRefresh, readonly,
}: {
  conv: any;
  day: string;
  medicoName: (id: string) => string;
  allMedicos: any[];
  onClose: () => void;
  onRefresh: () => void;
  readonly?: boolean;
}) {
  const [showSelector, setShowSelector] = useState(false);
  const [search, setSearch] = useState("");
  const [nota, setNota] = useState("");

  const asignaciones = (conv.asignaciones || []) as any[];
  const confirmadas = asignaciones.filter((a: any) => a.estado === "CONFIRMADA");
  const col = estadoColor(conv.estado);

  const medicosFiltrados = useMemo(() => {
    const q = search.toLowerCase();
    return allMedicos.filter((m: any) => {
      if (!q) return true;
      return (
        String(m.displayName || "").toLowerCase().includes(q) ||
        String(m.userId || "").toLowerCase().includes(q) ||
        String(m.especialidad || "").toLowerCase().includes(q)
      );
    }).slice(0, 10);
  }, [allMedicos, search]);

  function cancelarAsignacion(asignacionId: string) {
    if (!confirm("¿Cancelar esta asignación?")) return;
    convocatoriaStore.cancelarAsignacion(conv.id, asignacionId, nota || undefined);
    setNota("");
    onRefresh();
  }

  function asignarMedico(medicoId: string) {
    const result = convocatoriaStore.asignarManual(conv.id, medicoId, nota || undefined);
    if (!result.ok) {
      if (result.reason === "conflict") {
        alert("No se puede asignar: el médico ya tiene un turno confirmado que se superpone en el mismo horario.");
      } else {
        alert("El médico ya tiene una asignación activa en esta convocatoria.");
      }
      return;
    }
    setShowSelector(false);
    setSearch("");
    setNota("");
    onRefresh();
  }

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      boxShadow: "var(--shadow)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "12px 14px", borderBottom: "1px solid var(--border-2)",
        background: col.bg,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: col.text }}>{conv.sector}</div>
          {conv.sede && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{conv.sede}</div>}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {fmtTime(conv.inicio)} → {fmtTime(conv.fin)}
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
              background: `rgba(${col.rgb},0.15)`, color: col.text,
              border: `1px solid rgba(${col.rgb},0.25)`,
            }}>{conv.estado}</span>
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>
              Cupos: {confirmadas.length}/{conv.cupos}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 14, color: "var(--muted)" }}
        >✕</button>
      </div>

      <div style={{ padding: "12px 14px" }}>
        {/* Asignaciones list */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
            Asignaciones
          </div>
          {asignaciones.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--subtle)", margin: 0 }}>Sin asignaciones</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {asignaciones.map((a: any) => (
                <div key={a.id} style={{
                  padding: "8px 10px", borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: a.estado === "CANCELADA_POR_MEDICO" ? "rgba(220,38,38,0.04)" : "var(--surface-2)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      {medicoName(a.medicoId)}
                    </span>
                    <BadgeAsignacion estado={a.estado} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {a.medicoId}
                    {a.cierreNota && <span style={{ marginLeft: 6 }}>· {a.cierreNota}</span>}
                  </div>
                  {a.estado === "CONFIRMADA" && !readonly && (
                    <div style={{ marginTop: 6 }}>
                      <div className="field" style={{ margin: 0 }}>
                        <input
                          className="input"
                          placeholder="Nota (opcional)"
                          value={nota}
                          onChange={e => setNota(e.target.value)}
                          style={{ fontSize: 11, padding: "5px 8px", marginBottom: 6 }}
                        />
                      </div>
                      <button
                        onClick={() => cancelarAsignacion(a.id)}
                        style={{
                          padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                          border: "1px solid rgba(220,38,38,0.25)",
                          background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)", cursor: "pointer",
                        }}
                      >✕ Cancelar médico</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assign new doctor */}
        {!readonly && (conv.cupos > confirmadas.length || confirmadas.length === 0) && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
              Asignar médico
            </div>
            {!showSelector ? (
              <button
                onClick={() => setShowSelector(true)}
                style={{
                  width: "100%", padding: "8px", borderRadius: 10,
                  border: "1.5px dashed var(--border)",
                  background: "transparent", cursor: "pointer",
                  fontSize: 12, color: "var(--muted)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--blue)";
                  (e.currentTarget as HTMLElement).style.color = "var(--blue)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLElement).style.color = "var(--muted)";
                }}
              >+ Asignar reemplazante</button>
            ) : (
              <div>
                <div className="field" style={{ margin: "0 0 8px" }}>
                  <input
                    className="input"
                    placeholder="Buscar médico…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ fontSize: 12, padding: "6px 10px" }}
                    autoFocus
                  />
                </div>
                <div className="field" style={{ margin: "0 0 8px" }}>
                  <input
                    className="input"
                    placeholder="Nota (opcional)"
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    style={{ fontSize: 12, padding: "6px 10px" }}
                  />
                </div>
                <div style={{ display: "grid", gap: 5, maxHeight: 200, overflowY: "auto" }}>
                  {medicosFiltrados.map((m: any) => (
                    <button
                      key={m.userId}
                      onClick={() => asignarMedico(m.userId)}
                      style={{
                        textAlign: "left", padding: "7px 10px", borderRadius: 8,
                        border: "1px solid var(--border)", background: "var(--surface)",
                        cursor: "pointer", fontSize: 12, transition: "all 0.12s",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--blue-tint)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--surface)"}
                    >
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{m.displayName}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
                        {m.userId}{m.especialidad ? ` · ${m.especialidad}` : ""}
                      </div>
                    </button>
                  ))}
                  {medicosFiltrados.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, padding: "8px 0" }}>Sin resultados</p>
                  )}
                </div>
                <button
                  onClick={() => { setShowSelector(false); setSearch(""); }}
                  style={{ marginTop: 8, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 11, color: "var(--muted)" }}
                >Cancelar</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Weekly grid ───────────────────────────────────────────────────────────
function WeeklyGrid({
  weekDays, weekData, medicoName, currentDay, onSelectDay,
}: {
  weekDays: { dateStr: string; label: string; shortLabel: string; isToday: boolean }[];
  weekData: {
    rows: { sede: string; sector: string }[];
    grid: Map<string, Map<string, { convs: any[]; cubierta: number; parcial: number; enviada: number; vencida: number }>>;
  };
  medicoName: (id: string) => string;
  currentDay: string;
  onSelectDay: (d: string) => void;
}) {
  const COL_W = 130;

  function cellBg(cubierta: number, parcial: number, enviada: number, vencida: number, total: number) {
    if (total === 0) return { bg: "transparent", border: "var(--border-2)", text: "var(--subtle)" };
    if (cubierta === total) return { bg: "rgba(22,163,74,0.10)", border: "rgba(22,163,74,0.30)", text: "rgb(20,130,60)" };
    if (vencida > 0 && enviada === 0 && cubierta === 0) return { bg: "rgba(220,38,38,0.09)", border: "rgba(220,38,38,0.28)", text: "rgb(185,28,28)" };
    if (enviada > 0 || parcial > 0) return { bg: "rgba(21,101,192,0.09)", border: "rgba(21,101,192,0.28)", text: "var(--blue)" };
    return { bg: "rgba(217,119,6,0.09)", border: "rgba(217,119,6,0.28)", text: "rgb(150,80,0)" };
  }

  if (weekData.rows.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "60px 20px",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, color: "var(--text)",
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
        <p style={{ margin: 0, fontWeight: 600 }}>Sin convocatorias esta semana</p>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 200 + COL_W * 7 }}>
          {/* Header row */}
          <div style={{
            display: "flex", borderBottom: "2px solid var(--border-2)",
            background: "var(--surface-2)",
          }}>
            <div style={{ width: 200, flexShrink: 0, padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Sede / Sector
            </div>
            {weekDays.map(wd => (
              <div key={wd.dateStr}
                onClick={() => onSelectDay(wd.dateStr)}
                style={{
                  width: COL_W, flexShrink: 0, padding: "10px 8px", textAlign: "center",
                  fontSize: 12, fontWeight: wd.isToday ? 800 : 600,
                  color: wd.isToday ? "var(--blue)" : "var(--text)",
                  background: wd.isToday ? "rgba(21,101,192,0.07)" : "transparent",
                  borderLeft: "1px solid var(--border-2)",
                  cursor: "pointer",
                  borderBottom: wd.dateStr === currentDay ? "3px solid var(--blue)" : "none",
                }}
              >
                {wd.label}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {weekData.rows.map((row, ri) => {
            const key = `${row.sede}|||${row.sector}`;
            const dayMap = weekData.grid.get(key);
            return (
              <div key={key} style={{
                display: "flex", alignItems: "stretch",
                borderBottom: ri < weekData.rows.length - 1 ? "1px solid var(--border-2)" : "none",
                minHeight: 56,
              }}>
                {/* Label */}
                <div style={{
                  width: 200, flexShrink: 0, padding: "8px 16px",
                  display: "flex", flexDirection: "column", justifyContent: "center",
                  borderRight: "1px solid var(--border-2)",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{row.sede}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{row.sector}</div>
                </div>

                {/* Day cells */}
                {weekDays.map(wd => {
                  const cell = dayMap?.get(wd.dateStr) ?? { convs: [], cubierta: 0, parcial: 0, enviada: 0, vencida: 0 };
                  const { cubierta, parcial, enviada, vencida, convs } = cell;
                  const total = convs.length;
                  const col = cellBg(cubierta, parcial, enviada, vencida, total);
                  const confirmados = convs.flatMap(c =>
                    (c.asignaciones || []).filter((a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA")
                  );

                  return (
                    <div key={wd.dateStr}
                      onClick={() => { if (total > 0) onSelectDay(wd.dateStr); }}
                      style={{
                        width: COL_W, flexShrink: 0, padding: "6px 8px",
                        borderLeft: "1px solid var(--border-2)",
                        background: wd.dateStr === currentDay ? "rgba(21,101,192,0.04)" : col.bg,
                        cursor: total > 0 ? "pointer" : "default",
                        display: "flex", flexDirection: "column", justifyContent: "center",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={e => { if (total > 0) (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                    >
                      {total === 0 ? (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--border-2)", margin: "auto" }} />
                      ) : (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: col.text, marginBottom: 2 }}>
                            {cubierta === total ? "✓ Cubierto" :
                             cubierta > 0 ? `${cubierta}/${total} cubierto` :
                             enviada > 0 ? "En curso" :
                             vencida > 0 ? "Sin cubrir" : "Parcial"}
                          </div>
                          {confirmados.length > 0 && (
                            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.3 }}>
                              {confirmados.slice(0, 2).map((a: any) => medicoName(a.medicoId)).join(", ")}
                              {confirmados.length > 2 ? ` +${confirmados.length - 2}` : ""}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Zona = "todos" | "montevideo" | "interior";

// ── ParteDiario ───────────────────────────────────────────────────────────
export function ParteDiario() {
  const session = authStore.getSession();
  const readonly = session?.role === "MEDICO" || session?.role === "CONSULTA_PD";

  const [day, setDay] = useState(todayStr);
  const [tick, setTick] = useState(0);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily");
  const [showDistribucion, setShowDistribucion] = useState(false);

  // Filtros — persisten por usuario
  const filtrosKey = `mediflow.pd.filtros.${session?.userId ?? "anon"}`;
  type FiltrosPersisted = { zona: Zona; filtroSede: string; filtroSector: string };
  const savedFiltros = storage.get<FiltrosPersisted>(filtrosKey, { zona: "todos", filtroSede: "", filtroSector: "" });

  const [zona, _setZona]               = useState<Zona>(savedFiltros.zona);
  const [filtroSede, _setFiltroSede]   = useState(savedFiltros.filtroSede);
  const [filtroSector, _setFiltroSector] = useState(savedFiltros.filtroSector);

  function setZona(v: Zona)        { _setZona(v);        storage.set(filtrosKey, { zona: v,    filtroSede, filtroSector }); }
  function setFiltroSede(v: string)   { _setFiltroSede(v);   storage.set(filtrosKey, { zona, filtroSede: v,    filtroSector }); }
  function setFiltroSector(v: string) { _setFiltroSector(v); storage.set(filtrosKey, { zona, filtroSede, filtroSector: v }); }

  type FiltroDestaque = { tipo: "GREMIO" | "TIPO" | "ESPECIALIDAD"; valor: string };
  const [filtroD, setFiltroD] = useState<FiltroDestaque | null>(null);

  const allMedicos = useMemo(() => medicosStore.list().filter((m: any) => m.activo ?? true), [tick]);
  const medicosById = useMemo(() => {
    const m = new Map<string, string>();
    for (const med of allMedicos) m.set(med.userId, med.displayName);
    return m;
  }, [tick]);
  const medicosFullById = useMemo(() => {
    const m = new Map<string, any>();
    for (const med of allMedicos) m.set(med.userId, med);
    return m;
  }, [tick]);
  const iconosEsp = useMemo(() => especialidadesStore.getAll(), [tick]);
  const espIcono  = (esp: string) => iconosEsp[esp] ?? "🏥";
  const medicoName = (id: string) => medicosById.get(id) ?? id;

  function convMatchesFiltro(c: any): boolean {
    if (!filtroD) return true;
    const confirmados = (c.asignaciones || []).filter(
      (a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA"
    );
    if (!confirmados.length) return false;
    return confirmados.some((a: any) => {
      const med = medicosFullById.get(a.medicoId);
      if (!med) return false;
      if (filtroD.tipo === "GREMIO")       return (med.gremio ?? "SMU") === filtroD.valor;
      if (filtroD.tipo === "TIPO")         return med.tipo === filtroD.valor;
      if (filtroD.tipo === "ESPECIALIDAD") return med.especialidad === filtroD.valor;
      return false;
    });
  }

  const allConvs = useMemo(() => convocatoriaStore.list(), [tick]);

  const guardiasFijasDelDia = useMemo(() => {
    const dayStart = new Date(day + "T00:00:00");
    const dayEnd   = new Date(day + "T23:59:59");
    return guardiasFijasStore.getForDateRange(dayStart, dayEnd);
  }, [day, tick]);

  // Mapa nombre de sede → departamento (para zona Mvd/Interior)
  const sedeDeptMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sedesStore.list()) map.set(s.nombre, s.departamento ?? "");
    return map;
  }, [tick]);

  function sedeZona(sedeNombre: string): "montevideo" | "interior" {
    const depto = sedeDeptMap.get(sedeNombre) ?? "";
    return depto.toLowerCase() === "montevideo" ? "montevideo" : "interior";
  }

  // Convocatorias del día sin filtros (para opciones disponibles)
  const forDay = useMemo(() =>
    allConvs.filter(c => overlapsDay(c, day) && c.estado !== "BORRADOR"),
  [allConvs, day, tick]);

  // Listas únicas para los dropdowns
  const sedesDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const c of forDay) if (c.sede) set.add(c.sede);
    return Array.from(set).sort();
  }, [forDay]);

  const sectoresDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const c of forDay) if (c.sector) set.add(c.sector);
    return Array.from(set).sort();
  }, [forDay]);

  const grouped = useMemo(() => {
    const filtered = forDay.filter(c => {
      const sedeNombre = c.sede || "(Sin sede)";
      if (zona !== "todos" && sedeZona(sedeNombre) !== zona) return false;
      if (filtroSede && sedeNombre !== filtroSede) return false;
      if (filtroSector && c.sector !== filtroSector) return false;
      return true;
    });

    const result: Record<string, Record<string, any[]>> = {};
    for (const c of filtered) {
      const sede   = c.sede   || "(Sin sede)";
      const sector = c.sector || "(Sin sector)";
      if (!result[sede]) result[sede] = {};
      if (!result[sede][sector]) result[sede][sector] = [];
      result[sede][sector].push(c);
    }

    // Inject guardias fijas as virtual convs into the same Gantt timeline
    for (const o of guardiasFijasDelDia) {
      const sedeNombre = o.sede || "(Sin sede)";
      if (zona !== "todos" && sedeZona(sedeNombre) !== zona) continue;
      if (filtroSede && sedeNombre !== filtroSede) continue;
      if (filtroSector && o.sector !== filtroSector) continue;
      const sector = o.sector || "(Sin sector)";
      if (!result[sedeNombre]) result[sedeNombre] = {};
      if (!result[sedeNombre][sector]) result[sedeNombre][sector] = [];
      result[sedeNombre][sector].push({
        id: `__gf__${o.guardiaFijaId}_${o.inicio}`,
        inicio: o.inicio, fin: o.fin,
        sector: o.sector, sede: o.sede,
        estado: "CUBIERTA", cupos: 1,
        asignaciones: [{ id: `__gfa__${o.guardiaFijaId}`, medicoId: o.medicoId, estado: "CONFIRMADA" }],
        invitaciones: [],
        _esGuardiaFija: true,
      });
    }

    return result;
  }, [forDay, zona, filtroSede, filtroSector, guardiasFijasDelDia]);

  const selectedConv = useMemo(
    () => selectedConvId ? allConvs.find(c => c.id === selectedConvId) ?? null : null,
    [selectedConvId, allConvs]
  );

  // Alertas críticas: turnos sin cubrir en las próximas 4h
  const alertasCriticas = useMemo(() => {
    const now = Date.now();
    const threshold = now + 4 * 60 * 60_000;
    return allConvs.filter(c => {
      if (c.estado === "CANCELADA" || c.estado === "CUBIERTA") return false;
      const inicioMs = new Date(c.inicio).getTime();
      return inicioMs > now && inicioMs <= threshold;
    });
  }, [allConvs, tick]);

  // Datos para vista semanal
  const weekDays = useMemo(() => getWeekDays(day), [day]);
  const weekData = useMemo(() => {
    const weekConvs = allConvs.filter(c =>
      c.estado !== "BORRADOR" &&
      weekDays.some(wd => overlapsDay(c, wd.dateStr))
    );
    const pairsSet = new Set<string>();
    for (const c of weekConvs) {
      pairsSet.add(`${c.sede ?? "(Sin sede)"}|||${c.sector ?? "(Sin sector)"}`);
    }
    const rows = Array.from(pairsSet).map(p => {
      const [sede, sector] = p.split("|||");
      return { sede, sector };
    }).sort((a, b) => a.sede.localeCompare(b.sede) || a.sector.localeCompare(b.sector));

    const grid = new Map<string, Map<string, { convs: any[]; cubierta: number; parcial: number; enviada: number; vencida: number }>>();
    for (const row of rows) {
      const key = `${row.sede}|||${row.sector}`;
      const dayMap = new Map<string, { convs: any[]; cubierta: number; parcial: number; enviada: number; vencida: number }>();
      for (const wd of weekDays) {
        const convs = weekConvs.filter(c =>
          (c.sede ?? "(Sin sede)") === row.sede &&
          (c.sector ?? "(Sin sector)") === row.sector &&
          overlapsDay(c, wd.dateStr)
        );
        dayMap.set(wd.dateStr, {
          convs,
          cubierta: convs.filter(c => c.estado === "CUBIERTA").length,
          parcial:  convs.filter(c => c.estado === "PARCIAL").length,
          enviada:  convs.filter(c => c.estado === "ENVIADA").length,
          vencida:  convs.filter(c => c.estado === "VENCIDA").length,
        });
      }
      grid.set(key, dayMap);
    }
    return { rows, grid };
  }, [allConvs, weekDays]);

  // Summary for day
  const daySummary = useMemo(() => {
    const all = Object.values(grouped).flatMap(s => Object.values(s).flat());
    const total = all.length;
    const cubierta  = all.filter(c => c.estado === "CUBIERTA").length;
    const parcial   = all.filter(c => c.estado === "PARCIAL").length;
    const enviada   = all.filter(c => c.estado === "ENVIADA").length;
    const vencida   = all.filter(c => c.estado === "VENCIDA").length;
    return { total, cubierta, parcial, enviada, vencida };
  }, [grouped]);

  const hasCoverage = Object.keys(grouped).length > 0;
  const hourMarks = Array.from({ length: 13 }, (_, i) => i * 2);

  const especialidadesHoy = useMemo(() => {
    const set = new Set<string>();
    Object.values(grouped).flatMap(s => Object.values(s).flat()).forEach((c: any) => {
      (c.asignaciones || [])
        .filter((a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA")
        .forEach((a: any) => {
          const m = medicosFullById.get(a.medicoId);
          if (m?.especialidad) set.add(m.especialidad);
        });
    });
    return Array.from(set).sort();
  }, [grouped, medicosFullById]);

  return (
    <AppShell>
      {/* ── Header ── */}
      {readonly && (
        <div style={{
          marginBottom: 12, padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.20)",
          color: "var(--muted)",
        }}>
          👁 Modo solo lectura — no se pueden realizar cambios desde este rol.
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Parte Diario</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)", textTransform: "capitalize" }}>
            {viewMode === "weekly"
              ? `Semana del ${weekDays[0].label} al ${weekDays[6].label}`
              : fmtDate(day)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* Toggle vista */}
          <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
            {([ ["daily", "Diaria"], ["weekly", "Semanal"] ] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: "7px 14px", border: "none", borderRight: mode === "daily" ? "1px solid var(--border)" : "none",
                background: viewMode === mode ? "var(--blue-tint-2)" : "var(--surface)",
                color: viewMode === mode ? "var(--blue)" : "var(--muted)",
                fontSize: 13, fontWeight: viewMode === mode ? 700 : 500, cursor: "pointer",
              }}>{label}</button>
            ))}
          </div>

          {/* Nav */}
          {[
            { label: "←", action: () => setDay(d => addDays(d, viewMode === "weekly" ? -7 : -1)) },
            { label: "Hoy", action: () => setDay(todayStr()), isToday: true },
            { label: "→",  action: () => setDay(d => addDays(d, viewMode === "weekly" ? 7 : 1))  },
          ].map(b => (
            <button key={b.label} onClick={b.action} style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: b.isToday && day === todayStr() ? "var(--blue-tint-2)" : "var(--surface)",
              color: b.isToday && day === todayStr() ? "var(--blue)" : "var(--text)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}>{b.label}</button>
          ))}
          <input
            type="date" value={day} onChange={e => setDay(e.target.value)}
            style={{
              padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface)", fontSize: 13, cursor: "pointer",
            }}
          />
          {!readonly && (
            <button onClick={() => setShowDistribucion(true)} style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--muted)", fontWeight: 500,
            }}>Distribución</button>
          )}
          <button onClick={() => setTick(t => t + 1)} title="Recargar datos" style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--muted)",
          }}>↺</button>
        </div>
      </div>

      {/* ── Alertas críticas ── */}
      {!readonly && alertasCriticas.length > 0 && (
        <div style={{
          marginBottom: 14, padding: "10px 16px", borderRadius: 12,
          background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.30)",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "rgb(185,28,28)", marginBottom: 4 }}>
              {alertasCriticas.length} turno{alertasCriticas.length !== 1 ? "s" : ""} sin cubrir en las próximas 4h
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {alertasCriticas.map(c => (
                <button key={c.id} onClick={() => { setDay(c.inicio.slice(0, 10)); setViewMode("daily"); setSelectedConvId(c.id); }}
                  style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: "1px solid rgba(220,38,38,0.30)", background: "rgba(220,38,38,0.08)",
                    color: "rgb(185,28,28)", cursor: "pointer",
                  }}>
                  {c.sector}{c.sede ? ` · ${c.sede}` : ""} — {fmtTime(c.inicio)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap",
        padding: "10px 14px", borderRadius: 12,
        background: "var(--surface)", border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}>
        {/* Zona Mvd/Interior */}
        <div style={{ display: "flex", gap: 4 }}>
          {([ ["todos", "Todos"], ["montevideo", "Montevideo"], ["interior", "Interior"] ] as [Zona, string][]).map(([z, label]) => (
            <button key={z} onClick={() => { setZona(z); setFiltroSede(""); }}
              style={{
                padding: "5px 13px", borderRadius: 20, fontSize: 12.5, fontWeight: zona === z ? 700 : 500,
                border: "1px solid var(--border)",
                background: zona === z ? "var(--blue-tint-2)" : "var(--surface-2)",
                color: zona === z ? "var(--blue)" : "var(--muted)",
                cursor: "pointer", transition: "all 0.12s",
              }}>{label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: "var(--border-2)", flexShrink: 0 }} />

        {/* Sede dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Sede:</span>
          <select
            value={filtroSede}
            onChange={e => setFiltroSede(e.target.value)}
            style={{
              padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface-2)", fontSize: 12.5, color: "var(--text)",
              cursor: "pointer", minWidth: 140,
            }}
          >
            <option value="">Todas</option>
            {sedesDisponibles
              .filter(s => zona === "todos" || sedeZona(s) === zona)
              .map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Sector dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Sector:</span>
          <select
            value={filtroSector}
            onChange={e => setFiltroSector(e.target.value)}
            style={{
              padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface-2)", fontSize: 12.5, color: "var(--text)",
              cursor: "pointer", minWidth: 140,
            }}
          >
            <option value="">Todos</option>
            {sectoresDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Limpiar filtros */}
        {(zona !== "todos" || filtroSede || filtroSector) && (
          <button
            onClick={() => { setZona("todos"); setFiltroSede(""); setFiltroSector(""); }}
            style={{
              marginLeft: "auto", padding: "5px 12px", borderRadius: 20, fontSize: 12,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted)", cursor: "pointer",
            }}
          >✕ Limpiar filtros</button>
        )}
      </div>

      {/* ── Filtro de destaque ── */}
      {viewMode === "daily" && <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap",
        padding: "8px 14px", borderRadius: 12,
        background: "var(--surface)", border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
          Destacar:
        </span>
        {[
          { label: "Todos", active: !filtroD, onClick: () => setFiltroD(null), rgb: "100,116,139" },
        ].map(b => (
          <button key="todos" onClick={b.onClick} style={dChip(b.active, b.rgb)}>{b.label}</button>
        ))}

        <div style={{ width: 1, height: 18, background: "var(--border-2)", flexShrink: 0 }} />

        {/* Gremio */}
        {[
          { label: "SAQ", valor: "SAQ", rgb: "217,119,6" },
          { label: "SMU", valor: "SMU", rgb: "21,101,192" },
        ].map(b => (
          <button key={b.label}
            onClick={() => setFiltroD(filtroD?.tipo === "GREMIO" && filtroD.valor === b.valor ? null : { tipo: "GREMIO", valor: b.valor })}
            style={dChip(filtroD?.tipo === "GREMIO" && filtroD.valor === b.valor, b.rgb)}
          >{b.label}</button>
        ))}

        <div style={{ width: 1, height: 18, background: "var(--border-2)", flexShrink: 0 }} />

        {/* Tipo médico */}
        {[
          { label: "Titulares",     valor: "TITULAR",       rgb: "38,166,154"  },
          { label: "Suplentes",     valor: "SUPLENTE",      rgb: "100,116,139" },
          { label: "Independientes",valor: "INDEPENDIENTE", rgb: "139,92,246"  },
        ].map(b => (
          <button key={b.valor}
            onClick={() => setFiltroD(filtroD?.tipo === "TIPO" && filtroD.valor === b.valor ? null : { tipo: "TIPO", valor: b.valor })}
            style={dChip(filtroD?.tipo === "TIPO" && filtroD.valor === b.valor, b.rgb)}
          >{b.label}</button>
        ))}

        {/* Especialidades del día */}
        {especialidadesHoy.length > 0 && (
          <>
            <div style={{ width: 1, height: 18, background: "var(--border-2)", flexShrink: 0 }} />
            {especialidadesHoy.map(esp => (
              <button key={esp}
                onClick={() => setFiltroD(filtroD?.tipo === "ESPECIALIDAD" && filtroD.valor === esp ? null : { tipo: "ESPECIALIDAD", valor: esp })}
                style={dChip(filtroD?.tipo === "ESPECIALIDAD" && filtroD.valor === esp, "21,101,192")}
                title={esp}
              >
                {espIcono(esp)} {esp.length > 10 ? esp.slice(0, 9) + "…" : esp}
              </button>
            ))}
          </>
        )}
      </div>}

      {/* ── Day summary bar ── */}
      {viewMode === "daily" && hasCoverage && (
        <div style={{
          display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap",
          padding: "10px 14px", borderRadius: 12,
          background: "var(--surface)", border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginRight: 4 }}>
            {daySummary.total} turno{daySummary.total !== 1 ? "s" : ""}
          </span>
          {[
            { label: "Cubierto",  count: daySummary.cubierta, rgb: "22,163,74"   },
            { label: "Parcial",   count: daySummary.parcial,  rgb: "217,119,6"   },
            { label: "En curso",  count: daySummary.enviada,  rgb: "21,101,192"  },
            { label: "Vencido",   count: daySummary.vencida,  rgb: "220,38,38"   },
          ].filter(x => x.count > 0).map(x => (
            <span key={x.label} style={{
              display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12,
              padding: "3px 10px", borderRadius: 20,
              background: `rgba(${x.rgb},0.10)`, color: `rgb(${x.rgb})`,
              border: `1px solid rgba(${x.rgb},0.20)`, fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: `rgb(${x.rgb})`, display: "inline-block" }} />
              {x.count} {x.label}
            </span>
          ))}

          {/* Leyenda de colores */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            {[
              { label: "Cubierta",  bg: "rgba(109,191,60,0.18)", border: "rgba(109,191,60,0.50)" },
              { label: "En curso",  bg: "rgba(21,101,192,0.12)", border: "rgba(21,101,192,0.35)" },
              { label: "Vencida",   bg: "rgba(217,119,6,0.12)",  border: "rgba(217,119,6,0.35)"  },
              { label: "Cancelada", bg: "rgba(100,116,139,0.10)",border: "rgba(100,116,139,0.25)"},
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <div style={{ width: 20, height: 8, borderRadius: 3, background: l.bg, border: `1.5px solid ${l.border}` }} />
                <span style={{ color: "var(--muted)" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vista semanal ── */}
      {viewMode === "weekly" && (
        <WeeklyGrid
          weekDays={weekDays}
          weekData={weekData}
          medicoName={medicoName}
          currentDay={day}
          onSelectDay={d => { setDay(d); setViewMode("daily"); }}
        />
      )}

      {/* ── Main area: Gantt + Edit panel ── */}
      {viewMode === "daily" && <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* ── Gantt ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!hasCoverage ? (
            <div style={{
              textAlign: "center", padding: "60px 20px",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 16, color: "var(--text)", boxShadow: "var(--shadow-sm)",
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <p style={{ margin: 0, fontWeight: 600 }}>Sin convocatorias para este día</p>
              <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
                No hay turnos registrados (excluye borradores).
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([sede, sectors]) => (
              <div key={sede} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 16, marginBottom: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)",
              }}>
                {/* Sede header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "11px 18px", borderBottom: "1px solid var(--border-2)",
                  background: "var(--surface-2)",
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                  <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{sede}</h2>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    · {Object.keys(sectors).length} sector{Object.keys(sectors).length !== 1 ? "es" : ""}
                  </span>
                </div>

                {/* Timeline */}
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 700 }}>
                    {/* Hour header */}
                    <div style={{ display: "flex", alignItems: "center", padding: "6px 18px 4px", borderBottom: "1px solid var(--border-2)" }}>
                      <div style={{ width: 130, flexShrink: 0 }} />
                      <div style={{ flex: 1, position: "relative", height: 18 }}>
                        {hourMarks.map(h => (
                          <span key={h} style={{
                            position: "absolute", left: `${(h / 24) * 100}%`,
                            fontSize: 10, color: "var(--subtle)", transform: "translateX(-50%)",
                          }}>{fmtHour(h)}</span>
                        ))}
                      </div>
                      <div style={{ width: 160, flexShrink: 0 }} />
                    </div>

                    {/* Sector rows */}
                    {Object.entries(sectors).map(([sector, convs]) => (
                      <div key={sector} style={{
                        display: "flex", alignItems: "stretch",
                        padding: "6px 18px", borderBottom: "1px solid var(--border-2)",
                        minHeight: 48, gap: 0,
                      }}>
                        {/* Sector label */}
                        <div style={{
                          width: 130, flexShrink: 0, fontSize: 13, fontWeight: 600,
                          color: "var(--text)", paddingRight: 10,
                          display: "flex", alignItems: "center",
                        }}>{sector}</div>

                        {/* Timeline track */}
                        <div style={{
                          flex: 1, position: "relative",
                          background: "var(--surface-2)", borderRadius: 6,
                          border: "1px solid var(--border-2)", minHeight: 38,
                        }}>
                          {hourMarks.map(h => (
                            <div key={h} style={{
                              position: "absolute", left: `${(h / 24) * 100}%`,
                              top: 0, bottom: 0, width: 1,
                              background: h === 0 || h === 24 ? "transparent" : "var(--border-2)",
                            }} />
                          ))}

                          {convs.map((c: any) => {
                            const left  = pctOf(c.inicio, day);
                            const right = pctOf(c.fin, day);
                            const width = Math.max(0.5, right - left);
                            const col   = estadoColor(c.estado);
                            const asignadosFull = (c.asignaciones || [])
                              .filter((a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA")
                              .map((a: any) => ({ name: medicoName(a.medicoId), med: medicosFullById.get(a.medicoId) }));
                            const isSelected = c.id === selectedConvId;
                            const isMatch    = convMatchesFiltro(c);

                            return (
                              <div
                                key={c.id}
                                title={c._esGuardiaFija
                                  ? `GUARDIA FIJA · ${c.sector}\n${fmtTime(c.inicio)} → ${fmtTime(c.fin)}\n${asignadosFull.map(x => x.name).join(", ")}`
                                  : `${c.sector} · ${c.estado}\n${fmtTime(c.inicio)} → ${fmtTime(c.fin)}\n${asignadosFull.length ? "Médicos: " + asignadosFull.map(x => x.name).join(", ") : "Sin asignación · clic para gestionar"}`}
                                onClick={() => { if (!c._esGuardiaFija) setSelectedConvId(c.id === selectedConvId ? null : c.id); }}
                                style={{
                                  position: "absolute",
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  top: 4, bottom: 4,
                                  borderRadius: 6,
                                  background: col.bg,
                                  border: isSelected
                                    ? `2px solid rgb(${col.rgb})`
                                    : `1.5px solid ${col.border}`,
                                  display: "flex", alignItems: "center", gap: 4,
                                  padding: "0 7px",
                                  overflow: "hidden",
                                  cursor: c._esGuardiaFija ? "default" : "pointer",
                                  boxShadow: isSelected ? `0 0 0 3px rgba(${col.rgb},0.20)` : undefined,
                                  opacity: filtroD && !isMatch ? 0.15 : 1,
                                  filter: filtroD && !isMatch ? "grayscale(0.7)" : "none",
                                  transition: "opacity 0.22s, filter 0.22s, border 0.15s, box-shadow 0.15s",
                                }}
                              >
                                <span style={{ fontSize: 11, fontWeight: 600, color: col.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                                  {asignadosFull.length > 0
                                    ? asignadosFull.map(x => x.name).join(", ")
                                    : c.estado === "CANCELADA" ? "Cancelada" : "Sin cobertura"}
                                </span>
                                {asignadosFull.length === 1 && asignadosFull[0].med?.especialidad && (
                                  <span style={{ fontSize: 13, flexShrink: 0, opacity: 0.85 }}
                                    title={asignadosFull[0].med.especialidad}>
                                    {espIcono(asignadosFull[0].med.especialidad)}
                                  </span>
                                )}
                                {c._esGuardiaFija && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 800, padding: "1px 4px",
                                    borderRadius: 3, background: "rgba(45,122,15,0.25)",
                                    color: "rgb(45,122,15)", letterSpacing: "0.05em", flexShrink: 0,
                                  }}>FIJA</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Detail column */}
                        <div style={{ width: 160, flexShrink: 0, paddingLeft: 10, display: "flex", flexDirection: "column", gap: 5, justifyContent: "center" }}>
                          {convs.map((c: any) => {
                            const asignados = (c.asignaciones || []).filter(
                              (a: any) => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA"
                            );
                            const col      = estadoColor(c.estado);
                            const isSelected = c.id === selectedConvId;
                            const isMatch    = convMatchesFiltro(c);
                            return (
                              <div
                                key={c.id}
                                onClick={() => { if (!c._esGuardiaFija) setSelectedConvId(c.id === selectedConvId ? null : c.id); }}
                                style={{
                                  fontSize: 11, lineHeight: 1.3,
                                  cursor: c._esGuardiaFija ? "default" : "pointer",
                                  padding: "3px 6px", borderRadius: 6,
                                  background: isSelected ? `rgba(${col.rgb},0.08)` : "transparent",
                                  opacity: filtroD && !isMatch ? 0.20 : 1,
                                  transition: "background 0.12s, opacity 0.22s",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontWeight: 600, color: col.text }}>
                                    {fmtTime(c.inicio)}–{fmtTime(c.fin)}
                                  </span>
                                  {c._esGuardiaFija && (
                                    <span style={{
                                      fontSize: 9, fontWeight: 800, padding: "1px 4px",
                                      borderRadius: 3, background: "rgba(45,122,15,0.25)",
                                      color: "rgb(45,122,15)", letterSpacing: "0.05em",
                                    }}>FIJA</span>
                                  )}
                                </div>
                                {asignados.length > 0 ? (
                                  asignados.map((a: any) => {
                                    const med = medicosFullById.get(a.medicoId);
                                    return (
                                      <div key={a.id} style={{ marginTop: 1 }}>
                                        <span style={{ color: "var(--text)" }}>{medicoName(a.medicoId)}</span>
                                        {med?.especialidad && (
                                          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>
                                            {espIcono(med.especialidad)} {med.especialidad.slice(0, 11)}{med.especialidad.length > 11 ? "…" : ""}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div style={{ color: "var(--muted)", fontStyle: "italic" }}>Sin cubrir ✎</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}

        </div>

        {/* ── Edit panel ── */}
        {selectedConv && (
          <div style={{ width: 290, flexShrink: 0, position: "sticky", top: 22 }}>
            <EditPanel
              conv={selectedConv}
              day={day}
              medicoName={medicoName}
              allMedicos={allMedicos}
              onClose={() => setSelectedConvId(null)}
              onRefresh={() => setTick(t => t + 1)}
              readonly={readonly}
            />
          </div>
        )}
      </div>}

      {showDistribucion && <DistribucionPanel onClose={() => setShowDistribucion(false)} />}
    </AppShell>
  );
}
