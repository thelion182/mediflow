import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authStore } from "../../auth/auth.store";
import { AppShell } from "../../ui/AppShell";
import { minutesFromNow, toLocalDateTimeInputValue } from "../../core/date";
import { convocatoriaStore } from "./convocatoria.store";
import { prioAuditStore } from "./prio.audit.store";
import { medicosStore } from "../admin/medicos.store";
import { sectoresStore } from "../admin/sectores.store";
import { sedesStore } from "../admin/sedes.store";
import { configStore } from "../config/config.store";
import { CANAL_META } from "../config/config.types";
import type { Canal } from "./convocatoria.types";
import type { MedicoTipo, MedicoGremio } from "../admin/medicos.types";

type ModoEnvio    = "MASIVO" | "SECUENCIAL";
type TipoFiltro   = "TODOS" | MedicoTipo;
type GremioFiltro = "TODOS" | MedicoGremio;
type PrioMode   = "SCORING" | "MANUAL";

const TIPO_RGB: Record<MedicoTipo, string> = {
  TITULAR:       "21,101,192",
  SUPLENTE:      "22,163,74",
  INDEPENDIENTE: "217,119,6",
};
const TIPO_LABEL: Record<MedicoTipo, string> = {
  TITULAR:       "Titular",
  SUPLENTE:      "Suplente",
  INDEPENDIENTE: "Independiente",
};

const OTRO = "__OTRO__";

function prio(n?: number) { return typeof n === "number" && isFinite(n) ? n : 9999; }
function cargoOf(m: any)  { return String(m?.especialidad ?? "").trim() || "SIN_CARGO"; }
function normalizePrioInput(raw: any): number | undefined {
  const n = Number(String(raw ?? "").trim());
  if (!isFinite(n)) return undefined;
  const v = Math.floor(n);
  return v < 1 ? 1 : v;
}

