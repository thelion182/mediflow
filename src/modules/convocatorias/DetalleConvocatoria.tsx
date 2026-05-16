import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authStore } from "../../auth/auth.store";
import { convocatoriaStore, getMedicosCatalogo } from "./convocatoria.store";
import { AppShell } from "../../ui/AppShell";
import type { Canal } from "./convocatoria.types";
import { CANAL_META } from "../config/config.types";

// ── Small components ──────────────────────────────────────────────────────
function CanalTag({ canal }: { canal: Canal }) {
  const meta = CANAL_META[canal] ?? { label: canal, rgb: "100,116,139" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: 5, fontSize: 11, fontWeight: 700,
      background: `rgba(${meta.rgb},0.12)`, color: `rgb(${meta.rgb})`,
      border: `1px solid rgba(${meta.rgb},0.25)`,
    }}>{meta.label}</span>
  );
}

function Chip({ rgb, label }: { rgb: string; label: string }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
      border: `1px solid rgba(${rgb},0.25)`, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={lblStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────
const SUPLENCIAS_WHATSAPP = "+59899737934";

function waLink(phoneE164: string, text: string) {
  const digits = String(phoneE164 || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function fmt(dtIso?: string) {
  if (!dtIso) return "—";
  try { return new Date(dtIso).toLocaleString(); } catch { return "—"; }
}

function toDateTimeLocal(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  } catch { return ""; }
}

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function invChip(estado: string) {
  switch (estado) {
    case "ENVIADA":         return <Chip rgb="21,101,192"  label="ENVIADA" />;
    case "VISTA":           return <Chip rgb="21,101,192"  label="VISTA" />;
    case "EN_ESPERA":       return <Chip rgb="100,116,139" label="EN ESPERA" />;
    case "ACEPTO":          return <Chip rgb="22,163,74"   label="ACEPTÓ" />;
    case "RECHAZO":         return <Chip rgb="220,38,38"   label="RECHAZÓ" />;
    case "VENCIDA":         return <Chip rgb="217,119,6"   label="VENCIDA" />;
    case "SIN_RESPUESTA":   return <Chip rgb="100,116,139" label="SIN CUPO" />;
    case "CUBIERTA_X_OTRO": return <Chip rgb="100,116,139" label="CUBIERTA X OTRO" />;
    default:                return <Chip rgb="100,116,139" label={estado || "—"} />;
  }
}

function estadoChip(estado: string) {
  switch (estado) {
    case "ACTIVA":    return <Chip rgb="21,101,192"  label="ACTIVA" />;
    case "ENVIADA":   return <Chip rgb="21,101,192"  label="ENVIADA" />;
    case "CUBIERTA":  return <Chip rgb="22,163,74"   label="CUBIERTA" />;
    case "PARCIAL":   return <Chip rgb="217,119,6"   label="PARCIAL" />;
    case "VENCIDA":   return <Chip rgb="217,119,6"   label="VENCIDA" />;
    case "CANCELADA": return <Chip rgb="100,116,139" label="CANCELADA" />;
    default:          return <Chip rgb="100,116,139" label={estado || "—"} />;
  }
}

function invLeftBorder(estado: string, isActive: boolean): string {
  if (isActive || estado === "ACEPTO") return "rgb(22,163,74)";
  if (estado === "RECHAZO") return "rgb(220,38,38)";
  if (estado === "VENCIDA") return "rgb(217,119,6)";
  if (estado === "ENVIADA" || estado === "VISTA") return "rgb(21,101,192)";
  return "var(--border)";
}

// ── Component ─────────────────────────────────────────────────────────────
export function DetalleConvocatoria() {
  const { id } = useParams();
  const nav = useNavigate();
  const session = authStore.getSession()!;
  const [tick, setTick] = useState(0);

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    let interval: number | null = null;
    const start = () => {
      if (interval) return;
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") setNowTick(Date.now());
      }, 1000);
    };
    const stop = () => { if (!interval) return; window.clearInterval(interval); interval = null; };
    const onVis = () => {
      if (document.visibilityState === "visible") { setNowTick(Date.now()); start(); } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); stop(); };
  }, []);

  const c = useMemo(() => (id ? convocatoriaStore.get(id) : null), [id, tick]);
  const medicosSnap = useMemo(() => getMedicosCatalogo(), [tick]);
  const medicoName = (medicoId: string) =>
    medicosSnap.find(m => m.userId === medicoId)?.nombre ?? medicoId;

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(() => ({
    sector: c?.sector || "",
    sede: c?.sede || "",
    inicio: c?.inicio || "",
    fin: c?.fin || "",
    cupos: c?.cupos || 1,
    vencimiento: c?.vencimiento || "",
    prioridad: (c?.prioridad || "NORMAL") as "NORMAL" | "ALTA",
    notas: c?.notas || "",
  }));

  useEffect(() => {
    if (!c || editMode) return;
    setForm({
      sector: c.sector || "",
      sede: c.sede || "",
      inicio: c.inicio,
      fin: c.fin,
      cupos: c.cupos,
      vencimiento: c.vencimiento,
      prioridad: c.prioridad,
      notas: c.notas || "",
    });
  }, [c?.id, tick, editMode]);

  if (!c) {
    return (
      <AppShell>
        <div style={panelStyle}>
          <b>Convocatoria no encontrada.</b>
          <div style={{ marginTop: 10 }}>
            <button style={ghostBtn} onClick={() => nav("/dashboard")}>← Volver</button>
          </div>
        </div>
      </AppShell>
    );
  }

  const confirmadas = (c.asignaciones || []).filter(
    x => x.estado === "CONFIRMADA" || x.estado === "CUMPLIDA"
  ).length;

  const isSecuencial = (c.modoEnvio ?? "MASIVO") === "SECUENCIAL" && (Number(c.cupos) || 1) === 1;

  const activeInvIdx = useMemo(() => {
    if (!isSecuencial) return -1;
    return (c.invitaciones || []).findIndex((i: any) => i.estado === "ENVIADA" || i.estado === "VISTA");
  }, [c.id, tick, isSecuencial]);

  const activeInv = isSecuencial && activeInvIdx >= 0 ? (c.invitaciones[activeInvIdx] as any) : null;

  const timeouts = (c as any).timeouts as { sinVerMin: number; sinResponderMin: number } | undefined;
  const sinVerMin = typeof timeouts?.sinVerMin === "number" ? timeouts!.sinVerMin : 60;
  const sinResponderMin = typeof timeouts?.sinResponderMin === "number" ? timeouts!.sinResponderMin : 60;

  const proximoVenc = useMemo(() => {
    if (!isSecuencial || !activeInv) return null;
    const st = String(activeInv.estado || "");
    const sentAt = activeInv.sentAt ? new Date(activeInv.sentAt).getTime() : null;
    const seenAt = activeInv.seenAt ? new Date(activeInv.seenAt).getTime() : null;
    if (st === "ENVIADA" && sentAt !== null)
      return { motivo: `Si NO la ve en ${sinVerMin} min, pasa al siguiente.`, deadline: sentAt + sinVerMin * 60_000 };
    if (st === "VISTA" && seenAt !== null && !activeInv.respondedAt)
      return { motivo: `Si NO responde en ${sinResponderMin} min luego de verla, pasa al siguiente.`, deadline: seenAt + sinResponderMin * 60_000 };
    return null;
  }, [isSecuencial, activeInv?.estado, activeInv?.sentAt, activeInv?.seenAt, activeInv?.respondedAt, sinVerMin, sinResponderMin]);

  const msLeft = proximoVenc ? (proximoVenc.deadline - nowTick) : null;
  const isExpired = typeof msLeft === "number" ? msLeft <= 0 : false;

  const invitacionesOrdenadas = useMemo(() => [...(c.invitaciones || [])], [c.id, tick]);

  // ── Messages ──────────────────────────────────────────────────────────
  function msgUpdate() {
    return `Mediflow · Círculo Católico\nConvocatoria ${c.id} fue ACTUALIZADA.\nSector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\nTurno: ${fmt(c.inicio)} → ${fmt(c.fin)}\nPor favor revisar en la app.`;
  }
  function msgCancel() {
    return `Mediflow · Círculo Católico\nConvocatoria ${c.id} fue CANCELADA.\nSector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\nTurno: ${fmt(c.inicio)} → ${fmt(c.fin)}\nMotivo: ${c.cancelReason || "—"}\nGracias.`;
  }
  function msgTurnoActivo(nextOrd: number) {
    return `Mediflow · Círculo Católico\nTe toca tu turno (#${nextOrd}) en convocatoria ${c.id}.\nSector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\nTurno: ${fmt(c.inicio)} → ${fmt(c.fin)}\nPor favor ingresá a la app y aceptá o rechazá.\nGracias.`;
  }
  function msgRecordatorio(_medicoId: string) {
    return `Mediflow · Círculo Católico\nRecordatorio: se re-envía convocatoria ${c.id}.\nSector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\nTurno: ${fmt(c.inicio)} → ${fmt(c.fin)}\nPor favor ingresá a la app y respondé.\nGracias.`;
  }

  function reenviarA(medicoId: string) {
    const result = convocatoriaStore.reenviarInvitacion(c.id, medicoId);
    if (!result.ok) { alert("No se puede reenviar en el estado actual de esa invitación."); return; }
    setTick(t => t + 1);
    const tel = convocatoriaStore.getMedicoPhone(medicoId);
    if (tel) window.open(waLink(tel, msgRecordatorio(medicoId)), "_blank");
    else alert("Invitación reenviada. El médico no tiene teléfono cargado.");
  }

  function onSaveEdit() {
    const sector = form.sector.trim();
    if (!sector) return alert("Sector es obligatorio.");
    convocatoriaStore.update(
      c.id,
      {
        sector,
        sede: form.sede.trim() || undefined,
        inicio: new Date(form.inicio).toISOString(),
        fin: new Date(form.fin).toISOString(),
        cupos: Number(form.cupos) || 1,
        vencimiento: new Date(form.vencimiento).toISOString(),
        prioridad: form.prioridad,
        notas: form.notas.trim() || undefined,
      },
      session.userId,
      `Editada por ${session.userId}`
    );
    setEditMode(false);
    setTick(t => t + 1);
    alert("Convocatoria actualizada. Podés avisar por WhatsApp desde 'Invitaciones'.");
  }

  function onCancelConv() {
    const reason = (prompt("Motivo de cancelación (obligatorio):") || "").trim();
    if (!reason) return alert("Debe ingresar un motivo.");
    convocatoriaStore.cancel(c.id, reason, session.userId);
    setEditMode(false);
    setTick(t => t + 1);
    alert("Convocatoria cancelada. Podés avisar por WhatsApp desde 'Invitaciones'.");
  }

  function forceAdvanceNow() {
    if (!isSecuencial) return;
    const ok = confirm(
      "Forzar avance secuencial ahora:\n\n- recalcula timeouts\n- si el activo venció, lo marca VENCIDA y activa el siguiente\n\n¿Continuar?"
    );
    if (!ok) return;
    convocatoriaStore.list();
    setTick(t => t + 1);
  }

  function skipToNextNow() {
    if (!isSecuencial || c.estado === "CANCELADA") return;
    const ok = confirm(
      "Activar siguiente (saltando):\n\n- marca al ACTIVO actual como VENCIDA\n- activa el siguiente EN_ESPERA como ENVIADA\n- abre WhatsApp al siguiente (si tiene teléfono)\n\nEsto saltea al médico aunque aún esté en tiempo.\n¿Continuar?"
    );
    if (!ok) return;
    const iso = new Date().toISOString();
    const invs = [...(c.invitaciones || [])].map(i => ({ ...(i as any) })) as any[];
    const activeIdx = invs.findIndex(i => i.estado === "ENVIADA" || i.estado === "VISTA");
    if (activeIdx < 0) { alert("No hay invitación activa para saltar."); return; }
    const nextIdx = invs.findIndex(i => i.estado === "EN_ESPERA");
    if (nextIdx < 0) {
      invs[activeIdx].estado = "VENCIDA";
      invs[activeIdx].respondedAt = iso;
      convocatoriaStore.update(c.id, { invitaciones: invs as any }, session.userId, `Salto manual: no había siguiente (by ${session.userId})`);
      setTick(t => t + 1);
      alert("Se venció el activo, pero no había siguiente EN_ESPERA.");
      return;
    }
    invs[activeIdx].estado = "VENCIDA";
    invs[activeIdx].respondedAt = iso;
    invs[nextIdx].estado = "ENVIADA";
    invs[nextIdx].sentAt = iso;
    delete invs[nextIdx].seenAt;
    delete invs[nextIdx].respondedAt;
    const nextMedicoId = String(invs[nextIdx].medicoId || "");
    const nextOrd = nextIdx + 1;
    convocatoriaStore.update(c.id, { invitaciones: invs as any }, session.userId, `Salto manual al siguiente (by ${session.userId})`);
    setTick(t => t + 1);
    const tel = convocatoriaStore.getMedicoPhone(nextMedicoId);
    if (tel) window.open(waLink(tel, msgTurnoActivo(nextOrd)), "_blank");
    else alert(`Siguiente activado (ORD #${nextOrd}), pero no tiene teléfono cargado.`);
  }

  const waMsg = c.estado === "CANCELADA" ? msgCancel() : msgUpdate();

  return (
    <AppShell>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => nav("/dashboard")} style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12, marginBottom: 14 }}>
          ← Convocatorias
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>
              {c.sector}{c.sede ? ` · ${c.sede}` : ""}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
              {fmt(c.inicio)} → {fmt(c.fin)} · <b>{isSecuencial ? "SECUENCIAL" : "MASIVO"}</b>
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {estadoChip(c.estado)}
            <button style={ghostBtn} onClick={() => setTick(t => t + 1)}>↺ Refrescar</button>
            {isSecuencial && c.estado !== "CANCELADA" && <>
              <button
                style={{ ...ghostBtn, borderColor: "rgba(245,158,11,.35)" }}
                onClick={forceAdvanceNow}
                title="Fuerza la evaluación de timeouts del secuencial ahora"
              >Forzar avance</button>
              <button
                style={{ ...ghostBtn, borderColor: "rgba(220,38,38,.35)" }}
                onClick={skipToNextNow}
                title="Salta al siguiente médico + WhatsApp automático"
              >Activar siguiente</button>
            </>}
            {c.estado !== "CANCELADA" && <>
              <button style={ghostBtn} onClick={() => setEditMode(v => !v)}>
                {editMode ? "Cerrar edición" : "Editar"}
              </button>
              <button
                style={{ ...ghostBtn, borderColor: "rgba(220,38,38,.25)", color: "rgb(220,38,38)" }}
                onClick={onCancelConv}
              >Cancelar conv.</button>
            </>}
          </div>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {([
          ["Cupos", `${confirmadas} / ${c.cupos}`],
          ["Invitados", String(invitacionesOrdenadas.length)],
          ["Vencimiento", fmt(c.vencimiento)],
          ["Prioridad", c.prioridad],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={kpiChip}>
            <span style={kpiLabel}>{label}</span>
            <span style={kpiVal}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {/* ── Countdown (SECUENCIAL only) ── */}
        {isSecuencial && (
          <div style={panelStyle}>
            <h3 style={h3Style}>Secuencial · Médico activo</h3>
            {activeInv ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <Chip rgb="22,163,74" label={`ACTIVO: ${medicoName(activeInv.medicoId)}`} />
                  <Chip rgb="100,116,139" label={`ORD #${activeInvIdx + 1}`} />
                  {invChip(activeInv.estado)}
                  <Chip rgb="100,116,139" label={`sinVer: ${sinVerMin}m`} />
                  <Chip rgb="100,116,139" label={`sinResp: ${sinResponderMin}m`} />
                </div>
                {proximoVenc ? (
                  <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 13 }}>Cuenta regresiva</b>
                      {isExpired
                        ? <Chip rgb="220,38,38" label="VENCIDO" />
                        : <Chip rgb={msLeft! < 2 * 60_000 ? "217,119,6" : "21,101,192"} label={formatMs(msLeft!)} />
                      }
                    </div>
                    <p style={subStyle}>Vence a las: <b>{new Date(proximoVenc.deadline).toLocaleString()}</b></p>
                    <p style={subStyle}>{proximoVenc.motivo}</p>
                    {isExpired && <p style={subStyle}>Si querés que avance YA, tocá <b>Forzar avance</b>.</p>}
                  </div>
                ) : (
                  <p style={subStyle}>No hay vencimiento calculable (puede que ya haya respondido o no hay timestamps).</p>
                )}
              </div>
            ) : (
              <p style={{ ...subStyle, marginTop: 10 }}>
                No hay invitación activa (puede haber terminado la secuencia o estar cubierta).
              </p>
            )}
          </div>
        )}

        {/* ── 2-column layout ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 2fr", gap: 16, alignItems: "start" }}>

          {/* LEFT: Detalles + Edit form */}
          <div style={{ display: "grid", gap: 16 }}>
            <div style={panelStyle}>
              <h3 style={{ ...h3Style, marginBottom: 12 }}>Detalles</h3>
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                {([
                  ["Sector", c.sector],
                  ["Sede", c.sede || "—"],
                  ["Inicio", fmt(c.inicio)],
                  ["Fin", fmt(c.fin)],
                  ["Vencimiento", fmt(c.vencimiento)],
                  ["Cupos", String(c.cupos)],
                  ["Prioridad", c.prioridad],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--muted)", minWidth: 88, flexShrink: 0 }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                {c.cancelReason && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--muted)", minWidth: 88, flexShrink: 0 }}>Cancelación</span>
                    <span style={{ fontWeight: 500 }}>{c.cancelReason}</span>
                  </div>
                )}
                {c.notas && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--muted)", minWidth: 88, flexShrink: 0 }}>Notas</span>
                    <span style={{ fontWeight: 500 }}>{c.notas}</span>
                  </div>
                )}
              </div>
            </div>

            {editMode && (
              <div style={panelStyle}>
                <h3 style={{ ...h3Style, marginBottom: 14 }}>Editar convocatoria</h3>
                <div style={{ display: "grid", gap: 12 }}>
                  <Field label="Sector">
                    <input style={inputStyle} value={form.sector}
                      onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} />
                  </Field>
                  <Field label="Sede (opcional)">
                    <input style={inputStyle} value={form.sede}
                      onChange={e => setForm(f => ({ ...f, sede: e.target.value }))} />
                  </Field>
                  <Field label="Inicio">
                    <input style={inputStyle} type="datetime-local" value={toDateTimeLocal(form.inicio)}
                      onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))} />
                  </Field>
                  <Field label="Fin">
                    <input style={inputStyle} type="datetime-local" value={toDateTimeLocal(form.fin)}
                      onChange={e => setForm(f => ({ ...f, fin: e.target.value }))} />
                  </Field>
                  <Field label="Vencimiento">
                    <input style={inputStyle} type="datetime-local" value={toDateTimeLocal(form.vencimiento)}
                      onChange={e => setForm(f => ({ ...f, vencimiento: e.target.value }))} />
                  </Field>
                  <Field label="Cupos">
                    <input style={inputStyle} type="number" min={1} value={form.cupos}
                      onChange={e => setForm(f => ({ ...f, cupos: Number(e.target.value) }))} />
                  </Field>
                  <Field label="Prioridad">
                    <select style={{ ...inputStyle, cursor: "pointer" }} value={form.prioridad}
                      onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as "NORMAL" | "ALTA" }))}>
                      <option value="NORMAL">Normal</option>
                      <option value="ALTA">Alta</option>
                    </select>
                  </Field>
                  <Field label="Notas (opcional)">
                    <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical" }} value={form.notas}
                      onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
                  </Field>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
                    <button style={primaryBtn} onClick={onSaveEdit}>Guardar cambios</button>
                    <button style={ghostBtn} onClick={() => setEditMode(false)}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Invitations */}
          <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <h3 style={h3Style}>Invitaciones · {invitacionesOrdenadas.length}</h3>
              <a
                href={waLink(SUPLENCIAS_WHATSAPP, waMsg)}
                target="_blank" rel="noreferrer"
                style={{ ...ghostBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                title="Mensaje para Suplencias (uso interno)"
              >WA Suplencias</a>
            </div>

            <p style={subStyle}>
              {isSecuencial
                ? <><b>SECUENCIAL:</b> sólo el médico activo recibe y responde. Si vence por tiempo, avanza al siguiente.</>
                : <><b>MASIVO:</b> se envió a todos al mismo tiempo.</>
              }{" "}
              WhatsApp se habilita sólo si el médico tiene teléfono cargado.
            </p>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {invitacionesOrdenadas.map((inv: any, idx: number) => {
                const tel = convocatoriaStore.getMedicoPhone(inv.medicoId);
                const isActive = isSecuencial && idx === activeInvIdx &&
                  (inv.estado === "ENVIADA" || inv.estado === "VISTA");
                const leftColor = invLeftBorder(inv.estado, isActive);

                return (
                  <div key={inv.medicoId} style={{
                    background: isActive ? "rgba(22,163,74,0.04)" : "var(--surface-2)",
                    border: `1px solid ${isActive ? "rgba(22,163,74,0.30)" : "var(--border)"}`,
                    borderLeft: `3px solid ${leftColor}`,
                    borderRadius: 10, padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 13 }}>{medicoName(inv.medicoId)}</b>
                        <Chip rgb="100,116,139" label={`#${idx + 1}`} />
                        {invChip(inv.estado)}
                        {isActive && <Chip rgb="22,163,74" label="ACTIVO" />}
                        {inv.canal && inv.estado !== "EN_ESPERA" && <CanalTag canal={inv.canal as Canal} />}
                        {tel
                          ? <Chip rgb="100,116,139" label={tel} />
                          : <Chip rgb="220,38,38" label="Sin teléfono" />
                        }
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(inv.estado === "VENCIDA" || inv.estado === "SIN_RESPUESTA" || inv.estado === "CUBIERTA_X_OTRO")
                          && c.estado !== "CANCELADA" && c.estado !== "CUBIERTA" && (
                          <button
                            onClick={() => reenviarA(inv.medicoId)}
                            style={{ ...ghostBtn, borderColor: "rgba(21,101,192,0.35)", color: "rgb(21,101,192)", padding: "5px 11px", fontSize: 12 }}
                            title="Re-activa la invitación y abre WhatsApp con recordatorio"
                          >↩ Reenviar</button>
                        )}
                        {tel && (
                          <a href={waLink(tel, waMsg)} target="_blank" rel="noreferrer"
                            style={{ ...ghostBtn, textDecoration: "none", padding: "5px 11px", fontSize: 12, display: "inline-flex", alignItems: "center" }}
                          >WhatsApp</a>
                        )}
                      </div>
                    </div>
                    <p style={subStyle}>
                      Enviado: {fmt(inv.sentAt)}
                      {inv.seenAt ? ` · Visto: ${fmt(inv.seenAt)}` : ""}
                      {inv.respondedAt ? ` · Respondió: ${fmt(inv.respondedAt)}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Style constants ───────────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)",
};
const h3Style: React.CSSProperties = { margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--text)" };
const subStyle: React.CSSProperties = { margin: "6px 0 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 };
const ghostBtn: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const primaryBtn: React.CSSProperties = {
  padding: "9px 20px", borderRadius: 10, border: "none",
  background: "linear-gradient(180deg,#1976D2,#1565C0)", color: "#fff",
  fontWeight: 700, fontSize: 13.5, cursor: "pointer",
  boxShadow: "0 2px 8px rgba(21,101,192,0.30)", fontFamily: "inherit",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9, boxSizing: "border-box",
  border: "1.5px solid var(--border)", background: "var(--surface-2)",
  fontSize: 13, color: "var(--text)", fontFamily: "inherit",
};
const lblStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted)",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em",
};
const kpiChip: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
  padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2,
  boxShadow: "var(--shadow-sm)",
};
const kpiLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em",
};
const kpiVal: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "var(--text)" };
