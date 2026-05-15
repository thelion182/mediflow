import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authStore } from "../../auth/auth.store";
import { convocatoriaStore, getMedicosCatalogo } from "./convocatoria.store";
import { AppShell } from "../../ui/AppShell";
import type { Canal } from "./convocatoria.types";
import { CANAL_META } from "../config/config.types";

function CanalTag({ canal }: { canal: Canal }) {
  const meta = CANAL_META[canal] ?? { label: canal, rgb: "100,116,139" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: 5, fontSize: 11, fontWeight: 700,
      background: `rgba(${meta.rgb}, 0.12)`,
      color: `rgb(${meta.rgb})`,
      border: `1px solid rgba(${meta.rgb}, 0.25)`,
    }}>
      {meta.label}
    </span>
  );
}

const SUPLENCIAS_WHATSAPP = "+59899737934";

function waLink(phoneE164: string, text: string) {
  const t = encodeURIComponent(text);
  const digits = String(phoneE164 || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${t}`;
}

function fmt(dtIso?: string) {
  if (!dtIso) return "—";
  try {
    return new Date(dtIso).toLocaleString();
  } catch {
    return "—";
  }
}

function pillStyle(kind: "INFO" | "OK" | "WARN" | "BAD" | "MUTED") {
  switch (kind) {
    case "OK":
      return { background: "rgba(16,185,129,.10)", borderColor: "rgba(16,185,129,.25)" };
    case "WARN":
      return { background: "rgba(245,158,11,.10)", borderColor: "rgba(245,158,11,.25)" };
    case "BAD":
      return { background: "rgba(239,68,68,.10)", borderColor: "rgba(239,68,68,.25)" };
    case "INFO":
      return { background: "rgba(59,130,246,.10)", borderColor: "rgba(59,130,246,.25)" };
    default:
      return { background: "rgba(148,163,184,.10)", borderColor: "rgba(148,163,184,.25)" };
  }
}

function invBadge(estado: string) {
  switch (estado) {
    case "ENVIADA":
      return { label: "ENVIADA", kind: "INFO" as const };
    case "VISTA":
      return { label: "VISTA", kind: "INFO" as const };
    case "EN_ESPERA":
      return { label: "EN ESPERA", kind: "MUTED" as const };
    case "ACEPTO":
      return { label: "ACEPTÓ", kind: "OK" as const };
    case "RECHAZO":
      return { label: "RECHAZÓ", kind: "BAD" as const };
    case "VENCIDA":
      return { label: "VENCIDA", kind: "WARN" as const };
    case "SIN_RESPUESTA":
      return { label: "SIN CUPO", kind: "MUTED" as const };
    default:
      return { label: estado || "—", kind: "MUTED" as const };
  }
}

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function DetalleConvocatoria() {
  const { id } = useParams();
  const nav = useNavigate();
  const session = authStore.getSession()!;
  const [tick, setTick] = useState(0);

  // “reloj” UI para countdown (sin tocar store)
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    let interval: number | null = null;

    const start = () => {
      if (interval) return;
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") setNowTick(Date.now());
      }, 1000);
    };

    const stop = () => {
      if (!interval) return;
      window.clearInterval(interval);
      interval = null;
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        setNowTick(Date.now());
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
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
    notas: c?.notas || ""
  }));

  // si cambia convocatoria por refresh, sincronizamos form cuando NO está editando
  useEffect(() => {
    if (!c) return;
    if (editMode) return;
    setForm({
      sector: c.sector || "",
      sede: c.sede || "",
      inicio: c.inicio,
      fin: c.fin,
      cupos: c.cupos,
      vencimiento: c.vencimiento,
      prioridad: c.prioridad,
      notas: c.notas || ""
    });
  }, [c?.id, tick, editMode]);

  if (!c) {
    return (
      <div className="page">
        <div className="shell">
          <div className="panel">
            <b>No encontrada.</b>
            <div style={{ marginTop: 10 }}>
              <button className="btnGhost" onClick={() => nav("/dashboard")}>
                Volver
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const confirmadas = (c.asignaciones || []).filter(
    x => x.estado === "CONFIRMADA" || x.estado === "CUMPLIDA"
  ).length;

  const isSecuencial = (c.modoEnvio ?? "MASIVO") === "SECUENCIAL" && (Number(c.cupos) || 1) === 1;

  // Activo (en secuencial): primera invitación ENVIADA/VISTA
  const activeInvIdx = useMemo(() => {
    if (!isSecuencial) return -1;
    return (c.invitaciones || []).findIndex((i: any) => i.estado === "ENVIADA" || i.estado === "VISTA");
  }, [c.id, tick, isSecuencial]);

  const activeInv = isSecuencial && activeInvIdx >= 0 ? (c.invitaciones[activeInvIdx] as any) : null;

  // Timeouts del modelo (ya vienen guardados desde el store)
  const timeouts = (c as any).timeouts as { sinVerMin: number; sinResponderMin: number } | undefined;
  const sinVerMin = typeof timeouts?.sinVerMin === "number" ? timeouts!.sinVerMin : 60;
  const sinResponderMin = typeof timeouts?.sinResponderMin === "number" ? timeouts!.sinResponderMin : 60;

  // “Próximo vencimiento” del activo
  const proximoVenc = useMemo(() => {
    if (!isSecuencial) return null;
    if (!activeInv) return null;

    const st = String(activeInv.estado || "");
    const sentAt = activeInv.sentAt ? new Date(activeInv.sentAt).getTime() : null;
    const seenAt = activeInv.seenAt ? new Date(activeInv.seenAt).getTime() : null;

    if (st === "ENVIADA" && sentAt !== null) {
      const deadline = sentAt + sinVerMin * 60_000;
      return {
        motivo: `Si NO la ve en ${sinVerMin} min, pasa al siguiente.`,
        deadline
      };
    }

    if (st === "VISTA" && seenAt !== null && !activeInv.respondedAt) {
      const deadline = seenAt + sinResponderMin * 60_000;
      return {
        motivo: `Si NO responde en ${sinResponderMin} min luego de verla, pasa al siguiente.`,
        deadline
      };
    }

    return null;
  }, [
    isSecuencial,
    activeInv?.estado,
    activeInv?.sentAt,
    activeInv?.seenAt,
    activeInv?.respondedAt,
    sinVerMin,
    sinResponderMin
  ]);

  const msLeft = proximoVenc ? (proximoVenc.deadline - nowTick) : null;
  const isExpired = typeof msLeft === "number" ? msLeft <= 0 : false;

  // Invitaciones ordenadas por "orden" (ya viene por prioridad desde el store)
  const invitacionesOrdenadas = useMemo(() => {
    return [...(c.invitaciones || [])];
  }, [c.id, tick]);

  // Mensajes WhatsApp
  function msgUpdate() {
    return (
      `Mediflow · Círculo Católico\n` +
      `Convocatoria ${c.id} fue ACTUALIZADA.\n` +
      `Sector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\n` +
      `Turno: ${fmt(c.inicio)} → ${fmt(c.fin)}\n` +
      `Por favor revisar en la app.`
    );
  }

  function msgCancel() {
    return (
      `Mediflow · Círculo Católico\n` +
      `Convocatoria ${c.id} fue CANCELADA.\n` +
      `Sector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\n` +
      `Turno: ${fmt(c.inicio)} → ${fmt(c.fin)}\n` +
      `Motivo: ${c.cancelReason || "—"}\n` +
      `Gracias.`
    );
  }

  function msgTurnoActivo(nextOrd: number) {
    return (
      `Mediflow · Círculo Católico\n` +
      `Te toca tu turno (#${nextOrd}) en convocatoria ${c.id}.\n` +
      `Sector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\n` +
      `Turno: ${fmt(c.inicio)} → ${fmt(c.fin)}\n` +
      `Por favor ingresá a la app y aceptá o rechazá.\n` +
      `Gracias.`
    );
  }

  function msgRecordatorio(medicoId: string) {
    return (
      `Mediflow · Círculo Católico\n` +
      `Recordatorio: se re-envía convocatoria ${c.id}.\n` +
      `Sector: ${c.sector}${c.sede ? ` · ${c.sede}` : ""}\n` +
      `Turno: ${fmt(c.inicio)} → ${fmt(c.fin)}\n` +
      `Por favor ingresá a la app y respondé.\n` +
      `Gracias.`
    );
  }

  function reenviarA(medicoId: string) {
    const result = convocatoriaStore.reenviarInvitacion(c.id, medicoId);
    if (!result.ok) {
      alert("No se puede reenviar en el estado actual de esa invitación.");
      return;
    }
    setTick(t => t + 1);
    const tel = convocatoriaStore.getMedicoPhone(medicoId);
    if (tel) {
      window.open(waLink(tel, msgRecordatorio(medicoId)), "_blank");
    } else {
      alert("Invitación reenviada. El médico no tiene teléfono cargado.");
    }
  }

  function onSaveEdit() {
    const sector = form.sector.trim();
    if (!sector) return alert("Sector es obligatorio.");
    const inicio = new Date(form.inicio).toISOString();
    const fin = new Date(form.fin).toISOString();
    const venc = new Date(form.vencimiento).toISOString();
    const cupos = Number(form.cupos) || 1;

    convocatoriaStore.update(
      c.id,
      {
        sector,
        sede: form.sede.trim() || undefined,
        inicio,
        fin,
        cupos,
        vencimiento: venc,
        prioridad: form.prioridad,
        notas: form.notas.trim() || undefined
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
      "Forzar avance secuencial ahora:\n\n" +
        "- recalcula timeouts\n" +
        "- si el activo venció, lo marca VENCIDA y activa el siguiente\n\n" +
        "¿Continuar?"
    );
    if (!ok) return;

    // Dispara hydrate() => autoAdvanceAll() dentro del store al leer
    convocatoriaStore.list();
    setTick(t => t + 1);
  }

  // ✅ NUEVO: salta el activo aunque NO esté vencido (y abre WhatsApp al siguiente)
  function skipToNextNow() {
    if (!isSecuencial) return;
    if (c.estado === "CANCELADA") return;

    const ok = confirm(
      "Activar siguiente (saltando):\n\n" +
        "- marca al ACTIVO actual como VENCIDA\n" +
        "- activa el siguiente EN_ESPERA como ENVIADA\n" +
        "- abre WhatsApp al siguiente (si tiene teléfono)\n\n" +
        "Esto saltea al médico aunque aún esté en tiempo.\n" +
        "¿Continuar?"
    );
    if (!ok) return;

    const iso = new Date().toISOString();

    // copiamos para no mutar el objeto original
    const invs = [...(c.invitaciones || [])].map(i => ({ ...(i as any) })) as any[];

    const activeIdx = invs.findIndex(i => i.estado === "ENVIADA" || i.estado === "VISTA");
    if (activeIdx < 0) {
      alert("No hay invitación activa para saltar.");
      return;
    }

    const nextIdx = invs.findIndex(i => i.estado === "EN_ESPERA");
    if (nextIdx < 0) {
      // no hay siguiente, igual dejamos vencida la activa y listo
      invs[activeIdx].estado = "VENCIDA";
      invs[activeIdx].respondedAt = iso;

      convocatoriaStore.update(
        c.id,
        { invitaciones: invs as any },
        session.userId,
        `Salto manual: no había siguiente (by ${session.userId})`
      );

      setTick(t => t + 1);
      alert("Se venció el activo, pero no había siguiente EN_ESPERA.");
      return;
    }

    // vencer activo
    invs[activeIdx].estado = "VENCIDA";
    invs[activeIdx].respondedAt = iso;

    // activar siguiente
    invs[nextIdx].estado = "ENVIADA";
    invs[nextIdx].sentAt = iso;
    delete invs[nextIdx].seenAt;
    delete invs[nextIdx].respondedAt;

    const nextMedicoId = String(invs[nextIdx].medicoId || "");
    const nextOrd = nextIdx + 1;

    convocatoriaStore.update(
      c.id,
      { invitaciones: invs as any },
      session.userId,
      `Salto manual al siguiente (by ${session.userId})`
    );

    setTick(t => t + 1);

    // 🔥 WhatsApp automático al siguiente (si tiene tel)
    const tel = convocatoriaStore.getMedicoPhone(nextMedicoId);
    if (tel) {
      // mensaje específico de “te toca”
      const texto = msgTurnoActivo(nextOrd);
      window.open(waLink(tel, texto), "_blank");
    } else {
      alert(`Siguiente activado (ORD #${nextOrd}), pero no tiene teléfono cargado.`);
    }
  }

  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>
            {c.sector}{c.sede ? ` · ${c.sede}` : ""}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            {fmt(c.inicio)} → {fmt(c.fin)} · Modo: <b>{isSecuencial ? "SECUENCIAL" : "MASIVO"}</b>
          </p>
        </div>
        <div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>

            <span className="pill">{c.estado}</span>

            <button className="btnGhost" onClick={() => nav("/dashboard")}>
              Volver
            </button>

            <button className="btnGhost" onClick={() => setTick(t => t + 1)}>
              Refrescar
            </button>

            {isSecuencial && c.estado !== "CANCELADA" ? (
              <>
                <button
                  className="btnGhost"
                  onClick={forceAdvanceNow}
                  style={{ borderColor: "rgba(245,158,11,.35)" }}
                  title="Fuerza la evaluación de timeouts del secuencial ahora"
                >
                  Forzar avance secuencial
                </button>

                <button
                  className="btnGhost"
                  onClick={skipToNextNow}
                  style={{ borderColor: "rgba(239,68,68,.35)" }}
                  title="Salta al siguiente médico (marca vencida la invitación activa) + WhatsApp automático"
                >
                  Activar siguiente (saltando)
                </button>
              </>
            ) : null}

            {c.estado !== "CANCELADA" ? (
              <>
                <button className="btnGhost" onClick={() => setEditMode(v => !v)}>
                  {editMode ? "Cerrar edición" : "Editar"}
                </button>

                <button
                  className="btnGhost"
                  onClick={onCancelConv}
                  style={{ borderColor: "rgba(239,68,68,.25)" }}
                >
                  Cancelar
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid">
          {/* ✅ Proximo vencimiento (solo SECUENCIAL) */}
          {isSecuencial ? (
            <div className="panel" style={{ padding: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Secuencial · Próximo vencimiento</h3>

              {activeInv ? (
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="pill" style={pillStyle("OK")}>ACTIVO: {medicoName(activeInv.medicoId)}</span>
                    <span className="pill" style={pillStyle("MUTED")}>ORD #{activeInvIdx + 1}</span>
                    <span className="pill">{String(activeInv.estado || "—")}</span>
                    <span className="pill">sinVer: {sinVerMin}m</span>
                    <span className="pill">sinResp: {sinResponderMin}m</span>
                  </div>

                  {proximoVenc ? (
                    <div className="btnGhost" style={{ padding: 12, textAlign: "left" }}>
                      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <b>Cuenta regresiva</b>
                        <span
                          className="pill"
                          style={pillStyle(isExpired ? "BAD" : (msLeft! < 2 * 60_000 ? "WARN" : "INFO"))}
                        >
                          {isExpired ? "VENCIDO" : formatMs(msLeft!)}
                        </span>
                      </div>

                      <div className="sub" style={{ marginTop: 6 }}>
                        Vence a las: <b>{new Date(proximoVenc.deadline).toLocaleString()}</b>
                      </div>

                      <div className="sub" style={{ marginTop: 6 }}>
                        {proximoVenc.motivo}
                      </div>

                      {isExpired ? (
                        <div className="sub" style={{ marginTop: 6 }}>
                          Si querés que avance YA (sin esperar refresh del dashboard), tocá <b>Forzar avance secuencial</b>.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="sub">
                      No hay vencimiento calculable (por ejemplo: ya respondió / no hay timestamps).
                    </div>
                  )}
                </div>
              ) : (
                <p className="sub" style={{ marginTop: 10 }}>
                  No hay invitación activa ahora mismo (puede haber terminado la secuencia o estar cubierta).
                </p>
              )}
            </div>
          ) : null}

          {/* Resumen */}
          <div className="panel half">
            <h3 style={{ margin: 0, fontSize: 14 }}>Resumen</h3>
            <p className="sub" style={{ marginTop: 8 }}>
              Cupos: {confirmadas}/{c.cupos}
            </p>
            <p className="sub">Vence: {fmt(c.vencimiento)}</p>

            {c.estado === "CANCELADA" ? (
              <p className="sub" style={{ marginTop: 8 }}>
                <b>Cancelada:</b> {c.cancelReason || "—"}
              </p>
            ) : null}

            {c.notas ? (
              <p className="sub">
                <b>Notas:</b> {c.notas}
              </p>
            ) : (
              <p className="sub">Sin notas.</p>
            )}
          </div>

          {/* Invitaciones + WhatsApp */}
          <div className="panel">
            <h3 style={{ margin: 0, fontSize: 14 }}>Invitaciones</h3>

            <p className="sub" style={{ marginTop: 8 }}>
              {isSecuencial ? (
                <>
                  <b>SECUENCIAL:</b> sólo el <b>ORD #1</b> activo recibe/ve/responde. Si vence por tiempo, avanza al siguiente.
                </>
              ) : (
                <>
                  <b>MASIVO:</b> se envía a todos al mismo tiempo.
                </>
              )}{" "}
              WhatsApp se habilita solo si el médico tiene teléfono cargado.
            </p>

            <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
              <a
                className="btnGhost"
                href={waLink(SUPLENCIAS_WHATSAPP, c.estado === "CANCELADA" ? msgCancel() : msgUpdate())}
                target="_blank"
                rel="noreferrer"
                title="Mensaje para Suplencias (uso interno)"
              >
                WhatsApp Suplencias (mensaje)
              </a>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {invitacionesOrdenadas.map((inv: any, idx: number) => {
                const tel = convocatoriaStore.getMedicoPhone(inv.medicoId);
                const texto = c.estado === "CANCELADA" ? msgCancel() : msgUpdate();

                const badge = invBadge(inv.estado);
                const isActive =
                  isSecuencial &&
                  idx === activeInvIdx &&
                  (inv.estado === "ENVIADA" || inv.estado === "VISTA");

                return (
                  <div
                    key={inv.medicoId}
                    className="btnGhost"
                    style={{
                      padding: 12,
                      textAlign: "left",
                      borderColor: isActive ? "rgba(16,185,129,.35)" : undefined,
                      background: isActive ? "rgba(16,185,129,.06)" : undefined
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <b>{medicoName(inv.medicoId)}</b>
                        <span className="pill" style={pillStyle("MUTED")}>ORD #{idx + 1}</span>

                        <span className="pill" style={pillStyle(badge.kind)}>{badge.label}</span>

                        {isActive ? <span className="pill" style={pillStyle("OK")}>ACTIVO</span> : null}

                        {/* Canal de envío */}
                        {inv.canal && inv.estado !== "EN_ESPERA" && <CanalTag canal={inv.canal as Canal} />}

                        <span className="pill">{inv.medicoId}</span>
                        {tel ? <span className="pill">Tel: {tel}</span> : <span className="pill" style={pillStyle("BAD")}>Sin teléfono</span>}
                      </div>

                      <div className="row" style={{ gap: 6 }}>
                        {(inv.estado === "VENCIDA" || inv.estado === "SIN_RESPUESTA" || inv.estado === "CUBIERTA_X_OTRO") && c.estado !== "CANCELADA" && c.estado !== "CUBIERTA" && (
                          <button
                            className="btnGhost"
                            onClick={() => reenviarA(inv.medicoId)}
                            style={{ borderColor: "rgba(21,101,192,0.35)", color: "rgb(21,101,192)", fontSize: 12 }}
                            title="Re-activa la invitación y abre WhatsApp con recordatorio"
                          >
                            ↩ Reenviar
                          </button>
                        )}
                        {tel ? (
                          <a
                            className="btnGhost"
                            href={waLink(tel, texto)}
                            target="_blank"
                            rel="noreferrer"
                            title="Aviso por WhatsApp (canal secundario)"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="sub" style={{ marginTop: 6 }}>
                      Enviado: {fmt(inv.sentAt)}
                      {inv.seenAt ? ` · Visto: ${fmt(inv.seenAt)}` : ""}
                      {inv.respondedAt ? ` · Respondió: ${fmt(inv.respondedAt)}` : ""}
                    </div>
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
