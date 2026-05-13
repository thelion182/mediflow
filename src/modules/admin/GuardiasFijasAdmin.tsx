import React, { useMemo, useState } from "react";
import {
  guardiasFijasStore, describePlatron, describeTurnos,
} from "./guardias-fijas.store";
import type { GuardiaFija, Turno, PatronDias } from "./guardias-fijas.store";
import { medicosStore } from "./medicos.store";
import { sectoresStore } from "./sectores.store";
import { sedesStore } from "./sedes.store";
import { DoctorAvatar } from "./DoctorAvatar";

// ── Constantes ──────────────────────────────────────────────────────────────
const DIAS_FULL  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DIAS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const NTH_OPTS   = [{ v: 1, label: "1° (primero)" }, { v: 2, label: "2° (segundo)" }, { v: 3, label: "3° (tercero)" }, { v: 4, label: "4° (cuarto)" }, { v: -1, label: "Último" }];

type PatronTipo = "DIAS_SEMANA" | "NTH_SEMANA";

const EMPTY_FORM = {
  medicoId:      "",
  patronTipo:    "DIAS_SEMANA" as PatronTipo,
  diasSemana:    [1, 2, 3, 4, 5] as number[],
  nthDiaSemana:  5,    // viernes
  nthN:          1,
  turnos:        [{ horaInicio: "08:00", horaFin: "20:00" }] as Turno[],
  sector:        "",
  sede:          "",
  notas:         "",
  activo:        true,
  vigenciaDesde: "",
  vigenciaHasta: "",
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function previewPlatron(form: typeof EMPTY_FORM): string {
  if (form.patronTipo === "NTH_SEMANA") {
    const nth = NTH_OPTS.find(o => o.v === form.nthN)?.label ?? form.nthN;
    return `${nth} ${DIAS_FULL[form.nthDiaSemana]} de cada mes`;
  }
  const dias = [...form.diasSemana].sort();
  if (!dias.length) return "Ningún día seleccionado";
  const j = JSON.stringify(dias);
  if (j === JSON.stringify([1,2,3,4,5])) return "Lunes a Viernes";
  if (j === JSON.stringify([0,6]))       return "Fin de semana";
  if (dias.length === 7)                 return "Todos los días";
  return dias.map(d => DIAS_SHORT[d]).join(", ");
}

// ── Componente principal ─────────────────────────────────────────────────────
export function GuardiasFijasAdmin() {
  const [tick,     setTick]     = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<GuardiaFija | null>(null);
  const [form,     setForm]     = useState({ ...EMPTY_FORM });
  const [diaFiltro,setDiaFiltro]= useState<number | "TODOS">("TODOS");

  const guardias = useMemo(() => guardiasFijasStore.list(), [tick]);
  const medicos  = useMemo(() => medicosStore.list().filter(m => m.activo), [tick]);
  const sectores = useMemo(() => sectoresStore.list().filter((s: any) => s.activo ?? true), [tick]);
  const sedes    = useMemo(() => sedesStore.list().filter((s: any) => s.activo ?? true), [tick]);

  const medicoById = useMemo(() => {
    const map = new Map<string, (typeof medicos)[0]>();
    for (const m of medicos) map.set(m.userId, m);
    return map;
  }, [medicos]);

  // Filtrado para tabla
  const visibles = useMemo(() => {
    let list = guardias;
    if (diaFiltro !== "TODOS") {
      list = list.filter(g => {
        if (g.patron.tipo === "DIAS_SEMANA") return g.patron.dias.includes(diaFiltro as number);
        if (g.patron.tipo === "NTH_SEMANA")  return g.patron.diaSemana === diaFiltro;
        return false;
      });
    }
    return list;
  }, [guardias, diaFiltro]);

  // ── Form helpers ─────────────────────────────────────────────────────────
  function openNew() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      sector:   sectores[0]?.nombre ?? "",
      medicoId: medicos[0]?.userId ?? "",
    });
    setShowForm(true);
    setTimeout(() => document.getElementById("gf-form-top")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function openEdit(g: GuardiaFija) {
    setEditing(g);
    const patronTipo: PatronTipo = g.patron.tipo === "NTH_SEMANA" ? "NTH_SEMANA" : "DIAS_SEMANA";
    setForm({
      medicoId:      g.medicoId,
      patronTipo,
      diasSemana:    g.patron.tipo === "DIAS_SEMANA" ? g.patron.dias : [1,2,3,4,5],
      nthDiaSemana:  g.patron.tipo === "NTH_SEMANA"  ? g.patron.diaSemana : 5,
      nthN:          g.patron.tipo === "NTH_SEMANA"  ? g.patron.nth : 1,
      turnos:        [...g.turnos],
      sector:        g.sector,
      sede:          g.sede ?? "",
      notas:         g.notas ?? "",
      activo:        g.activo,
      vigenciaDesde: g.vigenciaDesde ?? "",
      vigenciaHasta: g.vigenciaHasta ?? "",
    });
    setShowForm(true);
  }

  function toggleDia(d: number) {
    setForm(f => {
      const has = f.diasSemana.includes(d);
      return { ...f, diasSemana: has ? f.diasSemana.filter(x => x !== d) : [...f.diasSemana, d] };
    });
  }

  function addTurno() {
    setForm(f => ({ ...f, turnos: [...f.turnos, { horaInicio: "08:00", horaFin: "20:00" }] }));
  }
  function removeTurno(i: number) {
    setForm(f => ({ ...f, turnos: f.turnos.filter((_, idx) => idx !== i) }));
  }
  function updateTurno(i: number, field: keyof Turno, val: string) {
    setForm(f => {
      const t = [...f.turnos];
      t[i] = { ...t[i], [field]: val };
      return { ...f, turnos: t };
    });
  }

  function save() {
    if (!form.medicoId) return alert("Seleccioná un médico.");
    if (!form.sector)   return alert("Seleccioná un sector.");
    if (form.patronTipo === "DIAS_SEMANA" && !form.diasSemana.length) return alert("Seleccioná al menos un día.");
    if (!form.turnos.length) return alert("Agregá al menos un turno.");

    const patron: PatronDias = form.patronTipo === "NTH_SEMANA"
      ? { tipo: "NTH_SEMANA", diaSemana: form.nthDiaSemana, nth: form.nthN }
      : { tipo: "DIAS_SEMANA", dias: [...form.diasSemana].sort() };

    const data: Omit<GuardiaFija, "id"> = {
      medicoId:      form.medicoId,
      patron,
      turnos:        form.turnos,
      sector:        form.sector,
      sede:          form.sede.trim() || undefined,
      notas:         form.notas.trim() || undefined,
      activo:        form.activo,
      vigenciaDesde: form.vigenciaDesde || undefined,
      vigenciaHasta: form.vigenciaHasta || undefined,
    };

    editing ? guardiasFijasStore.update(editing.id, data) : guardiasFijasStore.add(data);
    setShowForm(false);
    setTick(t => t + 1);
  }

  function toggleActivo(g: GuardiaFija) {
    guardiasFijasStore.update(g.id, { activo: !g.activo });
    setTick(t => t + 1);
  }
  function remove(g: GuardiaFija) {
    const m = medicoById.get(g.medicoId);
    if (!confirm(`Eliminar guardia fija de ${m?.displayName ?? g.medicoId}?`)) return;
    guardiasFijasStore.remove(g.id);
    setTick(t => t + 1);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* Banner info + acción */}
      <div style={{
        padding: "10px 16px", borderRadius: 10,
        background: "rgba(21,101,192,0.06)", border: "1px solid rgba(21,101,192,0.15)",
        fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <span>
          <b style={{ color: "var(--blue)" }}>Guardias Fijas.</b> Turnos recurrentes por patrón de días.
          Aparecen automáticamente en el Parte Diario como bloques verdes con indicador <b>FIJA</b>.
        </span>
        <button onClick={openNew} style={primaryBtn}>+ Nueva guardia fija</button>
      </div>

      {/* ── Formulario ── */}
      {showForm && (
        <div id="gf-form-top" style={{
          background: "var(--surface)", border: "1.5px solid var(--blue)",
          borderRadius: 14, padding: "20px 22px", boxShadow: "0 4px 20px rgba(21,101,192,0.10)",
        }}>
          <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 700 }}>
            {editing ? "Editar guardia fija" : "Nueva guardia fija"}
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* Médico */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Médico</label>
              <select style={sel} value={form.medicoId} onChange={e => setForm(f => ({ ...f, medicoId: e.target.value }))}>
                <option value="">— Seleccioná —</option>
                {medicos.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
            </div>

            {/* Sector + Sede */}
            <div>
              <label style={lbl}>Sector</label>
              <select style={sel} value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}>
                <option value="">— Seleccioná —</option>
                {sectores.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sede (opcional)</label>
              <select style={sel} value={form.sede} onChange={e => setForm(f => ({ ...f, sede: e.target.value }))}>
                <option value="">Sin sede específica</option>
                {sedes.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>

            {/* ── Patrón de recurrencia ── */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Patrón de recurrencia</label>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                {([
                  { key: "DIAS_SEMANA", label: "Días de la semana" },
                  { key: "NTH_SEMANA",  label: "Día del mes"       },
                ] as { key: PatronTipo; label: string }[]).map(t => (
                  <button key={t.key} onClick={() => setForm(f => ({ ...f, patronTipo: t.key }))} style={{
                    padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: form.patronTipo === t.key ? 700 : 500,
                    border: `1.5px solid ${form.patronTipo === t.key ? "rgba(21,101,192,0.60)" : "var(--border)"}`,
                    background: form.patronTipo === t.key ? "rgba(21,101,192,0.10)" : "var(--surface-2)",
                    color: form.patronTipo === t.key ? "var(--blue)" : "var(--muted)", cursor: "pointer",
                  }}>{t.label}</button>
                ))}
              </div>

              {form.patronTipo === "DIAS_SEMANA" ? (
                <div>
                  {/* Día pills */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {DIAS_SHORT.map((d, i) => {
                      const on = form.diasSemana.includes(i);
                      const isWeekend = i === 0 || i === 6;
                      return (
                        <button key={i} onClick={() => toggleDia(i)} style={{
                          width: 46, height: 46, borderRadius: 10, fontSize: 13, fontWeight: on ? 700 : 500,
                          border: `2px solid ${on ? "rgba(21,101,192,0.70)" : "var(--border)"}`,
                          background: on
                            ? isWeekend ? "rgba(217,119,6,0.15)" : "rgba(21,101,192,0.12)"
                            : "var(--surface-2)",
                          color: on
                            ? isWeekend ? "rgb(160,90,0)" : "var(--blue)"
                            : "var(--muted)",
                          cursor: "pointer", transition: "all 0.12s",
                        }}>{d}</button>
                      );
                    })}
                  </div>
                  {/* Shortcuts */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { label: "L–V",         dias: [1,2,3,4,5] },
                      { label: "Fin de sem.", dias: [0,6]       },
                      { label: "L–S",         dias: [1,2,3,4,5,6] },
                      { label: "Todos",       dias: [0,1,2,3,4,5,6] },
                      { label: "Limpiar",     dias: []          },
                    ].map(s => (
                      <button key={s.label} onClick={() => setForm(f => ({ ...f, diasSemana: s.dias }))} style={{
                        padding: "4px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 500,
                        border: "1px solid var(--border)", background: "var(--surface-2)",
                        color: "var(--muted)", cursor: "pointer",
                      }}>{s.label}</button>
                    ))}
                  </div>
                </div>
              ) : (
                /* NTH_SEMANA */
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>El</span>
                  <select style={{ ...sel, width: "auto" }} value={form.nthN} onChange={e => setForm(f => ({ ...f, nthN: Number(e.target.value) }))}>
                    {NTH_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <select style={{ ...sel, width: "auto" }} value={form.nthDiaSemana} onChange={e => setForm(f => ({ ...f, nthDiaSemana: Number(e.target.value) }))}>
                    {DIAS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>de cada mes</span>
                </div>
              )}

              {/* Preview */}
              <div style={{
                marginTop: 10, padding: "7px 12px", borderRadius: 8,
                background: "rgba(21,101,192,0.06)", border: "1px solid rgba(21,101,192,0.18)",
                fontSize: 12.5, color: "var(--blue)", fontWeight: 600,
              }}>
                Patrón: {previewPlatron(form)}
              </div>
            </div>

            {/* ── Turnos ── */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Turnos horarios</label>
              <div style={{ display: "grid", gap: 8 }}>
                {form.turnos.map((t, i) => {
                  const overnight = t.horaFin && t.horaInicio && t.horaFin < t.horaInicio;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                      padding: "10px 14px", borderRadius: 10,
                      background: "var(--surface-2)", border: "1px solid var(--border-2)",
                    }}>
                      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, minWidth: 56 }}>Turno {i + 1}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="time" style={{ ...inp, width: 110 }} value={t.horaInicio}
                          onChange={e => updateTurno(i, "horaInicio", e.target.value)} />
                        <span style={{ color: "var(--muted)", fontSize: 14 }}>→</span>
                        <input type="time" style={{ ...inp, width: 110 }} value={t.horaFin}
                          onChange={e => updateTurno(i, "horaFin", e.target.value)} />
                        {overnight && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                            background: "rgba(217,119,6,0.12)", color: "rgb(160,90,0)",
                            border: "1px solid rgba(217,119,6,0.25)",
                          }}>+1 día</span>
                        )}
                      </div>
                      {form.turnos.length > 1 && (
                        <button onClick={() => removeTurno(i)} style={{
                          marginLeft: "auto", padding: "4px 10px", borderRadius: 7,
                          border: "1px solid rgba(220,38,38,0.30)", background: "rgba(220,38,38,0.07)",
                          color: "rgb(220,38,38)", fontSize: 12, cursor: "pointer",
                        }}>✕ Quitar</button>
                      )}
                    </div>
                  );
                })}
                <button onClick={addTurno} style={{
                  padding: "8px 14px", borderRadius: 9, border: "1.5px dashed var(--border)",
                  background: "transparent", color: "var(--muted)", fontSize: 13, cursor: "pointer",
                  transition: "all 0.12s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--blue)"; (e.currentTarget as HTMLElement).style.color = "var(--blue)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--muted)"; }}
                >+ Agregar turno</button>
              </div>
            </div>

            {/* ── Vigencia ── */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Vigencia (opcional)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Desde</span>
                <input type="date" style={{ ...inp, width: 150 }} value={form.vigenciaDesde}
                  onChange={e => setForm(f => ({ ...f, vigenciaDesde: e.target.value }))} />
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>hasta</span>
                <input type="date" style={{ ...inp, width: 150 }} value={form.vigenciaHasta}
                  onChange={e => setForm(f => ({ ...f, vigenciaHasta: e.target.value }))} />
                {(form.vigenciaDesde || form.vigenciaHasta) && (
                  <button onClick={() => setForm(f => ({ ...f, vigenciaDesde: "", vigenciaHasta: "" }))}
                    style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--muted)", fontSize: 12, cursor: "pointer" }}>
                    Limpiar
                  </button>
                )}
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--subtle)" }}>
                Si no se define vigencia, la guardia fija se proyecta indefinidamente.
              </p>
            </div>

            {/* Notas */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notas</label>
              <input style={inp} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones, instrucciones…" />
            </div>

            {/* Activa */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  style={{ width: 15, height: 15 }} />
                <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>Activa</span>
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button onClick={save} style={primaryBtn}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Filtro por día ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setDiaFiltro("TODOS")} style={chipStyle(diaFiltro === "TODOS", "100,116,139")}>
          Todos ({guardias.length})
        </button>
        {DIAS_SHORT.map((d, i) => {
          const cnt = guardias.filter(g => {
            if (g.patron.tipo === "DIAS_SEMANA") return g.patron.dias.includes(i);
            if (g.patron.tipo === "NTH_SEMANA")  return g.patron.diaSemana === i;
            return false;
          }).length;
          if (!cnt) return null;
          return (
            <button key={i} onClick={() => setDiaFiltro(i)} style={chipStyle(diaFiltro === i, "21,101,192")}>
              {d} ({cnt})
            </button>
          );
        })}
      </div>

      {/* ── Tabla ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 160px 1fr 80px 80px 70px",
          padding: "8px 14px", background: "var(--surface-2)",
          borderBottom: "1px solid var(--border-2)", fontSize: 11, fontWeight: 700,
          color: "var(--muted)", letterSpacing: "0.04em",
        }}>
          <span>MÉDICO</span>
          <span>PATRÓN</span>
          <span>TURNOS</span>
          <span>SECTOR</span>
          <span style={{ textAlign: "center" }}>ESTADO</span>
          <span style={{ textAlign: "center" }}>ACCIÓN</span>
        </div>

        {visibles.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "var(--subtle)", fontSize: 13 }}>
            {guardias.length === 0 ? "No hay guardias fijas configuradas. Creá la primera." : "Sin guardias para el día seleccionado."}
          </div>
        )}

        {visibles.map((g, i) => {
          const m = medicoById.get(g.medicoId);
          return (
            <div key={g.id} style={{
              display: "grid", gridTemplateColumns: "2fr 160px 1fr 80px 80px 70px",
              padding: "10px 14px",
              borderBottom: i < visibles.length - 1 ? "1px solid var(--border-2)" : "none",
              alignItems: "center", opacity: g.activo ? 1 : 0.50,
            }}>
              {/* Médico */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {m ? <DoctorAvatar medico={m as any} size={28} /> : null}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{m?.displayName ?? g.medicoId}</div>
                  {m && <div style={{ fontSize: 10.5, color: "var(--subtle)" }}>{m.tipo} · {(m as any).gremio ?? "SMU"}</div>}
                </div>
              </div>

              {/* Patrón */}
              <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 600 }}>
                {describePlatron(g.patron)}
                {(g.vigenciaDesde || g.vigenciaHasta) && (
                  <div style={{ fontSize: 10.5, color: "var(--subtle)", marginTop: 2 }}>
                    {g.vigenciaDesde && `Desde ${g.vigenciaDesde}`}
                    {g.vigenciaDesde && g.vigenciaHasta && " "}
                    {g.vigenciaHasta && `Hasta ${g.vigenciaHasta}`}
                  </div>
                )}
              </div>

              {/* Turnos */}
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                {g.turnos.map((t, ti) => {
                  const overnight = t.horaFin < t.horaInicio;
                  return (
                    <div key={ti}>
                      {t.horaInicio}–{t.horaFin}
                      {overnight && <span style={{ fontSize: 10, color: "rgb(160,90,0)", marginLeft: 4 }}>+1d</span>}
                    </div>
                  );
                })}
              </div>

              {/* Sector */}
              <div style={{ fontSize: 12, color: "var(--text)" }}>{g.sector}</div>

              {/* Estado toggle */}
              <div style={{ textAlign: "center" }}>
                <button onClick={() => toggleActivo(g)} style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${g.activo ? "rgba(22,163,74,0.30)" : "rgba(100,116,139,0.30)"}`,
                  background: g.activo ? "rgba(22,163,74,0.10)" : "rgba(100,116,139,0.08)",
                  color: g.activo ? "rgb(22,163,74)" : "var(--muted)",
                }}>{g.activo ? "Activa" : "Inactiva"}</button>
              </div>

              {/* Acciones */}
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <button onClick={() => openEdit(g)} style={iconBtn} title="Editar">✏</button>
                <button onClick={() => remove(g)} style={{ ...iconBtn, color: "rgb(220,38,38)" }} title="Eliminar">🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Resumen por médico ── */}
      {guardias.filter(g => g.activo).length > 0 && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em", marginBottom: 10, textTransform: "uppercase" }}>
            Resumen de activas
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from(new Set(guardias.filter(g => g.activo).map(g => g.medicoId))).map(mid => {
              const m   = medicoById.get(mid);
              const gs  = guardias.filter(g => g.medicoId === mid && g.activo);
              return (
                <div key={mid} style={{
                  padding: "7px 12px", borderRadius: 9,
                  background: "var(--surface-2)", border: "1px solid var(--border-2)", fontSize: 12,
                }}>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>{m?.displayName ?? mid}</span>
                  <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11.5 }}>
                    {gs.map(g => `${describePlatron(g.patron)} · ${describeTurnos(g.turnos)}`).join("  |  ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────────────
function chipStyle(active: boolean, rgb: string): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
    border: `1.5px solid ${active ? `rgba(${rgb},0.60)` : "var(--border-2)"}`,
    background: active ? `rgba(${rgb},0.12)` : "var(--surface-2)",
    color: active ? `rgb(${rgb})` : "var(--muted)",
    cursor: "pointer", transition: "all 0.12s",
  };
}

const base: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9, boxSizing: "border-box",
  border: "1.5px solid var(--border)", background: "var(--surface-2)",
  fontSize: 13.5, color: "var(--text)", fontFamily: "inherit",
};
const inp: React.CSSProperties = { ...base };
const sel: React.CSSProperties = { ...base, cursor: "pointer" };
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em",
};
const primaryBtn: React.CSSProperties = {
  padding: "9px 22px", borderRadius: 9, border: "none",
  background: "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
  boxShadow: "0 2px 6px rgba(21,101,192,0.25)",
};
const ghostBtn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--muted)", fontSize: 13.5, cursor: "pointer",
};
const iconBtn: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--surface)",
  fontSize: 13, cursor: "pointer", color: "var(--muted)",
};
