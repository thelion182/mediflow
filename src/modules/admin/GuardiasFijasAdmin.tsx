import React, { useMemo, useRef, useState } from "react";
import { guardiasFijasStore, describePlatron } from "./guardias-fijas.store";
import type { GuardiaFija, PatronDias, Turno } from "./guardias-fijas.store";
import { medicosStore } from "./medicos.store";
import { sedesStore } from "./sedes.store";
import { sectoresStore } from "./sectores.store";
import { DoctorAvatar } from "./DoctorAvatar";

// ── Constants ────────────────────────────────────────────────────────────────
const DIAS_FULL  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DIAS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const NTH_OPTS   = [
  { v: 1, l: "1° (primero)" }, { v: 2, l: "2° (segundo)" },
  { v: 3, l: "3° (tercero)" }, { v: 4, l: "4° (cuarto)" }, { v: -1, l: "Último" },
];
type PatronTipo = "DIAS_SEMANA" | "NTH_SEMANA";

// ── Styles (declared early so PatronEditor can use them) ─────────────────────
const baseInput: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8, boxSizing: "border-box",
  border: "1.5px solid var(--border)", background: "var(--surface-2)",
  fontSize: 13, color: "var(--text)", fontFamily: "inherit",
};
const inp: React.CSSProperties = { ...baseInput };
const sel: React.CSSProperties = { ...baseInput, cursor: "pointer" };
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em",
};
const pBtn: React.CSSProperties = {
  padding: "9px 20px", borderRadius: 9, border: "none",
  background: "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const gBtn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--muted)", fontSize: 13, cursor: "pointer",
};
const iBtn: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--surface)",
  fontSize: 13, cursor: "pointer", color: "var(--muted)",
};

function chip(active: boolean, rgb: string): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
    border: `1.5px solid ${active ? `rgba(${rgb},0.60)` : "var(--border-2)"}`,
    background: active ? `rgba(${rgb},0.12)` : "var(--surface-2)",
    color: active ? `rgb(${rgb})` : "var(--muted)",
    cursor: "pointer", transition: "all 0.12s",
  };
}

// ── CSV utilities ────────────────────────────────────────────────────────────
function csvFields(line: string): string[] {
  const out: string[] = [];
  let f = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(f.trim()); f = ''; }
    else f += ch;
  }
  out.push(f.trim());
  return out;
}

function parseWD(s: string): number | null {
  const n = parseInt(s);
  if (!isNaN(n) && n >= 0 && n <= 6) return n;
  const norm = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const map: Record<string, number> = {
    dom: 0, domingo: 0, lun: 1, lunes: 1, mar: 2, martes: 2,
    mie: 3, miercoles: 3, jue: 4, jueves: 4, vie: 5, viernes: 5, sab: 6, sabado: 6,
  };
  return map[norm] ?? null;
}

type CsvRow =
  | { ok: true;  data: Omit<GuardiaFija, "id">; row: number }
  | { ok: false; err: string; row: number; raw: string };

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  if (lines.length < 2) return [];
  const headers = csvFields(lines[0]).map(h =>
    h.toLowerCase().replace(/[\s-]/g, "_").replace(/[^a-z_]/g, "")
  );
  const gi = (k: string) => headers.indexOf(k);
  return lines.slice(1).map((raw, i) => {
    const row = i + 2;
    const cols = csvFields(raw);
    const g = (k: string) => (cols[gi(k)] ?? "").trim();
    const medicoId   = g("medico_id");
    const horaInicio = g("hora_inicio");
    const horaFin    = g("hora_fin");
    const sector     = g("sector");
    const timeRx     = /^\d{2}:\d{2}$/;
    const dateRx     = /^\d{4}-\d{2}-\d{2}$/;
    if (!medicoId)                return { ok: false as const, err: "medico_id vacío", row, raw };
    if (!timeRx.test(horaInicio)) return { ok: false as const, err: `hora_inicio: "${horaInicio}"`, row, raw };
    if (!timeRx.test(horaFin))    return { ok: false as const, err: `hora_fin: "${horaFin}"`, row, raw };
    if (!sector)                  return { ok: false as const, err: "sector vacío", row, raw };
    const vd = g("vigencia_desde"), vh = g("vigencia_hasta");
    if (vd && !dateRx.test(vd))   return { ok: false as const, err: `vigencia_desde: "${vd}"`, row, raw };
    if (vh && !dateRx.test(vh))   return { ok: false as const, err: `vigencia_hasta: "${vh}"`, row, raw };
    let patron: PatronDias;
    if (g("patron_tipo").toUpperCase() === "NTH_SEMANA") {
      const nth = parseInt(g("nth_numero"));
      const dia = parseWD(g("nth_dia_semana"));
      if (isNaN(nth) || ![1,2,3,4,-1].includes(nth))
        return { ok: false as const, err: `nth_numero: "${g("nth_numero")}"`, row, raw };
      if (dia === null)
        return { ok: false as const, err: `nth_dia_semana: "${g("nth_dia_semana")}"`, row, raw };
      patron = { tipo: "NTH_SEMANA", diaSemana: dia, nth };
    } else {
      const dias = g("dias_semana").split(",")
        .map(d => parseWD(d.trim())).filter((d): d is number => d !== null);
      if (!dias.length)
        return { ok: false as const, err: `dias_semana: "${g("dias_semana")}"`, row, raw };
      patron = { tipo: "DIAS_SEMANA", dias: [...new Set(dias)].sort() };
    }
    return {
      ok: true as const, row,
      data: {
        medicoId, patron, turnos: [{ horaInicio, horaFin }], sector,
        sede: g("sede") || undefined, notas: g("notas") || undefined, activo: true,
        vigenciaDesde: vd || undefined, vigenciaHasta: vh || undefined,
      },
    };
  });
}