// ── Shared field wrapper ──────────────────────────────────────────────────
function Field({ label, children, hint, full }: {
  label: string; children: React.ReactNode; hint?: string; full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <label style={lblStyle}>{label}</label>
      {children}
      {hint && <p style={hintStyle}>{hint}</p>}
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────
function Panel({ title, children, action }: {
  title?: string; children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={panelStyle}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          {title && <h3 style={h3Style}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Tipo badge ────────────────────────────────────────────────────────────
function TipoBadge({ tipo }: { tipo?: string }) {
  const t = (tipo ?? "SUPLENTE") as MedicoTipo;
  const rgb = TIPO_RGB[t] ?? "100,116,139";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 10.5, fontWeight: 700,
      background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
      border: `1px solid rgba(${rgb},0.22)`, whiteSpace: "nowrap",
    }}>{TIPO_LABEL[t] ?? t}</span>
  );
}

export function NuevaConvocatoria() {
  const session = authStore.getSession()!;
  const nav = useNavigate();
  const [tick, setTick] = useState(0);

  // ── Catálogos ──────────────────────────────────────────────────────────
  const sectoresActivos = useMemo(() => sectoresStore.list().filter((s: any) => s.activo ?? true), [tick]);
  const sedesActivas    = useMemo(() => sedesStore.list().filter((s: any) => s.activo ?? true), [tick]);

  // ── Sector / Sede ──────────────────────────────────────────────────────
  const [sectorSel, setSectorSel] = useState<string>(() => sectoresActivos[0]?.nombre ?? "Emergencia");
  const [sectorOtro, setSectorOtro] = useState("");
  const [sedeSel, setSedeSel]     = useState<string>(() => sedesActivas[0]?.nombre ?? "");
  const [sedeOtro, setSedeOtro]   = useState("");

  useEffect(() => {
    const names = new Set(sectoresActivos.map((s: any) => s.nombre));
    if (sectorSel !== OTRO && sectorSel && !names.has(sectorSel))
      setSectorSel(sectoresActivos[0]?.nombre ?? "Emergencia");
  }, [sectoresActivos.map((s: any) => s.nombre).join("|")]);

  useEffect(() => {
    const names = new Set(sedesActivas.map((s: any) => s.nombre));
    if (sedeSel !== OTRO && sedeSel && !names.has(sedeSel))
      setSedeSel(sedesActivas[0]?.nombre ?? "");
  }, [sedesActivas.map((s: any) => s.nombre).join("|")]);

  const sectorFinal = (sectorSel === OTRO ? sectorOtro : sectorSel).trim();
  const sedeFinal   = ((sedeSel === OTRO ? sedeOtro : sedeSel).trim()) || undefined;

  const sedeObj = sedesActivas.find((s: any) => s.nombre === sedeFinal);
  const sectorRestringido = ["ambulancias","piso"].some(x => sectorFinal.toLowerCase() === x);
  const showSanatorioWarn = sectorRestringido && (!sedeObj || (sedeObj as any).tipo !== "SANATORIO");

  // ── Turno ──────────────────────────────────────────────────────────────
  const [inicio,      setInicio]      = useState(toLocalDateTimeInputValue(minutesFromNow(60)));
  const [fin,         setFin]         = useState(toLocalDateTimeInputValue(minutesFromNow(60 + 12 * 60)));
  const [cupos,       setCupos]       = useState(1);
  const [vencimiento, setVencimiento] = useState(toLocalDateTimeInputValue(minutesFromNow(6 * 60)));
  const [prioridad,   setPrioridad]   = useState<"NORMAL"|"ALTA">("NORMAL");
  const [notas,       setNotas]       = useState("");

  // ── Canales ────────────────────────────────────────────────────────────
  const cfg = configStore.get();
  const canalesEnabled: Canal[] = (["APP","WHATSAPP","SMS","EMAIL"] as Canal[]).filter(c => {
    if (c === "APP")      return cfg.canales.app.enabled;
    if (c === "WHATSAPP") return cfg.canales.whatsapp.enabled;
    if (c === "SMS")      return cfg.canales.sms.enabled;
    if (c === "EMAIL")    return cfg.canales.email.enabled;
    return false;
  });
  const [canalesSel, setCanalesSel] = useState<Canal[]>(() => {
    const defaults = cfg.defaultCanales;
    const valid = defaults.filter(c => canalesEnabled.includes(c));
    return valid.length > 0 ? valid : canalesEnabled.length > 0 ? [canalesEnabled[0]] : ["APP"];
  });
  function toggleCanal(c: Canal) {
    setCanalesSel(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  // ── Modo envío ─────────────────────────────────────────────────────────
  const [modoEnvio, setModoEnvio]             = useState<ModoEnvio>("SECUENCIAL");
  const [sinVerMin, setSinVerMin]             = useState(60);
  const [sinResponderMin, setSinResponderMin] = useState(60);
  useEffect(() => {
    if (Number(cupos) > 1 && modoEnvio === "SECUENCIAL") setModoEnvio("MASIVO");
  }, [cupos]);
  const cuposNum  = Number(cupos) || 1;
  const modoFinal: ModoEnvio = modoEnvio === "SECUENCIAL" && cuposNum !== 1 ? "MASIVO" : modoEnvio;

  // ── Prioridad de destinatarios ─────────────────────────────────────────
  const [prioMode, setPrioMode] = useState<PrioMode>("SCORING");

  // ── Distribución justa ────────────────────────────────────────────────
  const [distribucionJusta, setDistribucionJusta] = useState(false);

  // ── Auto-renovación ────────────────────────────────────────────────────
  const [autoRenew,         setAutoRenew]         = useState(false);
  const [autoRenewMinutes,  setAutoRenewMinutes]   = useState(60);
  const [autoRenewMaxCount, setAutoRenewMaxCount]  = useState(3);

  // ── Filtros de médicos ─────────────────────────────────────────────────
  const [qMedico,      setQMedico]      = useState("");
  const [tipoSel,      setTipoSel]      = useState<TipoFiltro>("TODOS");
  const [gremioSel,    setGremioSel]    = useState<GremioFiltro>("TODOS");
  const [cargoSel,     setCargoSel]     = useState<string>("TODOS");
  const [prioOverride, setPrioOverride] = useState<Record<string, number | undefined>>({});
  const [dest, setDest] = useState<Record<string, boolean>>({});

  const medicosOrdenados = useMemo(() =>
    [...medicosStore.list().filter((m: any) => m.activo ?? true)]
      .sort((a: any, b: any) => prio(a.prioridad) - prio(b.prioridad)),
  [tick]);

  const especialidades = useMemo(() => {
    const set = new Set<string>();
    for (const m of medicosOrdenados) set.add(cargoOf(m));
    return Array.from(set).sort();
  }, [medicosOrdenados.map((m: any) => `${m.userId}:${m.especialidad}`).join("|")]);

  const countByTipo = useMemo(() => {
    const c: Record<string, number> = { TODOS: 0, TITULAR: 0, SUPLENTE: 0, INDEPENDIENTE: 0 };
    for (const m of medicosOrdenados) {
      c.TODOS++;
      const t = (m as any).tipo ?? "SUPLENTE";
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [medicosOrdenados]);

  const countByGremio = useMemo(() => {
    const c: Record<string, number> = { TODOS: 0, SAQ: 0, SMU: 0 };
    for (const m of medicosOrdenados) {
      c.TODOS++;
      const g = (m as any).gremio ?? "SMU";
      c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [medicosOrdenados]);

  // ── Actividad mensual de médicos ───────────────────────────────────────
  const medicosActividad = useMemo(() => {
    const all = convocatoriaStore.list();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const nowMs      = Date.now();

    const map = new Map<string, { confirmadas: number; enCurso: boolean }>();
    for (const c of all) {
      const inicioMs = new Date(c.inicio).getTime();
      const finMs    = new Date(c.fin).getTime();
      if (inicioMs < monthStart || inicioMs > monthEnd) continue;
      for (const a of c.asignaciones ?? []) {
        if (a.estado !== "CONFIRMADA" && a.estado !== "CUMPLIDA") continue;
        const prev = map.get(a.medicoId) ?? { confirmadas: 0, enCurso: false };
        const enCurso = a.estado === "CONFIRMADA" && nowMs >= inicioMs && nowMs <= finMs;
        map.set(a.medicoId, { confirmadas: prev.confirmadas + 1, enCurso: prev.enCurso || enCurso });
      }
    }
    return map;
  }, [tick]);

  // ── Sync dest con catálogo ─────────────────────────────────────────────
  useEffect(() => {
    setDest(prev => {
      const next = { ...prev };
      for (const m of medicosOrdenados) if (next[m.userId] === undefined) next[m.userId] = true;
      const ids = new Set(medicosOrdenados.map((m: any) => m.userId));
      for (const k of Object.keys(next)) if (!ids.has(k)) delete next[k];
      return next;
    });
  }, [medicosOrdenados.map((m: any) => m.userId).join("|")]);

  function prioEff(userId: string, catPrio?: number) {
    const o = prioOverride[userId];
    if (typeof o === "number" && isFinite(o)) return Math.max(1, Math.floor(o));
    if (typeof catPrio === "number" && isFinite(catPrio)) return Math.max(1, Math.floor(catPrio));
    return 9999;
  }

  // ID del sector seleccionado (undefined cuando es "Otro" o no coincide con catálogo)
  const sectorIdSel = useMemo(() => {
    if (sectorSel === OTRO) return undefined;
    return sectoresActivos.find((s: any) => s.nombre === sectorSel)?.id as string | undefined;
  }, [sectorSel, sectoresActivos]);

  const medicosVisibles = useMemo(() => {
    let list = medicosOrdenados;
    if (tipoSel !== "TODOS")    list = list.filter((m: any) => (m.tipo ?? "SUPLENTE") === tipoSel);
    if (gremioSel !== "TODOS")  list = list.filter((m: any) => (m.gremio ?? "SMU") === gremioSel);
    if (cargoSel !== "TODOS")   list = list.filter((m: any) => cargoOf(m) === cargoSel);
    if (sectorIdSel) {
      list = list.filter((m: any) => {
        const hab: string[] = m.sectoresHabilitados ?? [];
        return hab.length === 0 || hab.includes(sectorIdSel);
      });
    }
    if (qMedico.trim()) {
      const q = qMedico.trim().toLowerCase();
      list = list.filter((m: any) =>
        String(m.displayName ?? "").toLowerCase().includes(q) ||
        String(m.userId ?? "").toLowerCase().includes(q) ||
        String(m.telefono ?? "").toLowerCase().includes(q) ||
        String(m.especialidad ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a: any, b: any) => {
      const pa = prioEff(a.userId, a.prioridad);
      const pb = prioEff(b.userId, b.prioridad);
      if (pa !== pb) return pa - pb;
      // Distribución justa: menos guardias este mes → primero
      if (distribucionJusta) {
        const ga = medicosActividad.get(a.userId)?.confirmadas ?? 0;
        const gb = medicosActividad.get(b.userId)?.confirmadas ?? 0;
        if (ga !== gb) return ga - gb;
      }
      return String(a.displayName).localeCompare(String(b.displayName));
    });
  }, [medicosOrdenados, tipoSel, gremioSel, cargoSel, sectorIdSel, qMedico, JSON.stringify(prioOverride), distribucionJusta, medicosActividad]);

  const destinatarios = useMemo(() =>
    medicosVisibles.map((m: any) => m.userId).filter(id => !!dest[id]),
  [dest, medicosVisibles]);

  function toggle(id: string) { setDest(prev => ({ ...prev, [id]: !prev[id] })); }
  function selectAll(v: boolean) {
    const next: Record<string, boolean> = {};
    for (const m of medicosVisibles) next[m.userId] = v;
    setDest(prev => ({ ...prev, ...next }));
  }
  function selectByTipo(tipo: MedicoTipo) {
    const next: Record<string, boolean> = {};
    for (const m of medicosVisibles) next[m.userId] = (m as any).tipo === tipo;
    setDest(prev => ({ ...prev, ...next }));
  }

  const previewOrden = useMemo(() =>
    destinatarios.slice(0, 8).map((id, idx) => {
      const m = medicosVisibles.find((x: any) => x.userId === id);
      return { idx: idx + 1, id, name: m?.displayName ?? id, prio: prioEff(id, m?.prioridad), tipo: (m as any)?.tipo };
    }),
  [destinatarios, medicosVisibles, prioOverride]);

  const hasOverrides = Object.values(prioOverride).some(v => v !== undefined);

  // ── Submit ─────────────────────────────────────────────────────────────
  function submit() {
    if (!sectorFinal)         return alert("Sector es obligatorio.");
    if (!inicio || !fin)      return alert("Inicio y fin son obligatorios.");
    if (new Date(fin) <= new Date(inicio)) return alert("Fin debe ser posterior a Inicio.");
    if (canalesSel.length === 0)  return alert("Seleccioná al menos un canal.");
    if (destinatarios.length === 0) return alert("Seleccioná al menos un médico.");
    if (modoFinal === "SECUENCIAL" && cuposNum !== 1) return alert("SECUENCIAL solo con 1 cupo.");
    if (modoFinal === "SECUENCIAL" && destinatarios.length === 1)
      if (!confirm("Solo 1 médico seleccionado. ¿Enviás igual en SECUENCIAL?")) return;

    // Guardar auditoría de prioridad manual
    if (prioMode === "MANUAL") {
      const overridesList = Object.entries(prioOverride)
        .filter(([, v]) => v !== undefined)
        .map(([medicoId, overridePrio]) => {
          const m = medicosOrdenados.find((x: any) => x.userId === medicoId);
          return {
            medicoId,
            medicoName: m?.displayName ?? medicoId,
            catPrio: (m as any)?.prioridad,
            overridePrio: overridePrio!,
          };
        });
      prioAuditStore.add({
        timestamp:  new Date().toISOString(),
        actorId:    session.userId,
        actorName:  session.displayName,
        sector:     sectorFinal,
        sede:       sedeFinal,
        overrides:  overridesList,
      });
    }

    const c = convocatoriaStore.createAndSend({
      sector:      sectorFinal,
      sede:        sedeFinal,
      inicio:      new Date(inicio).toISOString(),
      fin:         new Date(fin).toISOString(),
      cupos:       cuposNum,
      vencimiento: new Date(vencimiento).toISOString(),
      prioridad,
      notas:       notas.trim() || undefined,
      createdBy:   session.userId,
      destinatarios,
      keepOrder:   true,
      modoEnvio:   modoFinal,
      canales:     canalesSel.length > 0 ? canalesSel : ["APP"],
      timeouts:    modoFinal === "SECUENCIAL"
        ? { sinVerMin: Number(sinVerMin) || 60, sinResponderMin: Number(sinResponderMin) || 60 }
        : undefined,
      autoRenew:         autoRenew || undefined,
      autoRenewMinutes:  autoRenew ? autoRenewMinutes : undefined,
      autoRenewMaxCount: autoRenew ? autoRenewMaxCount : undefined,
      prioMode,
    });
    nav(`/dashboard/c/${c.id}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Nueva Convocatoria</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{destinatarios.length}</span> seleccionados ·
            <span style={{ marginLeft: 6, fontWeight: 600, color: "var(--text)" }}>{modoFinal}</span> ·
            <span style={{ marginLeft: 6, fontWeight: 600, color: "var(--text)" }}>{cuposNum}</span> cupo{cuposNum !== 1 ? "s" : ""}
            {autoRenew && (
              <span style={{ marginLeft: 8, fontSize: 11.5, color: "rgb(22,163,74)", fontWeight: 600 }}>
                · ♻ Auto-renovar ×{autoRenewMaxCount}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTick(t => t + 1)} style={ghostBtn} title="Recargar catálogos">↺</button>
          <button onClick={submit} style={primaryBtn}>Enviar convocatoria</button>
        </div>
      </div>

      {/* Dos columnas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 16, alignItems: "start" }}>

        {/* ─── Columna izquierda ───────────────────────────────────────── */}
        <div style={{ display: "grid", gap: 16 }}>

          <Panel title="Lugar y turno">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Sector">
                <select style={selectStyle} value={sectorSel} onChange={e => setSectorSel(e.target.value)}>
                  {sectoresActivos.map((s: any) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                  <option value={OTRO}>Otro…</option>
                </select>
                {sectorSel === OTRO && (
                  <input style={{ ...inputStyle, marginTop: 8 }} placeholder="Escribí el sector"
                    value={sectorOtro} onChange={e => setSectorOtro(e.target.value)} />
                )}
              </Field>

              <Field label="Sede / Servicio">
                <select style={selectStyle} value={sedeSel} onChange={e => setSedeSel(e.target.value)}>
                  {sedesActivas.map((s: any) => (
                    <option key={s.id} value={s.nombre}>{s.nombre}</option>
                  ))}
                  <option value={OTRO}>Otro…</option>
                </select>
                {sedeSel === OTRO && (
                  <input style={{ ...inputStyle, marginTop: 8 }} placeholder="Escribí la sede"
                    value={sedeOtro} onChange={e => setSedeOtro(e.target.value)} />
                )}
              </Field>

              {showSanatorioWarn && (
                <div style={{
                  gridColumn: "1 / -1", padding: "10px 14px", borderRadius: 10,
                  background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.30)",
                  color: "rgb(160,90,0)", fontSize: 13, lineHeight: 1.5,
                }}>
                  <b>Atención:</b> <b>{sectorFinal}</b> solo se puede cubrir en sedes tipo SANATORIO.
                </div>
              )}

              <Field label="Inicio">
                <input style={inputStyle} type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} />
              </Field>
              <Field label="Fin">
                <input style={inputStyle} type="datetime-local" value={fin} onChange={e => setFin(e.target.value)} />
              </Field>
              <Field label="Vencimiento de la convocatoria">
                <input style={inputStyle} type="datetime-local" value={vencimiento} onChange={e => setVencimiento(e.target.value)} />
              </Field>
              <Field label="Cupos">
                <input style={inputStyle} type="number" min={1} value={cupos} onChange={e => setCupos(Number(e.target.value))} />
                {cuposNum > 1 && <p style={hintStyle}>Con más de 1 cupo el modo pasa a MASIVO.</p>}
              </Field>
            </div>
          </Panel>

          <Panel title="Prioridad y modo de envío">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Prioridad">
                <div style={{ display: "flex", gap: 8 }}>
                  {(["NORMAL","ALTA"] as const).map(p => (
                    <button key={p} onClick={() => setPrioridad(p)} style={{
                      flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 600,
                      border: `1.5px solid ${prioridad === p ? (p === "ALTA" ? "rgba(220,38,38,0.60)" : "rgba(21,101,192,0.60)") : "var(--border)"}`,
                      background: prioridad === p ? (p === "ALTA" ? "rgba(220,38,38,0.10)" : "rgba(21,101,192,0.10)") : "var(--surface-2)",
                      color: prioridad === p ? (p === "ALTA" ? "rgb(220,38,38)" : "var(--blue)") : "var(--muted)",
                      cursor: "pointer",
                    }}>{p === "ALTA" ? "🔴 ALTA" : "⚪ NORMAL"}</button>
                  ))}
                </div>
              </Field>

              <Field label="Modo de envío">
                <div style={{ display: "flex", gap: 8 }}>
                  {(["SECUENCIAL","MASIVO"] as const).map(m => (
                    <button key={m} onClick={() => !( cuposNum > 1 && m === "SECUENCIAL") && setModoEnvio(m)}
                      disabled={cuposNum > 1 && m === "SECUENCIAL"}
                      style={{
                        flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                        border: `1.5px solid ${modoEnvio === m ? "rgba(21,101,192,0.60)" : "var(--border)"}`,
                        background: modoEnvio === m ? "rgba(21,101,192,0.10)" : "var(--surface-2)",
                        color: modoEnvio === m ? "var(--blue)" : "var(--muted)",
                        cursor: cuposNum > 1 && m === "SECUENCIAL" ? "not-allowed" : "pointer",
                        opacity: cuposNum > 1 && m === "SECUENCIAL" ? 0.5 : 1,
                      }}>{m === "SECUENCIAL" ? "Secuencial" : "Masivo"}</button>
                  ))}
                </div>
              </Field>

              {modoFinal === "SECUENCIAL" && (
                <>
                  <Field label="Timeout sin ver (min)" hint="Si no ve la notif., pasa al siguiente">
                    <input style={inputStyle} type="number" min={1} value={sinVerMin} onChange={e => setSinVerMin(Number(e.target.value))} />
                  </Field>
                  <Field label="Timeout sin responder (min)" hint="Si ve pero no responde, pasa al siguiente">
                    <input style={inputStyle} type="number" min={1} value={sinResponderMin} onChange={e => setSinResponderMin(Number(e.target.value))} />
                  </Field>
                </>
              )}

              {/* Modo de priorización */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lblStyle}>Modo de priorización de médicos</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { key: "SCORING" as PrioMode, label: "Por scoring", icon: "📊", desc: "Orden según catálogo y puntaje" },
                    { key: "MANUAL"  as PrioMode, label: "Manual",      icon: "✏️",  desc: "Elección manual (queda registrada)" },
                  ]).map(m => (
                    <button key={m.key} onClick={() => setPrioMode(m.key)} style={{
                      flex: 1, padding: "10px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                      border: `1.5px solid ${prioMode === m.key
                        ? m.key === "MANUAL" ? "rgba(217,119,6,0.60)" : "rgba(21,101,192,0.60)"
                        : "var(--border)"}`,
                      background: prioMode === m.key
                        ? m.key === "MANUAL" ? "rgba(217,119,6,0.08)" : "rgba(21,101,192,0.08)"
                        : "var(--surface-2)",
                      color: prioMode === m.key
                        ? m.key === "MANUAL" ? "rgb(160,90,0)" : "var(--blue)"
                        : "var(--muted)",
                      cursor: "pointer", textAlign: "left",
                    }}>
                      <div>{m.icon} {m.label}</div>
                      <div style={{ fontSize: 10.5, marginTop: 2, fontWeight: 400, opacity: 0.8 }}>{m.desc}</div>
                    </button>
                  ))}
                </div>
                {prioMode === "MANUAL" && (
                  <div style={{
                    marginTop: 8, padding: "8px 12px", borderRadius: 8,
                    background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.25)",
                    fontSize: 12, color: "rgb(150,80,0)", lineHeight: 1.5,
                  }}>
                    ⚠️ Modo manual: {hasOverrides ? `hay ${Object.values(prioOverride).filter(v => v !== undefined).length} prioridades modificadas.` : "no hay prioridades modificadas aún."}
                    {" "}Al enviar quedará un registro de auditoría para revisión del Super Admin.
                  </div>
                )}
              </div>

              {/* Distribución justa */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <div
                    onClick={() => setDistribucionJusta(v => !v)}
                    style={{
                      width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                      background: distribucionJusta ? "rgb(22,163,74)" : "var(--border)",
                      position: "relative", cursor: "pointer", transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3, left: distribucionJusta ? 21 : 3,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      transition: "left 0.2s",
                    }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      Priorizar distribución justa
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                      Dentro del mismo nivel de prioridad, los médicos con menos guardias este mes van primero
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </Panel>

          {/* Auto-renovación */}
          <Panel title="Auto-renovación">
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div
                  onClick={() => setAutoRenew(v => !v)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                    background: autoRenew ? "rgb(22,163,74)" : "var(--border)",
                    position: "relative", cursor: "pointer", transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 3, left: autoRenew ? 21 : 3,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                  }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    Renovar automáticamente al vencer
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    Si nadie acepta y vence, extiende el plazo y reenvía las invitaciones
                  </div>
                </div>
              </label>

              {autoRenew && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingTop: 4 }}>
                  <Field label="Extender por (minutos)" hint="Cuánto tiempo más se da al vencer">
                    <input style={inputStyle} type="number" min={10} step={15}
                      value={autoRenewMinutes}
                      onChange={e => setAutoRenewMinutes(Math.max(10, Number(e.target.value)))} />
                  </Field>
                  <Field label="Máximo de renovaciones" hint="Se cancela si se supera este número">
                    <input style={inputStyle} type="number" min={1} max={10}
                      value={autoRenewMaxCount}
                      onChange={e => setAutoRenewMaxCount(Math.max(1, Math.min(10, Number(e.target.value))))} />
                  </Field>
                  <div style={{
                    gridColumn: "1 / -1", padding: "8px 12px", borderRadius: 8,
                    background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.20)",
                    fontSize: 12, color: "rgb(20,120,60)",
                  }}>
                    ♻ Se renovará hasta <b>{autoRenewMaxCount}×</b>, extendiendo <b>{autoRenewMinutes} min</b> cada vez.
                    Total máximo: <b>{Math.round(autoRenewMinutes * autoRenewMaxCount / 60 * 10) / 10}h</b> adicionales.
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Canales de envío">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canalesEnabled.map(canal => {
                const meta = CANAL_META[canal];
                const sel = canalesSel.includes(canal);
                return (
                  <button key={canal} onClick={() => toggleCanal(canal)} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                    border: `2px solid ${sel ? `rgba(${meta.rgb},0.80)` : "var(--border)"}`,
                    background: sel ? `rgba(${meta.rgb},0.10)` : "var(--surface-2)",
                    color: sel ? `rgb(${meta.rgb})` : "var(--muted)",
                    fontWeight: sel ? 700 : 500, fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <span style={{ fontSize: 16 }}>{meta.icon}</span>
                    {meta.label}
                    {sel && <span style={{ fontSize: 12 }}>✓</span>}
                  </button>
                );
              })}
              {canalesEnabled.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                  Solo APP disponible. Configurá los canales en Configuración.
                </p>
              )}
            </div>
            {canalesSel.length > 0 && (
              <p style={hintStyle}>Canal principal: <b>{CANAL_META[canalesSel[0]].label}</b>{canalesSel.length > 1 ? ` · también: ${canalesSel.slice(1).map(c => CANAL_META[c].label).join(", ")}` : ""}</p>
            )}
          </Panel>

          <Panel title="Notas">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Instrucciones, observaciones o contexto para el médico…" />
          </Panel>

          {/* Preview orden */}
          <Panel title={`Orden de contacto ${modoFinal === "SECUENCIAL" ? "(secuencial real)" : "(referencia)"}`}>
            {previewOrden.length === 0
              ? <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Sin destinatarios seleccionados.</p>
              : (
                <div style={{ display: "grid", gap: 6 }}>
                  {previewOrden.map(x => {
                    const rgb = TIPO_RGB[(x.tipo as MedicoTipo) ?? "SUPLENTE"] ?? "100,116,139";
                    const hasOv = prioOverride[x.id] !== undefined;
                    return (
                      <div key={x.id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border-2)",
                        borderLeft: `3px solid rgb(${rgb})`,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", minWidth: 22 }}>#{x.idx}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{x.name}</div>
                          <div style={{ fontSize: 11, color: "var(--subtle)" }}>{x.id}</div>
                        </div>
                        <TipoBadge tipo={x.tipo} />
                        <span style={{
                          fontSize: 11, padding: "2px 7px", borderRadius: 6,
                          background: hasOv ? "rgba(217,119,6,0.10)" : "var(--surface)",
                          border: `1px solid ${hasOv ? "rgba(217,119,6,0.35)" : "var(--border-2)"}`,
                          color: hasOv ? "rgb(160,90,0)" : "var(--muted)",
                        }}>P{x.prio === 9999 ? "—" : x.prio}{hasOv ? " ✏" : ""}</span>
                      </div>
                    );
                  })}
                  {destinatarios.length > previewOrden.length && (
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
                      … y {destinatarios.length - previewOrden.length} más.
                    </p>
                  )}
                </div>
              )}
          </Panel>
        </div>

        {/* ─── Columna derecha — destinatarios ─────────────────────────── */}
        <div style={{ display: "grid", gap: 16, position: "sticky", top: 22 }}>
          <Panel title="Destinatarios"
            action={
              <span style={{
                padding: "3px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 700,
                background: destinatarios.length > 0 ? "rgba(21,101,192,0.12)" : "var(--surface-2)",
                color: destinatarios.length > 0 ? "var(--blue)" : "var(--muted)",
                border: "1px solid var(--border-2)",
              }}>{destinatarios.length} / {medicosVisibles.length}</span>
            }
          >
            {/* ── Filtros ── */}
            <div style={{ display: "grid", gap: 10 }}>

              {/* Tipo chips */}
              <div>
                <label style={lblStyle}>Tipo de médico</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([
                    { key: "TODOS",         label: `Todos (${countByTipo.TODOS})`,                       rgb: "100,116,139" },
                    { key: "TITULAR",       label: `Titulares (${countByTipo.TITULAR ?? 0})`,            rgb: TIPO_RGB.TITULAR },
                    { key: "SUPLENTE",      label: `Suplentes (${countByTipo.SUPLENTE ?? 0})`,           rgb: TIPO_RGB.SUPLENTE },
                    { key: "INDEPENDIENTE", label: `Independientes (${countByTipo.INDEPENDIENTE ?? 0})`, rgb: TIPO_RGB.INDEPENDIENTE },
                  ] as { key: TipoFiltro; label: string; rgb: string }[]).map(t => (
                    <button key={t.key} onClick={() => setTipoSel(t.key)} style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: tipoSel === t.key ? 700 : 500,
                      border: `1.5px solid ${tipoSel === t.key ? `rgba(${t.rgb},0.60)` : "var(--border-2)"}`,
                      background: tipoSel === t.key ? `rgba(${t.rgb},0.12)` : "var(--surface-2)",
                      color: tipoSel === t.key ? `rgb(${t.rgb})` : "var(--muted)",
                      cursor: "pointer", transition: "all 0.12s",
                    }}>{t.label}</button>
                  ))}
                </div>
              </div>

              {/* Gremio chips */}
              <div>
                <label style={lblStyle}>Gremio</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([
                    { key: "TODOS" as GremioFiltro, label: `Todos (${countByGremio.TODOS})`,    rgb: "100,116,139" },
                    { key: "SMU"   as GremioFiltro, label: `SMU (${countByGremio.SMU ?? 0})`,   rgb: "21,101,192"  },
                    { key: "SAQ"   as GremioFiltro, label: `SAQ (${countByGremio.SAQ ?? 0})`,   rgb: "217,119,6"   },
                  ]).map(g => (
                    <button key={g.key} onClick={() => setGremioSel(g.key)} style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: gremioSel === g.key ? 700 : 500,
                      border: `1.5px solid ${gremioSel === g.key ? `rgba(${g.rgb},0.60)` : "var(--border-2)"}`,
                      background: gremioSel === g.key ? `rgba(${g.rgb},0.12)` : "var(--surface-2)",
                      color: gremioSel === g.key ? `rgb(${g.rgb})` : "var(--muted)",
                      cursor: "pointer", transition: "all 0.12s",
                    }}>{g.label}</button>
                  ))}
                </div>
              </div>

              {/* Especialidad + búsqueda */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={lblStyle}>Especialidad</label>
                  <select style={selectStyle} value={cargoSel} onChange={e => setCargoSel(e.target.value)}>
                    <option value="TODOS">Todas</option>
                    {especialidades.map(e => (
                      <option key={e} value={e}>{e === "SIN_CARGO" ? "Sin especialidad" : e}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Buscar</label>
                  <input style={inputStyle} value={qMedico} onChange={e => setQMedico(e.target.value)}
                    placeholder="Nombre, ID, teléfono…" />
                </div>
              </div>

              {/* Quick select */}
              <div>
                <label style={lblStyle}>Selección rápida (sobre visibles)</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { label: "Todos",           fn: () => selectAll(true)               },
                    { label: "Ninguno",          fn: () => selectAll(false)              },
                    { label: "Solo titulares",   fn: () => selectByTipo("TITULAR")       },
                    { label: "Solo suplentes",   fn: () => selectByTipo("SUPLENTE")      },
                    { label: "Solo independ.",   fn: () => selectByTipo("INDEPENDIENTE") },
                  ].map(b => (
                    <button key={b.label} onClick={b.fn} style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                      border: "1px solid var(--border)", background: "var(--surface-2)",
                      color: "var(--muted)", cursor: "pointer", transition: "background 0.12s",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--blue-tint)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    >{b.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Aviso filtro por sector */}
            {sectorIdSel && (
              <div style={{
                padding: "7px 12px", borderRadius: 8, marginTop: 4,
                background: "rgba(21,101,192,0.07)", border: "1px solid rgba(21,101,192,0.20)",
                fontSize: 12, color: "var(--blue)", lineHeight: 1.4,
              }}>
                Mostrando solo médicos habilitados para <b>{sectorFinal}</b>.
                Los que no tienen ese sector en su perfil no aparecen.
              </div>
            )}

            {/* Separador */}
            <div style={{ height: 1, background: "var(--border-2)", margin: "14px 0" }} />

            {/* Lista de médicos */}
            <div style={{ display: "grid", gap: 6, maxHeight: 520, overflowY: "auto", paddingRight: 2 }}>
              {medicosVisibles.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>Sin médicos para los filtros seleccionados.</p>
              )}
              {medicosVisibles.map((m: any) => {
                const checked   = !!dest[m.userId];
                const rgb       = TIPO_RGB[m.tipo as MedicoTipo] ?? "100,116,139";
                const ov        = prioOverride[m.userId];
                const eff       = prioEff(m.userId, m.prioridad);
                const actividad = medicosActividad.get(m.userId);

                return (
                  <div key={m.userId} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${checked ? `rgba(${rgb},0.35)` : "var(--border-2)"}`,
                    background: checked ? `rgba(${rgb},0.06)` : "var(--surface-2)",
                    borderLeft: `3px solid ${checked ? `rgb(${rgb})` : "transparent"}`,
                    transition: "all 0.12s",
                  }} onClick={() => toggle(m.userId)}>
                    {/* Checkbox */}
                    <input type="checkbox" checked={checked} onChange={() => toggle(m.userId)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{m.displayName}</span>
                        <TipoBadge tipo={m.tipo} />
                        {m.gremio && (
                          <span style={{
                            padding: "1px 7px", borderRadius: 20, fontSize: 10.5, fontWeight: 700,
                            background: m.gremio === "SAQ" ? "rgba(217,119,6,0.10)" : "rgba(21,101,192,0.10)",
                            color: m.gremio === "SAQ" ? "rgb(160,90,0)" : "rgb(21,101,192)",
                            border: `1px solid ${m.gremio === "SAQ" ? "rgba(217,119,6,0.25)" : "rgba(21,101,192,0.22)"}`,
                          }}>{m.gremio}</span>
                        )}
                        {m.especialidad && (
                          <span style={{ fontSize: 11, color: "var(--subtle)", fontStyle: "italic" }}>{m.especialidad}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--subtle)" }}>
                          {m.userId}{m.telefono ? ` · ${m.telefono}` : ""}
                        </span>
                        {/* Actividad del mes */}
                        {actividad ? (
                          <span style={{
                            fontSize: 10.5, padding: "1px 7px", borderRadius: 20,
                            background: actividad.enCurso ? "rgba(22,163,74,0.12)" : "rgba(21,101,192,0.10)",
                            color: actividad.enCurso ? "rgb(16,130,55)" : "rgb(30,80,160)",
                            border: `1px solid ${actividad.enCurso ? "rgba(22,163,74,0.28)" : "rgba(21,101,192,0.22)"}`,
                            fontWeight: 600,
                          }}>
                            {actividad.enCurso ? "● En guardia" : `${actividad.confirmadas}× este mes`}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 10.5, padding: "1px 7px", borderRadius: 20,
                            background: "rgba(100,116,139,0.08)", color: "var(--subtle)",
                            border: "1px solid rgba(100,116,139,0.15)", fontWeight: 500,
                          }}>Sin guardias este mes</span>
                        )}
                      </div>
                    </div>

                    {/* Prioridad override — solo visible en modo manual o si ya tiene override */}
                    {(prioMode === "MANUAL" || ov !== undefined) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <input
                          type="number" min={1}
                          placeholder={String(m.prioridad ?? "—")}
                          value={ov === undefined ? "" : String(ov)}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const v = normalizePrioInput(e.target.value);
                            setPrioOverride(prev => ({ ...prev, [m.userId]: v }));
                          }}
                          title="Prioridad manual para esta convocatoria"
                          style={{
                            width: 50, padding: "4px 6px", borderRadius: 6, textAlign: "center",
                            border: `1px solid ${ov !== undefined ? "rgba(217,119,6,0.60)" : "var(--border-2)"}`,
                            background: ov !== undefined ? "rgba(217,119,6,0.08)" : "var(--surface)",
                            fontSize: 12, color: "var(--text)",
                          }}
                        />
                        <span style={{ fontSize: 10.5, color: "var(--subtle)", minWidth: 28 }}>
                          P{eff === 9999 ? "—" : eff}
                        </span>
                        {ov !== undefined && (
                          <button onClick={e => { e.stopPropagation(); setPrioOverride(p => { const n = {...p}; delete n[m.userId]; return n; }); }}
                            title="Limpiar override"
                            style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 11, cursor: "pointer", color: "var(--muted)" }}>✕</button>
                        )}
                      </div>
                    )}

                    {/* En modo SCORING: mostrar prioridad de catálogo como referencia */}
                    {prioMode === "SCORING" && ov === undefined && (
                      <span style={{
                        fontSize: 11, padding: "2px 7px", borderRadius: 6, flexShrink: 0,
                        background: "var(--surface)", border: "1px solid var(--border-2)",
                        color: "var(--subtle)",
                      }}>P{eff === 9999 ? "—" : eff}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

      </div>
    </AppShell>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)",
};
const h3Style: React.CSSProperties = { margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--text)" };
const lblStyle: React.CSSProperties = {
  display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em",
};
const hintStyle: React.CSSProperties = { margin: "5px 0 0", fontSize: 11.5, color: "var(--subtle)", lineHeight: 1.4 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9, boxSizing: "border-box",
  border: "1.5px solid var(--border)", background: "var(--surface-2)",
  fontSize: 13.5, color: "var(--text)", fontFamily: "inherit",
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const ghostBtn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--muted)", fontSize: 13, cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  padding: "9px 20px", borderRadius: 10, border: "none",
  background: "linear-gradient(180deg,#1976D2,#1565C0)", color: "#fff",
  fontWeight: 700, fontSize: 13.5, cursor: "pointer",
  boxShadow: "0 2px 8px rgba(21,101,192,0.30)",
};
