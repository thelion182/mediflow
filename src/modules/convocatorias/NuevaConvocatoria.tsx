import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authStore } from "../../auth/auth.store";
import { AppShell } from "../../ui/AppShell";
import { minutesFromNow, toLocalDateTimeInputValue } from "../../core/date";
import { convocatoriaStore } from "./convocatoria.store";
import { medicosStore } from "../admin/medicos.store";
import { sectoresStore } from "../admin/sectores.store";
import { sedesStore } from "../admin/sedes.store";
import { configStore } from "../config/config.store";
import { CANAL_META } from "../config/config.types";
import type { Canal } from "./convocatoria.types";

type ModoEnvio = "MASIVO" | "SECUENCIAL";

function prio(n?: number) {
  return typeof n === "number" && isFinite(n) ? n : 9999;
}

function cargoOf(m: any) {
  // Usamos especialidad como “Cargo/Especialidad” para filtrar.
  const c = String(m?.especialidad ?? "").trim();
  return c || "SIN_CARGO";
}

function normalizePrioInput(raw: any): number | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!isFinite(n)) return undefined;
  const v = Math.floor(n);
  return v < 1 ? 1 : v;
}

const OTRO = "__OTRO__";

export function NuevaConvocatoria() {
  const session = authStore.getSession()!;
  const nav = useNavigate();

  // ✅ Para “releer” catálogos sin recargar
  const [tick, setTick] = useState(0);

  // =========================
  // Catálogos (Administración)
  // =========================
  const sectoresActivos = useMemo(() => {
    return sectoresStore.list().filter((s: any) => (s.activo ?? true));
  }, [tick]);

  const sedesActivas = useMemo(() => {
    return sedesStore.list().filter((s: any) => (s.activo ?? true));
  }, [tick]);

  // =========================
  // Sector / Sede (dropdown + “Otro…”)
  // =========================
  const [sectorSel, setSectorSel] = useState<string>(() => sectoresActivos[0]?.nombre ?? "Emergencia");
  const [sectorOtro, setSectorOtro] = useState("");

  const [sedeSel, setSedeSel] = useState<string>(() => sedesActivas[0]?.nombre ?? "Sanatorio");
  const [sedeOtro, setSedeOtro] = useState("");

  // Si cambia el catálogo y lo seleccionado ya no existe, caemos al primero (o a default).
  useEffect(() => {
    const names = new Set(sectoresActivos.map((s: any) => s.nombre));
    if (sectorSel !== OTRO && sectorSel && !names.has(sectorSel)) {
      setSectorSel(sectoresActivos[0]?.nombre ?? "Emergencia");
    }
    // si catálogo vacío, dejamos el valor actual (no lo pisamos), pero evitamos OTRO si quedó colgado
    if (sectoresActivos.length === 0 && sectorSel !== OTRO && !sectorSel) {
      setSectorSel("Emergencia");
    }
  }, [sectoresActivos.map((s: any) => s.nombre).join("|")]);

  useEffect(() => {
    const names = new Set(sedesActivas.map((s: any) => s.nombre));
    if (sedeSel !== OTRO && sedeSel && !names.has(sedeSel)) {
      setSedeSel(sedesActivas[0]?.nombre ?? "Sanatorio");
    }
    if (sedesActivas.length === 0 && sedeSel !== OTRO && !sedeSel) {
      setSedeSel("Sanatorio");
    }
  }, [sedesActivas.map((s: any) => s.nombre).join("|")]);

  function sectorValueFinal() {
    return (sectorSel === OTRO ? sectorOtro : sectorSel).trim();
  }
  function sedeValueFinal() {
    const v = (sedeSel === OTRO ? sedeOtro : sedeSel).trim();
    return v || undefined;
  }

  // =========================
  // Turno
  // =========================
  const [inicio, setInicio] = useState(toLocalDateTimeInputValue(minutesFromNow(60)));
  const [fin, setFin] = useState(toLocalDateTimeInputValue(minutesFromNow(60 + 12 * 60)));
  const [cupos, setCupos] = useState(1);
  const [vencimiento, setVencimiento] = useState(toLocalDateTimeInputValue(minutesFromNow(6 * 60)));
  const [prioridad, setPrioridad] = useState<"NORMAL" | "ALTA">("NORMAL");
  const [notas, setNotas] = useState("");

  // Canales: se leen de config para saber cuáles están habilitados
  const cfg = configStore.get();
  const canalesEnabled: Canal[] = (["APP", "WHATSAPP", "SMS", "EMAIL"] as Canal[]).filter(c => {
    if (c === "APP")      return cfg.canales.app.enabled;
    if (c === "WHATSAPP") return cfg.canales.whatsapp.enabled;
    if (c === "SMS")      return cfg.canales.sms.enabled;
    if (c === "EMAIL")    return cfg.canales.email.enabled;
    return false;
  });
  const [canalesSel, setCanalesSel] = useState<Canal[]>(() => {
    const defaults = configStore.get().defaultCanales;
    const enabled = (["APP", "WHATSAPP", "SMS", "EMAIL"] as Canal[]).filter(c => {
      const conf = configStore.get().canales;
      if (c === "APP")      return conf.app.enabled;
      if (c === "WHATSAPP") return conf.whatsapp.enabled;
      if (c === "SMS")      return conf.sms.enabled;
      if (c === "EMAIL")    return conf.email.enabled;
      return false;
    });
    const valid = defaults.filter(c => enabled.includes(c));
    return valid.length > 0 ? valid : (enabled.length > 0 ? [enabled[0]] : ["APP"]);
  });

  function toggleCanal(canal: Canal) {
    setCanalesSel(prev =>
      prev.includes(canal) ? prev.filter(c => c !== canal) : [...prev, canal]
    );
  }

  // Modo + timeouts (solo relevantes en secuencial)
  const [modoEnvio, setModoEnvio] = useState<ModoEnvio>("SECUENCIAL");
  const [sinVerMin, setSinVerMin] = useState(60);
  const [sinResponderMin, setSinResponderMin] = useState(60);

  // ✅ Filtro por especialidad
  const [cargoSel, setCargoSel] = useState<string>("TODOS");

  // ✅ NUEVO: buscador libre en médicos (lo último que pediste)
  const [qMedico, setQMedico] = useState("");

  // ✅ prioridad override SOLO para esta convocatoria (no toca catálogo)
  const [prioOverride, setPrioOverride] = useState<Record<string, number | undefined>>({});

  // Catálogo activo ordenado por prioridad (base)
  const medicosOrdenados = useMemo(() => {
    const list = medicosStore.list().filter((m: any) => (m.activo ?? true));
    return [...list].sort((a: any, b: any) => prio(a.prioridad) - prio(b.prioridad));
  }, [tick]);

  // ✅ Especialidades disponibles
  const cargosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const m of medicosOrdenados) set.add(cargoOf(m));
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [medicosOrdenados.map((m: any) => `${m.userId}:${m.especialidad ?? ""}`).join("|")]);

  // selección (por defecto: todos activos)
  const [dest, setDest] = useState<Record<string, boolean>>({});

  // Inicializa / sincroniza selección con catálogo
  useEffect(() => {
    setDest(prev => {
      const next: Record<string, boolean> = { ...prev };

      for (const m of medicosOrdenados) {
        if (next[m.userId] === undefined) next[m.userId] = true;
      }

      const ids = new Set(medicosOrdenados.map((m: any) => m.userId));
      for (const k of Object.keys(next)) if (!ids.has(k)) delete next[k];

      return next;
    });

    setPrioOverride(prev => {
      const ids = new Set(medicosOrdenados.map((m: any) => m.userId));
      const next: Record<string, number | undefined> = { ...prev };
      for (const k of Object.keys(next)) if (!ids.has(k)) delete next[k];
      return next;
    });
  }, [medicosOrdenados.map((m: any) => m.userId).join("|")]);

  function refreshCatalogo() {
    setTick(t => t + 1);
  }

  function toggle(id: string) {
    setDest(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // OJO: ahora selectAll/selectSoloSuplentes trabajan SOLO sobre visibles (bien)
  function selectAll(v: boolean) {
    const next: Record<string, boolean> = {};
    for (const m of medicosFiltradosOrdenados) next[m.userId] = v;
    setDest(prev => ({ ...prev, ...next }));
  }

  function selectSoloSuplentes() {
    const next: Record<string, boolean> = {};
    for (const m of medicosFiltradosOrdenados) {
      next[m.userId] = String((m as any).tipo ?? "SUPLENTE") === "SUPLENTE";
    }
    setDest(prev => ({ ...prev, ...next }));
  }

  // ✅ prioridad efectiva: override > catálogo > 9999
  function prioEff(userId: string, catPrio?: number) {
    const o = prioOverride[userId];
    if (typeof o === "number" && isFinite(o)) return Math.max(1, Math.floor(o));
    if (typeof catPrio === "number" && isFinite(catPrio)) return Math.max(1, Math.floor(catPrio));
    return 9999;
  }

  // ✅ pool visible según especialidad
  const medicosVisibles = useMemo(() => {
    if (cargoSel === "TODOS") return medicosOrdenados;
    return medicosOrdenados.filter((m: any) => cargoOf(m) === cargoSel);
  }, [medicosOrdenados, cargoSel]);

  // ✅ NUEVO: filtro por búsqueda (nombre / id / teléfono / especialidad)
  const medicosBuscados = useMemo(() => {
    const q = qMedico.trim().toLowerCase();
    if (!q) return medicosVisibles;

    return medicosVisibles.filter((m: any) => {
      const name = String(m.displayName ?? "").toLowerCase();
      const id = String(m.userId ?? "").toLowerCase();
      const tel = String(m.telefono ?? "").toLowerCase();
      const esp = String(m.especialidad ?? "").toLowerCase();
      return name.includes(q) || id.includes(q) || tel.includes(q) || esp.includes(q);
    });
  }, [medicosVisibles, qMedico]);

  // ✅ orden recalculado SOLO dentro del filtro usando prioEff
  const medicosFiltradosOrdenados = useMemo(() => {
    return [...medicosBuscados].sort((a: any, b: any) => {
      const pa = prioEff(a.userId, a.prioridad);
      const pb = prioEff(b.userId, b.prioridad);
      if (pa !== pb) return pa - pb;
      return String(a.displayName || "").localeCompare(String(b.displayName || ""));
    });
  }, [
    medicosBuscados.map((m: any) => `${m.userId}:${m.prioridad ?? ""}:${m.displayName ?? ""}`).join("|"),
    cargoSel,
    qMedico,
    JSON.stringify(prioOverride)
  ]);

  // ✅ destinatarios: SOLO del pool filtrado/buscado, y en el ORDEN recalculado
  const destinatarios = useMemo(() => {
    return medicosFiltradosOrdenados.map((m: any) => m.userId).filter(id => !!dest[id]);
  }, [dest, medicosFiltradosOrdenados]);

  // ✅ Si cupos > 1, SECUENCIAL no aplica
  useEffect(() => {
    if (Number(cupos) > 1 && modoEnvio === "SECUENCIAL") setModoEnvio("MASIVO");
  }, [cupos, modoEnvio]);

  const cuposNum = Number(cupos) || 1;
  const modoFinal: ModoEnvio = modoEnvio === "SECUENCIAL" && cuposNum !== 1 ? "MASIVO" : modoEnvio;

  const previewOrden = useMemo(() => {
    return destinatarios.slice(0, 10).map((id, idx) => {
      const m = medicosFiltradosOrdenados.find((x: any) => x.userId === id);
      return { idx: idx + 1, id, name: m?.displayName ?? id, prio: prioEff(id, m?.prioridad) };
    });
  }, [destinatarios, medicosFiltradosOrdenados, prioOverride]);

  function submit() {
    const sectorFinal = sectorValueFinal();
    const sedeFinal = sedeValueFinal();

    if (!sectorFinal) return alert("Sector es obligatorio.");
    if (!inicio || !fin) return alert("Inicio y fin son obligatorios.");
    if (new Date(fin).getTime() <= new Date(inicio).getTime()) return alert("Fin debe ser posterior a Inicio.");
    if (canalesSel.length === 0) return alert("Seleccioná al menos un canal de envío.");
    if (destinatarios.length === 0) return alert("Seleccioná al menos un médico destinatario.");

    if (modoFinal === "SECUENCIAL") {
      if (cuposNum !== 1) return alert("SECUENCIAL solo aplica con 1 cupo.");
      if (destinatarios.length === 1) {
        const ok = confirm("Tenés solo 1 médico seleccionado. ¿Querés enviar igual en SECUENCIAL?");
        if (!ok) return;
      }
    }

    const finalCanales = canalesSel.length > 0 ? canalesSel : ["APP" as Canal];

    const c = convocatoriaStore.createAndSend({
      sector: sectorFinal,
      sede: sedeFinal,
      inicio: new Date(inicio).toISOString(),
      fin: new Date(fin).toISOString(),
      cupos: cuposNum,
      vencimiento: new Date(vencimiento).toISOString(),
      prioridad,
      notas: notas.trim() || undefined,
      createdBy: session.userId,

      destinatarios,   // ya va en orden real (filtro + búsqueda + override)
      keepOrder: true,
      modoEnvio: modoFinal,
      canales: finalCanales,

      timeouts:
        modoFinal === "SECUENCIAL"
          ? { sinVerMin: Number(sinVerMin) || 60, sinResponderMin: Number(sinResponderMin) || 60 }
          : undefined
    });

    nav(`/dashboard/c/${c.id}`);
  }

  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Nueva Convocatoria</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Seleccionados: <b>{destinatarios.length}</b> · Modo: <b>{modoFinal}</b> · Cupos: <b>{cuposNum}</b>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btnGhost" onClick={refreshCatalogo} title="Releer catálogos">↺</button>
          <button className="btn" onClick={submit}>Enviar convocatoria</button>
        </div>
      </div>

        <div className="grid" style={{ gap: 14 }}>
          {/* IZQUIERDA */}
          <div className="panel half">
            <h3 style={{ margin: 0, fontSize: 14 }}>Datos del turno</h3>

            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              {/* Sector */}
              <div className="field">
                <label className="label">Sector</label>
                <select className="select" value={sectorSel} onChange={(e) => setSectorSel(e.target.value)}>
                  {sectoresActivos.map((s: any) => (
                    <option key={s.id} value={s.nombre}>{s.nombre}</option>
                  ))}
                  <option value={OTRO}>Otro…</option>
                </select>
                {sectorSel === OTRO ? (
                  <input
                    className="input"
                    placeholder="Escribí el sector"
                    value={sectorOtro}
                    onChange={(e) => setSectorOtro(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                ) : null}
              </div>

              {/* Sede */}
              <div className="field">
                <label className="label">Sede / Servicio</label>
                <select className="select" value={sedeSel} onChange={(e) => setSedeSel(e.target.value)}>
                  {sedesActivas.map((s: any) => (
                    <option key={s.id} value={s.nombre}>
                      {s.nombre}{s.tipo ? ` · ${s.tipo}` : ""}
                    </option>
                  ))}
                  <option value={OTRO}>Otro…</option>
                </select>
                {sedeSel === OTRO ? (
                  <input
                    className="input"
                    placeholder="Escribí la sede/servicio"
                    value={sedeOtro}
                    onChange={(e) => setSedeOtro(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                ) : null}
              </div>

              <div className="field">
                <label className="label">Inicio</label>
                <input className="input" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>

              <div className="field">
                <label className="label">Fin</label>
                <input className="input" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>

              <div className="field">
                <label className="label">Cupos</label>
                <input className="input" type="number" min={1} value={cupos} onChange={(e) => setCupos(Number(e.target.value))} />
                {Number(cupos) > 1 ? (
                  <div className="sub" style={{ marginTop: 6 }}>
                    Nota: con más de 1 cupo, el envío se comporta como MASIVO.
                  </div>
                ) : null}
              </div>

              <div className="field">
                <label className="label">Vencimiento general</label>
                <input className="input" type="datetime-local" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
              </div>

              <div className="field">
                <label className="label">Prioridad (turno)</label>
                <select className="select" value={prioridad} onChange={(e) => setPrioridad(e.target.value as any)}>
                  <option value="NORMAL">Normal</option>
                  <option value="ALTA">Alta</option>
                </select>
              </div>

              <div className="field">
                <label className="label">Modo de envío</label>
                <select
                  className="select"
                  value={modoEnvio}
                  onChange={(e) => setModoEnvio(e.target.value as ModoEnvio)}
                  disabled={Number(cupos) > 1}
                  title={Number(cupos) > 1 ? "Con más de 1 cupo, SECUENCIAL se deshabilita" : undefined}
                >
                  <option value="SECUENCIAL">Secuencial (por prioridad)</option>
                  <option value="MASIVO">Masivo (a todos)</option>
                </select>

                {modoFinal === "SECUENCIAL" ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Timeout sin ver (minutos)</label>
                      <input className="input" type="number" min={1} value={sinVerMin} onChange={(e) => setSinVerMin(Number(e.target.value))} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Timeout sin responder (minutos)</label>
                      <input className="input" type="number" min={1} value={sinResponderMin} onChange={(e) => setSinResponderMin(Number(e.target.value))} />
                    </div>
                    <div className="sub">
                      Flujo: se activa el #1. Si no la ve o no responde en tiempo, pasa al siguiente.
                    </div>
                  </div>
                ) : (
                  <div className="sub" style={{ marginTop: 8 }}>
                    Masivo: les llega a todos los seleccionados al mismo tiempo.
                  </div>
                )}
              </div>

              {/* Canales de envío */}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="label">Canales de envío</label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                  {canalesEnabled.map(canal => {
                    const meta = CANAL_META[canal];
                    const sel = canalesSel.includes(canal);
                    return (
                      <button
                        key={canal}
                        type="button"
                        onClick={() => toggleCanal(canal)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: sel ? `2px solid rgba(${meta.rgb},1)` : "2px solid var(--border)",
                          background: sel ? `rgba(${meta.rgb},0.12)` : "var(--surface)",
                          color: sel ? `rgb(${meta.rgb})` : "var(--muted)",
                          fontWeight: sel ? 700 : 400,
                          cursor: "pointer",
                          fontSize: 13,
                          transition: "all 0.15s"
                        }}
                      >
                        <span style={{ fontSize: 15 }}>{meta.icon}</span>
                        {meta.label}
                        {sel && <span style={{ fontSize: 11, marginLeft: 2 }}>✓</span>}
                      </button>
                    );
                  })}
                  {canalesEnabled.length === 0 && (
                    <span className="sub">Solo APP disponible (configurar canales en Configuración)</span>
                  )}
                </div>
                {canalesSel.length === 0 && (
                  <div className="sub" style={{ marginTop: 6, color: "var(--danger, #dc2626)" }}>
                    Seleccioná al menos un canal.
                  </div>
                )}
                {canalesSel.length > 0 && (
                  <div className="sub" style={{ marginTop: 6 }}>
                    Canal principal: <b>{CANAL_META[canalesSel[0]].label}</b>
                    {canalesSel.length > 1 ? ` · también: ${canalesSel.slice(1).map(c => CANAL_META[c].label).join(", ")}` : ""}
                  </div>
                )}
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="label">Notas</label>
                <textarea
                  className="input"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={4}
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>

            {/* Preview */}
            <div className="panel" style={{ marginTop: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>
                Orden de contacto {modoFinal === "SECUENCIAL" ? "(secuencial real)" : "(referencia)"}
              </h3>
              <p className="sub" style={{ marginTop: 8 }}>
                {modoFinal === "SECUENCIAL"
                  ? "Así se activa: #1, si vence pasa al #2, etc."
                  : "En masivo se contacta a todos, pero la lista respeta prioridad para lectura rápida."}
              </p>

              {previewOrden.length === 0 ? (
                <p className="sub" style={{ marginTop: 8 }}>Sin destinatarios seleccionados.</p>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {previewOrden.map(x => (
                    <div key={x.id} className="btnGhost" style={{ padding: 10, textAlign: "left" }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <b>#{x.idx} · {x.name}</b>
                        <span className="pill">Prio {x.prio === 9999 ? "—" : x.prio}</span>
                      </div>
                      <div className="sub" style={{ marginTop: 6 }}>{x.id}</div>
                    </div>
                  ))}
                  {destinatarios.length > previewOrden.length ? (
                    <div className="sub">… y {destinatarios.length - previewOrden.length} más.</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* DERECHA */}
          <div className="panel half">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Destinatarios (por especialidad + orden real)</h3>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btnGhost" onClick={() => selectAll(true)}>Todos (visibles)</button>
                <button className="btnGhost" onClick={() => selectAll(false)}>Ninguno (visibles)</button>
                <button className="btnGhost" onClick={selectSoloSuplentes}>Solo suplentes (visibles)</button>
              </div>
            </div>

            <p className="sub" style={{ marginTop: 8 }}>
              Filtrás por especialidad y el orden se recalcula usando <b>Prioridad de Catálogo</b> o tu <b>override</b>.
            </p>

            {/* Panel filtros + buscador (mejora visual simple) */}
            <div className="panel" style={{ marginTop: 10, padding: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13 }}>Filtros</b>
                <span className="pill">
                  {cargoSel === "TODOS" ? "TODOS" : cargoSel === "SIN_CARGO" ? "SIN ESPECIALIDAD" : cargoSel}
                </span>
              </div>

              {/* ✅ BUSCADOR (pedido) */}
              <div className="field" style={{ marginTop: 10 }}>
                <label className="label">Buscar médico</label>
                <input
                  className="input"
                  value={qMedico}
                  onChange={(e) => setQMedico(e.target.value)}
                  placeholder="Nombre, userId, teléfono o especialidad…"
                />
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <label className="label">Especialidad</label>
                <select className="select" value={cargoSel} onChange={(e) => setCargoSel(e.target.value)}>
                  <option value="TODOS">Todos</option>
                  {cargosDisponibles.map(cg => (
                    <option key={cg} value={cg}>{cg === "SIN_CARGO" ? "Sin especialidad" : cg}</option>
                  ))}
                </select>
              </div>

              <div className="sub" style={{ marginTop: 10 }}>
                Mostrando <b>{medicosFiltradosOrdenados.length}</b> médico(s) según filtros.
              </div>
            </div>

            {/* Lista */}
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {medicosFiltradosOrdenados.map((m: any) => {
                const catP = typeof m.prioridad === "number" ? m.prioridad : undefined;
                const ov = prioOverride[m.userId];
                const eff = prioEff(m.userId, catP);

                return (
                  <label
                    key={m.userId}
                    className="btnGhost"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "center",
                      padding: 12
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {m.displayName}
                        <span className="pill" style={{ marginLeft: 8 }}>
                          Prio eff: {eff === 9999 ? "—" : eff}
                        </span>
                        <span className="pill" style={{ marginLeft: 8 }}>
                          Cat: {typeof catP === "number" ? catP : "—"}
                        </span>
                        <span className="pill" style={{ marginLeft: 8 }}>
                          {String(m.tipo ?? "SUPLENTE")}
                        </span>
                        <span className="pill" style={{ marginLeft: 8 }}>
                          {cargoOf(m) === "SIN_CARGO" ? "Sin esp." : cargoOf(m)}
                        </span>
                      </div>

                      <div className="sub" style={{ marginTop: 6 }}>
                        {m.userId}
                        {m.telefono ? ` · ${m.telefono}` : ""}
                      </div>

                      <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label className="label">Prio (esta convocatoria)</label>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            placeholder="(vacío = usar catálogo)"
                            value={ov === undefined ? "" : String(ov)}
                            onChange={(e) => {
                              const v = normalizePrioInput(e.target.value);
                              setPrioOverride(prev => ({ ...prev, [m.userId]: v }));
                            }}
                            style={{ width: 220 }}
                          />
                        </div>

                        {ov !== undefined ? (
                          <button
                            className="btnGhost"
                            type="button"
                            onClick={() => {
                              setPrioOverride(prev => {
                                const next = { ...prev };
                                delete next[m.userId];
                                return next;
                              });
                            }}
                            title="Volver a prioridad del catálogo"
                          >
                            Limpiar override
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <input type="checkbox" checked={!!dest[m.userId]} onChange={() => toggle(m.userId)} />
                  </label>
                );
              })}
            </div>

            <div className="pill" style={{ marginTop: 12 }}>
              Seleccionados: {destinatarios.length}
              {modoFinal === "SECUENCIAL" ? " · se contacta 1 a la vez" : " · se contacta a todos"}
            </div>
          </div>
        </div>
    </AppShell>
  );
}