const CSV_TEMPLATE = [
  "medico_id,patron_tipo,dias_semana,nth_numero,nth_dia_semana,hora_inicio,hora_fin,sector,sede,notas,vigencia_desde,vigencia_hasta",
  "# Lunes a viernes, turno mañana:",
  'F-93598,DIAS_SEMANA,"1,2,3,4,5",,,08:00,14:00,Guardia,Central Lenguas,,',
  "# Fin de semana, turno nocturno (termina dia siguiente):",
  'F-93598,DIAS_SEMANA,"0,6",,,20:00,08:00,Guardia,,Turno nocturno,',
  "# Primer viernes de cada mes:",
  "F-2001,NTH_SEMANA,,,5,08:00,20:00,Policlinica,,Primer viernes del mes,",
  "# Con vigencia definida:",
  'F-93598,DIAS_SEMANA,"1,2,3,4,5",,,14:00,20:00,Guardia,,Turno tarde,2026-06-01,2026-12-31',
].join("\n");

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "guardias-fijas-plantilla.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Patron preview label ─────────────────────────────────────────────────────
function patronLabel(tipo: PatronTipo, dias: number[], nthN: number, nthDia: number): string {
  if (tipo === "NTH_SEMANA") {
    const l = NTH_OPTS.find(o => o.v === nthN)?.l ?? nthN;
    return `${l} ${DIAS_FULL[nthDia]} de cada mes`;
  }
  const s = [...dias].sort();
  if (!s.length) return "Ningún día seleccionado";
  const j = JSON.stringify(s);
  if (j === "[1,2,3,4,5]")   return "Lunes a Viernes";
  if (j === "[0,6]")          return "Fin de semana";
  if (j === "[1,2,3,4,5,6]") return "Lunes a Sábado";
  if (s.length === 7)         return "Todos los días";
  return s.map(d => DIAS_SHORT[d]).join(", ");
}

