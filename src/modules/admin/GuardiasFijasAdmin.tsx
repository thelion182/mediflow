import React, { useMemo, useState } from "react";
import { guardiasFijasStore, GuardiaFija } from "./guardias-fijas.store";
import { medicosStore } from "./medicos.store";
import { sectoresStore } from "./sectores.store";
import { sedesStore } from "./sedes.store";
import { DoctorAvatar } from "./DoctorAvatar";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const EMPTY_FORM = {
  medicoId: "",
  diaSemana: 1,
  horaInicio: "08:00",
  horaFin: "20:00",
  sector: "",
  sede: "",
  notas: "",
  activo: true,
};

export function GuardiasFijasAdmin() {
  const [tick, setTick] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GuardiaFija | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [diaFiltro, setDiaFiltro] = useState<number | "TODOS">("TODOS");

  const guardias = useMemo(() => guardiasFijasStore.list(), [tick]);
  const medicos  = useMemo(() => medicosStore.list().filter(m => m.activo), [tick]);
  const sectores = useMemo(() => sectoresStore.list().filter((s: any) => s.activo ?? true), [tick]);
  const sedes    = useMemo(() => sedesStore.list().filter((s: any) => s.activo ?? true), [tick]);

  const medicoById = useMemo(() => {
    const map = new Map<string, (typeof medicos)[0]>();
    for (const m of medicos) map.set(m.userId, m);
    return map;
  }, [medicos]);

  const visibles = useMemo(() => {
    let list = guardias;
    if (diaFiltro !== "TODOS") list = list.filter(g => g.diaSemana === diaFiltro);
    return list.sort((a, b) => {
      if (a.diaSemana !== b.diaSemana) return a.diaSemana - b.diaSemana;
      return a.horaInicio.localeCompare(b.horaInicio);
    });
  }, [guardias, diaFiltro]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sector: sectores[0]?.nombre ?? "", medicoId: medicos[0]?.userId ?? "" });
    setShowForm(true);
  }

  function openEdit(g: GuardiaFija) {
    setEditing(g);
    setForm({ medicoId: g.medicoId, diaSemana: g.diaSemana, horaInicio: g.horaInicio, horaFin: g.horaFin, sector: g.sector, sede: g.sede ?? "", notas: g.notas ?? "", activo: g.activo });
    setShowForm(true);
  }

  function save() {
    if (!form.medicoId) return alert("Seleccioná un médico.");
    if (!form.sector)   return alert("Seleccioná un sector.");
    if (!form.horaInicio || !form.horaFin) return alert("Horario obligatorio.");
    if (form.horaFin <= form.horaInicio) return alert("Hora fin debe ser posterior a inicio.");

    const data = {
      medicoId: form.medicoId,
      diaSemana: form.diaSemana,
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      sector: form.sector,
      sede: form.sede.trim() || undefined,
      notas: form.notas.trim() || undefined,
      activo: form.activo,
    };

    if (editing) {
      guardiasFijasStore.update(editing.id, data);
    } else {
      guardiasFijasStore.add(data);
    }
    setShowForm(false);
    setTick(t => t + 1);
  }

  function toggleActivo(g: GuardiaFija) {
    guardiasFijasStore.update(g.id, { activo: !g.activo });
    setTick(t => t + 1);
  }

  function remove(g: GuardiaFija) {
    const m = medicoById.get(g.medicoId);
    if (!confirm(`Eliminar guardia fija de ${m?.displayName ?? g.medicoId} (${DIAS_FULL[g.diaSemana]} ${g.horaInicio}–${g.horaFin})?`)) return;
    guardiasFijasStore.remove(g.id);
    setTick(t => t + 1);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Info + acciones */}
      <div style={{
        padding: "10px 16px", borderRadius: 10,
        background: "rgba(21,101,192,0.06)", border: "1px solid rgba(21,101,192,0.15)",
        fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <span>
          <b style={{ color: "var(--blue)" }}>Guardias Fijas.</b> Asignaciones recurrentes que se auto-completan en el Parte Diario.
          Las guardias activas se proyectan automáticamente según el día de la semana.
        </span>
        <button onClick={openNew} style={{
          marginLeft: "auto", padding: "7px 16px", borderRadius: 8,
          border: "none", background: "var(--blue)", color: "#fff",
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          boxShadow: "0 2px 6px rgba(21,101,192,0.25)",
        }}>+ Nueva guardia fija</button>
      </div>

      {/* Filtro por día */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setDiaFiltro("TODOS")} style={chipStyle(diaFiltro === "TODOS", "100,116,139")}>
          Todos ({guardias.length})
        </button>
        {DIAS.map((d, i) => {
          const cnt = guardias.filter(g => g.diaSemana === i).length;
          return (
            <button key={i} onClick={() => setDiaFiltro(i)} style={chipStyle(diaFiltro === i, "21,101,192")}>
              {d} {cnt > 0 ? `(${cnt})` : ""}
            </button>
          );
        })}
      </div>

      {/* Formulario modal inline */}
      {showForm && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "20px 22px", boxShadow: "var(--shadow-md)",
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>
            {editing ? "Editar guardia fija" : "Nueva guardia fija"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Médico</label>
              <select style={sel} value={form.medicoId} onChange={e => setForm(f => ({ ...f, medicoId: e.target.value }))}>
                <option value="">— Seleccioná —</option>
                {medicos.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Día de la semana</label>
              <select style={sel} value={form.diaSemana} onChange={e => setForm(f => ({ ...f, diaSemana: Number(e.target.value) }))}>
                {DIAS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Sector</label>
              <select style={sel} value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}>
                <option value="">— Seleccioná —</option>
                {sectores.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Hora inicio</label>
              <input type="time" style={inp} value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
            </div>

            <div>
              <label style={lbl}>Hora fin</label>
              <input type="time" style={inp} value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Sede (opcional)</label>
              <select style={sel} value={form.sede} onChange={e => setForm(f => ({ ...f, sede: e.target.value }))}>
                <option value="">Sin sede específica</option>
                {sedes.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notas</label>
              <input style={inp} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones…" />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} style={{ width: 15, height: 15 }} />
                <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>Activa</span>
              </label>
            </div>

          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={save} style={{
              padding: "9px 22px", borderRadius: 9, border: "none",
              background: "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
            }}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={{
              padding: "9px 16px", borderRadius: 9,
              border: "1px solid var(--border)", background: "var(--surface-2)",
              color: "var(--muted)", fontSize: 13.5, cursor: "pointer",
            }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 80px 120px 100px 100px 80px 80px",
          padding: "8px 14px", background: "var(--surface-2)",
          borderBottom: "1px solid var(--border-2)", fontSize: 11, fontWeight: 700,
          color: "var(--muted)", letterSpacing: "0.04em",
        }}>
          <span>MÉDICO</span>
          <span style={{ textAlign: "center" }}>DÍA</span>
          <span style={{ textAlign: "center" }}>HORARIO</span>
          <span>SECTOR</span>
          <span>SEDE</span>
          <span style={{ textAlign: "center" }}>ESTADO</span>
          <span style={{ textAlign: "center" }}>ACCIONES</span>
        </div>

        {visibles.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "var(--subtle)", fontSize: 13 }}>
            {guardias.length === 0 ? "No hay guardias fijas configuradas." : "Sin guardias para el día seleccionado."}
          </div>
        )}

        {visibles.map((g, i) => {
          const m = medicoById.get(g.medicoId);
          return (
            <div key={g.id} style={{
              display: "grid",
              gridTemplateColumns: "2fr 80px 120px 100px 100px 80px 80px",
              padding: "10px 14px",
              borderBottom: i < visibles.length - 1 ? "1px solid var(--border-2)" : "none",
              alignItems: "center",
              opacity: g.activo ? 1 : 0.55,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {m ? <DoctorAvatar medico={m as any} size={28} /> : null}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                    {m?.displayName ?? g.medicoId}
                  </div>
                  {m && (
                    <div style={{ fontSize: 10.5, color: "var(--subtle)" }}>{m.tipo} · {(m as any).gremio ?? "SMU"}</div>
                  )}
                </div>
              </div>

              <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, color: "var(--blue)" }}>
                {DIAS[g.diaSemana]}
              </div>

              <div style={{ textAlign: "center", fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                {g.horaInicio} – {g.horaFin}
              </div>

              <div style={{ fontSize: 12.5, color: "var(--text)" }}>{g.sector}</div>

              <div style={{ fontSize: 12, color: "var(--muted)" }}>{g.sede ?? "—"}</div>

              <div style={{ textAlign: "center" }}>
                <button onClick={() => toggleActivo(g)} style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${g.activo ? "rgba(22,163,74,0.30)" : "rgba(100,116,139,0.30)"}`,
                  background: g.activo ? "rgba(22,163,74,0.10)" : "rgba(100,116,139,0.08)",
                  color: g.activo ? "rgb(22,163,74)" : "var(--muted)",
                }}>
                  {g.activo ? "Activa" : "Inactiva"}
                </button>
              </div>

              <div style={{ textAlign: "center", display: "flex", gap: 4, justifyContent: "center" }}>
                <button onClick={() => openEdit(g)} style={iconBtn} title="Editar">✏</button>
                <button onClick={() => remove(g)} style={{ ...iconBtn, color: "rgb(220,38,38)" }} title="Eliminar">🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen por médico */}
      {guardias.length > 0 && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em", marginBottom: 10, textTransform: "uppercase" }}>
            Resumen por médico
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from(new Set(guardias.filter(g => g.activo).map(g => g.medicoId))).map(mid => {
              const m = medicoById.get(mid);
              const gs = guardias.filter(g => g.medicoId === mid && g.activo);
              return (
                <div key={mid} style={{
                  padding: "6px 12px", borderRadius: 8,
                  background: "var(--surface-2)", border: "1px solid var(--border-2)",
                  fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{m?.displayName ?? mid}</span>
                  <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                    {gs.map(g => `${DIAS[g.diaSemana]} ${g.horaInicio}`).join(", ")}
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

function chipStyle(active: boolean, rgb: string): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
    border: `1.5px solid ${active ? `rgba(${rgb},0.60)` : "var(--border-2)"}`,
    background: active ? `rgba(${rgb},0.12)` : "var(--surface-2)",
    color: active ? `rgb(${rgb})` : "var(--muted)",
    cursor: "pointer", transition: "all 0.12s",
  };
}

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em",
};
const baseInput: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9, boxSizing: "border-box",
  border: "1.5px solid var(--border)", background: "var(--surface-2)",
  fontSize: 13.5, color: "var(--text)", fontFamily: "inherit",
};
const inp: React.CSSProperties = { ...baseInput };
const sel: React.CSSProperties = { ...baseInput, cursor: "pointer" };
const iconBtn: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--surface)",
  fontSize: 13, cursor: "pointer", color: "var(--muted)",
};