// ── PatronEditor sub-component ───────────────────────────────────────────────
function PatronEditor({
  tipo, dias, nthN, nthDia, onChange,
}: {
  tipo: PatronTipo; dias: number[]; nthN: number; nthDia: number;
  onChange: (u: Partial<{ tipo: PatronTipo; dias: number[]; nthN: number; nthDia: number }>) => void;
}) {
  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {([
          ["DIAS_SEMANA", "Días de la semana"],
          ["NTH_SEMANA",  "Día del mes"],
        ] as [PatronTipo, string][]).map(([k, label]) => (
          <button key={k} onClick={() => onChange({ tipo: k })} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12.5, cursor: "pointer",
            fontWeight: tipo === k ? 700 : 500,
            border: `1.5px solid ${tipo === k ? "rgba(21,101,192,0.60)" : "var(--border)"}`,
            background: tipo === k ? "rgba(21,101,192,0.10)" : "var(--surface-2)",
            color: tipo === k ? "var(--blue)" : "var(--muted)",
          }}>{label}</button>
        ))}
      </div>

      {tipo === "DIAS_SEMANA" ? (
        <div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {DIAS_SHORT.map((d, i) => {
              const on = dias.includes(i), wend = i === 0 || i === 6;
              return (
                <button key={i}
                  onClick={() => onChange({ dias: on ? dias.filter(x => x !== i) : [...dias, i] })}
                  style={{
                    width: 44, height: 44, borderRadius: 9, fontSize: 12.5,
                    fontWeight: on ? 700 : 500, cursor: "pointer",
                    border: `2px solid ${on ? "rgba(21,101,192,0.65)" : "var(--border)"}`,
                    background: on ? (wend ? "rgba(217,119,6,0.12)" : "rgba(21,101,192,0.12)") : "var(--surface-2)",
                    color: on ? (wend ? "rgb(146,64,14)" : "var(--blue)") : "var(--muted)",
                    transition: "all 0.10s",
                  }}>{d}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[
              { l: "L–V",      d: [1,2,3,4,5] },
              { l: "L–S",      d: [1,2,3,4,5,6] },
              { l: "Fin sem.", d: [0,6] },
              { l: "Todos",    d: [0,1,2,3,4,5,6] },
              { l: "Limpiar",  d: [] },
            ].map(s => (
              <button key={s.l} onClick={() => onChange({ dias: s.d })} style={{
                padding: "3px 11px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                border: "1px solid var(--border-2)", background: "var(--surface-2)", color: "var(--muted)",
              }}>{s.l}</button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>El</span>
          <select value={nthN} onChange={e => onChange({ nthN: Number(e.target.value) })}
            style={{ ...sel, width: "auto" }}>
            {NTH_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <select value={nthDia} onChange={e => onChange({ nthDia: Number(e.target.value) })}
            style={{ ...sel, width: "auto" }}>
            {DIAS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>de cada mes</span>
        </div>
      )}

      {/* Preview */}
      <div style={{
        marginTop: 10, padding: "7px 12px", borderRadius: 8,
        background: "rgba(21,101,192,0.06)", border: "1px solid rgba(21,101,192,0.15)",
        fontSize: 12.5, color: "var(--blue)", fontWeight: 600,
      }}>
        Patrón: {patronLabel(tipo, dias, nthN, nthDia)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type Mode = "none" | "create" | "edit" | "csv";
type StagedItem = { patron: PatronDias; turno: Turno };

const DEF = {
  medicoId: "", sector: "", sede: "", notas: "", vigDesde: "", vigHasta: "",
  tipo: "DIAS_SEMANA" as PatronTipo, dias: [1,2,3,4,5] as number[],
  nthN: 1, nthDia: 5, horaInicio: "08:00", horaFin: "20:00",
};

export function GuardiasFijasAdmin() {
  const [tick,   setTick]   = useState(0);
  const [mode,   setMode]   = useState<Mode>("none");
  const [filtro, setFiltro] = useState<number | "TODOS">("TODOS");
  const fileRef = useRef<HTMLInputElement>(null);

  const [cr, setCr]         = useState({ ...DEF });
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [ed, setEd]         = useState({ ...DEF, activo: true });
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);

  const guardias = useMemo(() => guardiasFijasStore.list(), [tick]);
  const medicos  = useMemo(() => medicosStore.list().filter(m => m.activo), [tick]);
  const sectores = useMemo(() => sectoresStore.list().filter((s: any) => s.activo ?? true), [tick]);
  const sedes    = useMemo(() => sedesStore.list().filter((s: any) => s.activo ?? true), [tick]);
  const medMap   = useMemo(() => {
    const m = new Map<string, (typeof medicos)[0]>();
    for (const x of medicos) m.set(x.userId, x);
    return m;
  }, [medicos]);

  const visible = useMemo(() =>
    filtro === "TODOS" ? guardias : guardias.filter(g =>
      g.patron.tipo === "DIAS_SEMANA" ? g.patron.dias.includes(filtro as number)
      : g.patron.tipo === "NTH_SEMANA" ? g.patron.diaSemana === filtro : false
    ),
  [guardias, filtro]);

  // ── Create ────────────────────────────────────────────────────────────────
  function openCreate() {
    setCr({ ...DEF, medicoId: medicos[0]?.userId ?? "", sector: sectores[0]?.nombre ?? "" });
    setStaged([]);
    setMode("create");
  }

  function addHorario() {
    if (cr.tipo === "DIAS_SEMANA" && !cr.dias.length) {
      alert("Seleccioná al menos un día."); return;
    }
    const patron: PatronDias = cr.tipo === "NTH_SEMANA"
      ? { tipo: "NTH_SEMANA", diaSemana: cr.nthDia, nth: cr.nthN }
      : { tipo: "DIAS_SEMANA", dias: [...cr.dias].sort() };
    setStaged(s => [...s, { patron, turno: { horaInicio: cr.horaInicio, horaFin: cr.horaFin } }]);
  }

  function saveCreate() {
    if (!cr.medicoId) { alert("Seleccioná un médico."); return; }
    if (!cr.sector)   { alert("Seleccioná un sector."); return; }
    if (!staged.length) { alert("Agregá al menos un horario con el botón '➕ Agregar horario'."); return; }
    for (const h of staged) {
      guardiasFijasStore.add({
        medicoId: cr.medicoId, patron: h.patron, turnos: [h.turno],
        sector: cr.sector, sede: cr.sede || undefined, notas: cr.notas || undefined, activo: true,
        vigenciaDesde: cr.vigDesde || undefined, vigenciaHasta: cr.vigHasta || undefined,
      });
    }
    setMode("none"); setStaged([]); setTick(t => t + 1);
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  function openEdit(g: GuardiaFija) {
    setEditId(g.id);
    const tipo: PatronTipo = g.patron.tipo === "NTH_SEMANA" ? "NTH_SEMANA" : "DIAS_SEMANA";
    setEd({
      medicoId: g.medicoId, sector: g.sector, sede: g.sede ?? "", notas: g.notas ?? "",
      vigDesde: g.vigenciaDesde ?? "", vigHasta: g.vigenciaHasta ?? "",
      tipo,
      dias:    g.patron.tipo === "DIAS_SEMANA" ? g.patron.dias : [1,2,3,4,5],
      nthN:    g.patron.tipo === "NTH_SEMANA"  ? g.patron.nth : 1,
      nthDia:  g.patron.tipo === "NTH_SEMANA"  ? g.patron.diaSemana : 5,
      horaInicio: g.turnos[0]?.horaInicio ?? "08:00",
      horaFin:    g.turnos[0]?.horaFin   ?? "20:00",
      activo: g.activo,
    });
    setMode("edit");
  }

  function saveEdit() {
    if (!editId) return;
    const patron: PatronDias = ed.tipo === "NTH_SEMANA"
      ? { tipo: "NTH_SEMANA", diaSemana: ed.nthDia, nth: ed.nthN }
      : { tipo: "DIAS_SEMANA", dias: [...ed.dias].sort() };
    guardiasFijasStore.update(editId, {
      medicoId: ed.medicoId, patron, turnos: [{ horaInicio: ed.horaInicio, horaFin: ed.horaFin }],
      sector: ed.sector, sede: ed.sede || undefined, notas: ed.notas || undefined, activo: ed.activo,
      vigenciaDesde: ed.vigDesde || undefined, vigenciaHasta: ed.vigHasta || undefined,
    });
    setMode("none"); setEditId(null); setTick(t => t + 1);
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  function handleFile(f: File) {
    const r = new FileReader();
    r.onload = ev => setCsvRows(parseCsv(ev.target?.result as string ?? ""));
    r.readAsText(f, "utf-8");
  }

  function confirmImport() {
    const valid = csvRows.filter(r => r.ok) as Extract<CsvRow, { ok: true }>[];
    if (!valid.length) { alert("Sin filas válidas para importar."); return; }
    for (const r of valid) guardiasFijasStore.add(r.data);
    setCsvRows([]); setMode("none"); setTick(t => t + 1);
  }

  // ── Misc ──────────────────────────────────────────────────────────────────
  function toggleActivo(g: GuardiaFija) {
    guardiasFijasStore.update(g.id, { activo: !g.activo }); setTick(t => t + 1);
  }
  function remove(g: GuardiaFija) {
    const m = medMap.get(g.medicoId);
    if (!confirm(`Eliminar guardia fija de ${m?.displayName ?? g.medicoId}?`)) return;
    guardiasFijasStore.remove(g.id); setTick(t => t + 1);
  }
  const isON = (hi: string, hf: string) => !!(hf && hi && hf < hi);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* ── Banner ── */}
      <div style={{
        padding: "10px 16px", borderRadius: 10,
        background: "rgba(21,101,192,0.06)", border: "1px solid rgba(21,101,192,0.15)",
        fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ flex: 1 }}>
          <b style={{ color: "var(--blue)" }}>Guardias Fijas.</b> Turnos recurrentes proyectados automáticamente en el Parte Diario con indicador <b>FIJA</b>.
        </span>
        <button onClick={openCreate} style={pBtn}>+ Nueva guardia fija</button>
        <button
          onClick={() => { setMode(mode === "csv" ? "none" : "csv"); setCsvRows([]); }}
          style={gBtn}
        >⬆ Importar CSV</button>
      </div>

      {/* ══════════════════ CREAR ══════════════════ */}
      {mode === "create" && (
        <div style={{
          background: "var(--surface)", border: "1.5px solid var(--blue)",
          borderRadius: 14, padding: "20px 22px",
          boxShadow: "0 4px 20px rgba(21,101,192,0.10)", display: "grid", gap: 18,
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Nueva guardia fija</h3>

          {/* Context: médico + lugar */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Médico *</label>
              <select style={sel} value={cr.medicoId} onChange={e => setCr(f => ({ ...f, medicoId: e.target.value }))}>
                <option value="">— Seleccioná —</option>
                {medicos.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sector *</label>
              <select style={sel} value={cr.sector} onChange={e => setCr(f => ({ ...f, sector: e.target.value }))}>
                <option value="">— Seleccioná —</option>
                {sectores.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sede (opcional)</label>
              <select style={sel} value={cr.sede} onChange={e => setCr(f => ({ ...f, sede: e.target.value }))}>
                <option value="">Sin sede específica</option>
                {sedes.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Vigencia desde</label>
              <input type="date" style={inp} value={cr.vigDesde}
                onChange={e => setCr(f => ({ ...f, vigDesde: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Vigencia hasta</label>
              <input type="date" style={inp} value={cr.vigHasta}
                onChange={e => setCr(f => ({ ...f, vigHasta: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notas</label>
              <input style={inp} value={cr.notas}
                onChange={e => setCr(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones…" />
            </div>
          </div>

          {/* Horario builder */}
          <div style={{
            padding: "16px 18px", borderRadius: 12,
            background: "var(--surface-2)", border: "1px solid var(--border-2)",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--muted)",
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14,
            }}>
              Construir horario
            </div>

            <PatronEditor
              tipo={cr.tipo} dias={cr.dias} nthN={cr.nthN} nthDia={cr.nthDia}
              onChange={u => setCr(f => ({ ...f, ...u }))}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Horario:</span>
              <input type="time" style={{ ...inp, width: 110 }} value={cr.horaInicio}
                onChange={e => setCr(f => ({ ...f, horaInicio: e.target.value }))} />
              <span style={{ color: "var(--muted)", fontSize: 16 }}>→</span>
              <input type="time" style={{ ...inp, width: 110 }} value={cr.horaFin}
                onChange={e => setCr(f => ({ ...f, horaFin: e.target.value }))} />
              {isON(cr.horaInicio, cr.horaFin) && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  background: "rgba(217,119,6,0.12)", color: "rgb(146,64,14)",
                  border: "1px solid rgba(217,119,6,0.25)",
                }}>+1 día</span>
              )}
              <button onClick={addHorario} style={{
                ...pBtn, marginLeft: "auto",
                background: "rgb(22,163,74)",
                boxShadow: "0 2px 8px rgba(22,163,74,0.25)",
              }}>
                ➕ Agregar horario
              </button>
            </div>
          </div>

          {/* Staging list */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--muted)",
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              Horarios agregados
              {staged.length > 0 && (
                <span style={{
                  padding: "1px 8px", borderRadius: 20,
                  background: "rgba(109,191,60,0.15)", color: "rgb(45,122,15)",
                  fontSize: 12, fontWeight: 700,
                }}>{staged.length}</span>
              )}
            </div>

            {staged.length === 0 ? (
              <div style={{
                padding: "24px", textAlign: "center", borderRadius: 12,
                border: "1.5px dashed var(--border-2)", color: "var(--subtle)", fontSize: 13,
              }}>
                Todavía no agregaste ningún horario.<br />
                <span style={{ fontSize: 12 }}>Configurá el patrón y la hora arriba y hacé clic en <b>➕ Agregar horario</b>.</span>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {staged.map((item, i) => {
                  const night = isON(item.turno.horaInicio, item.turno.horaFin);
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                      padding: "10px 14px", borderRadius: 10,
                      background: "rgba(109,191,60,0.07)", border: "1px solid rgba(109,191,60,0.25)",
                    }}>
                      <div style={{
                        padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                        background: "rgba(109,191,60,0.15)", color: "rgb(45,122,15)",
                        whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5,
                      }}>
                        {item.turno.horaInicio} → {item.turno.horaFin}
                        {night && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "rgb(146,64,14)" }}>+1d</span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", flex: 1 }}>
                        {describePlatron(item.patron)}
                      </div>
                      <button
                        onClick={() => setStaged(s => s.filter((_, j) => j !== i))}
                        style={{
                          padding: "3px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                          border: "1px solid rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.07)",
                          color: "rgb(220,38,38)",
                        }}
                      >✕ Quitar</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={saveCreate}
              style={{
                ...pBtn,
                opacity: staged.length ? 1 : 0.45,
                cursor: staged.length ? "pointer" : "not-allowed",
                background: staged.length ? "var(--blue)" : "var(--muted)",
              }}
            >
              Guardar {staged.length > 0
                ? `${staged.length} horario${staged.length > 1 ? "s" : ""}`
                : ""}
            </button>
            <button onClick={() => { setMode("none"); setStaged([]); }} style={gBtn}>Cancelar</button>
            {staged.length > 0 && (
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>
                → {staged.length} registro{staged.length > 1 ? "s" : ""} nuevo{staged.length > 1 ? "s" : ""} para {medMap.get(cr.medicoId)?.displayName ?? cr.medicoId || "médico sin seleccionar"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ EDITAR ══════════════════ */}
      {mode === "edit" && (
        <div style={{
          background: "var(--surface)", border: "1.5px solid rgba(217,119,6,0.50)",
          borderRadius: 14, padding: "20px 22px",
          boxShadow: "0 4px 20px rgba(217,119,6,0.08)", display: "grid", gap: 14,
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Editar guardia fija</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Médico</label>
              <select style={sel} value={ed.medicoId}
                onChange={e => setEd(f => ({ ...f, medicoId: e.target.value }))}>
                {medicos.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sector</label>
              <select style={sel} value={ed.sector}
                onChange={e => setEd(f => ({ ...f, sector: e.target.value }))}>
                {sectores.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sede</label>
              <select style={sel} value={ed.sede}
                onChange={e => setEd(f => ({ ...f, sede: e.target.value }))}>
                <option value="">Sin sede</option>
                {sedes.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={lbl}>Patrón de recurrencia</label>
            <PatronEditor
              tipo={ed.tipo} dias={ed.dias} nthN={ed.nthN} nthDia={ed.nthDia}
              onChange={u => setEd(f => ({ ...f, ...u }))}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Horario:</span>
            <input type="time" style={{ ...inp, width: 110 }} value={ed.horaInicio}
              onChange={e => setEd(f => ({ ...f, horaInicio: e.target.value }))} />
            <span style={{ color: "var(--muted)", fontSize: 16 }}>→</span>
            <input type="time" style={{ ...inp, width: 110 }} value={ed.horaFin}
              onChange={e => setEd(f => ({ ...f, horaFin: e.target.value }))} />
            {isON(ed.horaInicio, ed.horaFin) && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: "rgba(217,119,6,0.12)", color: "rgb(146,64,14)",
              }}>+1 día</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Vigencia desde</label>
              <input type="date" style={inp} value={ed.vigDesde}
                onChange={e => setEd(f => ({ ...f, vigDesde: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Vigencia hasta</label>
              <input type="date" style={inp} value={ed.vigHasta}
                onChange={e => setEd(f => ({ ...f, vigHasta: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notas</label>
              <input style={inp} value={ed.notas}
                onChange={e => setEd(f => ({ ...f, notas: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={ed.activo}
                onChange={e => setEd(f => ({ ...f, activo: e.target.checked }))}
                style={{ width: 15, height: 15 }} />
              Activa
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveEdit} style={{ ...pBtn, background: "rgb(217,119,6)" }}>
                Guardar cambios
              </button>
              <button onClick={() => { setMode("none"); setEditId(null); }} style={gBtn}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ CSV IMPORT ══════════════════ */}
      {mode === "csv" && (
        <div style={{
          background: "var(--surface)", border: "1.5px solid rgba(109,191,60,0.45)",
          borderRadius: 14, padding: "20px 22px",
          boxShadow: "0 4px 20px rgba(109,191,60,0.08)", display: "grid", gap: 16,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>
                Importar guardias fijas desde CSV
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.6, maxWidth: 560 }}>
                Una fila por guardia. Para <b>DIAS_SEMANA</b>: completar <code>dias_semana</code> (ej. <code>"1,2,3,4,5"</code> o <code>lun,mar</code>).
                Para <b>NTH_SEMANA</b>: completar <code>nth_numero</code> (1–4 o -1) y <code>nth_dia_semana</code> (0–6 o nombre).
                Las líneas con <code>#</code> se ignoran.
              </p>
            </div>
            <button onClick={downloadTemplate} style={{ ...gBtn, whiteSpace: "nowrap", flexShrink: 0 }}>
              ⬇ Descargar plantilla CSV
            </button>
          </div>

          {/* Drop zone */}
          <div
            style={{
              border: "2px dashed var(--border)", borderRadius: 12, padding: "32px 20px",
              textAlign: "center", cursor: "pointer", background: "var(--surface-2)",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).style.borderColor = "rgb(109,191,60)";
              (e.currentTarget as HTMLElement).style.background = "rgba(109,191,60,0.05)";
            }}
            onDragLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.background = "var(--surface-2)";
            }}
            onDrop={e => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.background = "var(--surface-2)";
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 8 }}>📄</div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              Arrastrá un CSV acá o{" "}
              <span style={{ color: "var(--blue)", textDecoration: "underline" }}>hacé clic para elegir archivo</span>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted)" }}>
              Formato .csv · UTF-8 · columnas separadas por coma
            </p>
          </div>
          <input
            ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />

          {/* Preview table */}
          {csvRows.length > 0 && (
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "38px 1.2fr 1.4fr 100px 1fr 80px",
                padding: "7px 12px", background: "var(--surface-2)",
                borderBottom: "1px solid var(--border-2)",
                fontSize: 10.5, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em",
              }}>
                <span>#</span><span>MÉDICO ID</span><span>PATRÓN</span>
                <span>HORARIO</span><span>SECTOR</span><span style={{ textAlign: "center" }}>ESTADO</span>
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {csvRows.map(r => (
                  <div key={r.row} style={{
                    display: "grid", gridTemplateColumns: "38px 1.2fr 1.4fr 100px 1fr 80px",
                    padding: "7px 12px", borderBottom: "1px solid var(--border-2)",
                    fontSize: 12, alignItems: "center",
                    background: r.ok ? "transparent" : "rgba(220,38,38,0.04)",
                  }}>
                    <span style={{ color: "var(--subtle)", fontFamily: "monospace", fontSize: 11 }}>{r.row}</span>
                    {r.ok ? (
                      <>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.data.medicoId}</span>
                        <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{describePlatron(r.data.patron)}</span>
                        <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                          {r.data.turnos[0].horaInicio}–{r.data.turnos[0].horaFin}
                        </span>
                        <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{r.data.sector}</span>
                        <span style={{
                          textAlign: "center", color: "rgb(22,163,74)", fontWeight: 700, fontSize: 11,
                        }}>✓ OK</span>
                      </>
                    ) : (
                      <>
                        <span style={{
                          gridColumn: "2 / 6", color: "var(--muted)", fontStyle: "italic",
                          fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {r.raw.slice(0, 80)}
                        </span>
                        <span style={{
                          textAlign: "center", color: "rgb(220,38,38)", fontWeight: 700,
                          fontSize: 10.5, whiteSpace: "nowrap",
                        }}>✗ {r.err}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {csvRows.length > 0 && (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                <b style={{ color: "rgb(22,163,74)" }}>{csvRows.filter(r => r.ok).length} válidas</b>
                {csvRows.some(r => !r.ok) && (
                  <> · <b style={{ color: "rgb(220,38,38)" }}>{csvRows.filter(r => !r.ok).length} con error</b></>
                )}
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {csvRows.some(r => r.ok) && (
                <button
                  onClick={confirmImport}
                  style={{ ...pBtn, background: "rgb(22,163,74)", boxShadow: "0 2px 8px rgba(22,163,74,0.25)" }}
                >
                  ⬆ Importar {csvRows.filter(r => r.ok).length} guardia{csvRows.filter(r => r.ok).length !== 1 ? "s" : ""}
                </button>
              )}
              <button onClick={() => { setMode("none"); setCsvRows([]); }} style={gBtn}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filtros por día ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setFiltro("TODOS")} style={chip(filtro === "TODOS", "100,116,139")}>
          Todos ({guardias.length})
        </button>
        {DIAS_SHORT.map((d, i) => {
          const cnt = guardias.filter(g =>
            g.patron.tipo === "DIAS_SEMANA" ? g.patron.dias.includes(i)
            : g.patron.tipo === "NTH_SEMANA" ? g.patron.diaSemana === i : false
          ).length;
          return cnt ? (
            <button key={i} onClick={() => setFiltro(i)} style={chip(filtro === i, "21,101,192")}>
              {d} ({cnt})
            </button>
          ) : null;
        })}
      </div>

      {/* ── Tabla ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 160px 110px 80px 80px 72px",
          padding: "8px 14px", background: "var(--surface-2)",
          borderBottom: "1px solid var(--border-2)",
          fontSize: 10.5, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em",
        }}>
          <span>MÉDICO</span><span>PATRÓN</span><span>HORARIO</span>
          <span>SECTOR</span><span style={{ textAlign: "center" }}>ESTADO</span>
          <span style={{ textAlign: "center" }}>ACCIÓN</span>
        </div>

        {visible.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--subtle)", fontSize: 13 }}>
            {guardias.length === 0
              ? "No hay guardias fijas. Creá la primera con '+ Nueva guardia fija'."
              : "Sin guardias para el día seleccionado."}
          </div>
        )}

        {visible.map((g, i) => {
          const m = medMap.get(g.medicoId);
          const t = g.turnos[0];
          const night = t && isON(t.horaInicio, t.horaFin);
          return (
            <div key={g.id} style={{
              display: "grid", gridTemplateColumns: "2fr 160px 110px 80px 80px 72px",
              padding: "10px 14px",
              borderBottom: i < visible.length - 1 ? "1px solid var(--border-2)" : "none",
              alignItems: "center", opacity: g.activo ? 1 : 0.50,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {m ? <DoctorAvatar medico={m as any} size={28} /> : null}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                    {m?.displayName ?? g.medicoId}
                  </div>
                  {m && <div style={{ fontSize: 10.5, color: "var(--subtle)" }}>{m.tipo}</div>}
                </div>
              </div>

              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                {describePlatron(g.patron)}
                {(g.vigenciaDesde || g.vigenciaHasta) && (
                  <div style={{ fontSize: 10.5, color: "var(--subtle)", marginTop: 2 }}>
                    {g.vigenciaDesde && `Desde ${g.vigenciaDesde}`}
                    {g.vigenciaDesde && g.vigenciaHasta && " "}
                    {g.vigenciaHasta && `Hasta ${g.vigenciaHasta}`}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {t ? (
                  <>
                    {t.horaInicio}–{t.horaFin}
                    {night && (
                      <span style={{ fontSize: 10, color: "rgb(146,64,14)", marginLeft: 4 }}>+1d</span>
                    )}
                  </>
                ) : "—"}
                {g.turnos.length > 1 && (
                  <span style={{ fontSize: 10.5, color: "var(--subtle)", marginLeft: 4 }}>
                    +{g.turnos.length - 1} más
                  </span>
                )}
              </div>

              <div style={{ fontSize: 12, color: "var(--text)" }}>{g.sector}</div>

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

              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <button onClick={() => openEdit(g)} style={iBtn} title="Editar">✏</button>
                <button onClick={() => remove(g)}
                  style={{ ...iBtn, color: "rgb(220,38,38)" }} title="Eliminar">🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Resumen por médico ── */}
      {guardias.some(g => g.activo) && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: "var(--muted)",
            letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10,
          }}>
            Resumen de activas
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from(new Set(guardias.filter(g => g.activo).map(g => g.medicoId))).map(mid => {
              const m  = medMap.get(mid);
              const gs = guardias.filter(g => g.medicoId === mid && g.activo);
              return (
                <div key={mid} style={{
                  padding: "7px 12px", borderRadius: 9, fontSize: 12,
                  background: "var(--surface-2)", border: "1px solid var(--border-2)",
                }}>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>
                    {m?.displayName ?? mid}
                  </span>
                  <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11.5 }}>
                    {gs.map(g =>
                      `${describePlatron(g.patron)} ${g.turnos[0]?.horaInicio ?? ""}–${g.turnos[0]?.horaFin ?? ""}`
                    ).join("  ·  ")}
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
