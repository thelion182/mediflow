import React, { useEffect, useMemo, useRef, useState } from "react";
import { authStore } from "../../auth/auth.store";
import { convocatoriaStore } from "../convocatorias/convocatoria.store";
import { AppShell } from "../../ui/AppShell";

type InvitacionEstado =
  | "EN_ESPERA"
  | "ENVIADA"
  | "VISTA"
  | "ACEPTO"
  | "RECHAZO"
  | "VENCIDA"
  | "SIN_RESPUESTA";

const SUPLENCIAS_WHATSAPP = "+59899737934";

function waLink(phoneE164: string, text: string) {
  const p = String(phoneE164 || "").replace(/[^\d+]/g, "");
  const t = encodeURIComponent(text);
  const digits = p.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${t}`;
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

type Badge = { label: string; kind: "INFO" | "OK" | "WARN" | "BAD" | "MUTED" };

function badgePrincipal(params: {
  convEstado: string;
  invEstado: InvitacionEstado;
  isAssigned: boolean;
  myAsgEstado?: string;
}): Badge {
  const { convEstado, invEstado, isAssigned, myAsgEstado } = params;

  if (convEstado === "CANCELADA") return { label: "Cancelada", kind: "BAD" };
  if (invEstado === "VENCIDA") return { label: "Vencida", kind: "WARN" };
  if (invEstado === "SIN_RESPUESTA") return { label: "Sin cupo", kind: "MUTED" };

  if (isAssigned) {
    if (myAsgEstado === "CUMPLIDA") return { label: "Cumplida", kind: "OK" };
    if (myAsgEstado === "NO_CUMPLIDA") return { label: "No cumplida", kind: "BAD" };
    return { label: "Confirmada", kind: "OK" };
  }

  if (invEstado === "RECHAZO") return { label: "Rechazada", kind: "BAD" };
  if (invEstado === "ACEPTO") return { label: "Aceptada", kind: "OK" };

  if (invEstado === "VISTA") return { label: "Vista", kind: "INFO" };
  return { label: "Pendiente", kind: "INFO" };
}

export function MedicoHome() {
  const session = authStore.getSession()!;
  const [tick, setTick] = useState(0);

  // Refs para detectar visibilidad real de cada card pendiente
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const seenTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    convocatoriaStore.seedIfEmpty();
    setTick(t => t + 1);

    const onVis = () => setTick(t => t + 1);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      // limpiar timers
      for (const t of seenTimers.current.values()) window.clearTimeout(t);
      seenTimers.current.clear();
    };
  }, []);

  // ✅ Auto-refresh suave para que "avance" el secuencial aunque nadie toque nada.
  // Como tu store hace autoAdvance al hacer list(), con esto ya alcanza en MVP.
  useEffect(() => {
    const everyMs = 30_000; // 30s: suficiente para timeouts de 60 min sin cargar de más
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick(t => t + 1);
    }, everyMs);
    return () => window.clearInterval(iv);
  }, []);

  const all = useMemo(() => convocatoriaStore.list(), [tick]);

  // Match robusto por userId/cedula/funcionario
  const mine = useMemo(() => {
    const myKey = String(session.userId || "").trim();
    const myNum = myKey.replace(/\D/g, "");
    const myCi = String((session as any).cedula || "").replace(/\D/g, "");
    const myFunc = String((session as any).funcionario || "").replace(/\D/g, "");

    const matchesMe = (medicoId: string) => {
      const a = String(medicoId || "").trim();
      if (!a) return false;
      if (a === myKey) return true;
      const aNum = a.replace(/\D/g, "");
      return !!aNum && (aNum === myNum || (myCi && aNum === myCi) || (myFunc && aNum === myFunc));
    };

    return all
      .map(c => {
        const inv = (c.invitaciones || []).find((i: any) => matchesMe(i.medicoId));
        if (!inv) return null;

        const myAsg = (c.asignaciones || []).find((a: any) => matchesMe(a.medicoId));
        const isAssigned = !!myAsg;

        return { c, inv, myAsg, isAssigned };
      })
      .filter(Boolean) as Array<{ c: any; inv: any; myAsg?: any; isAssigned: boolean }>;
  }, [all, session.userId]);

  const pendientes = useMemo(() => {
    return mine.filter(
      x => (x.inv.estado === "ENVIADA" || x.inv.estado === "VISTA") && x.c.estado !== "CANCELADA"
    );
  }, [mine]);

  const confirmadas = useMemo(() => {
    return mine.filter(x => x.c.estado !== "CANCELADA" && x.isAssigned);
  }, [mine]);

  const rechazadas = useMemo(() => {
    return mine.filter(x => x.c.estado !== "CANCELADA" && x.inv.estado === "RECHAZO");
  }, [mine]);

  const noDisponibles = useMemo(() => {
    return mine.filter(
      x =>
        x.c.estado === "CANCELADA" ||
        x.inv.estado === "VENCIDA" ||
        x.inv.estado === "SIN_RESPUESTA"
    );
  }, [mine]);

  // ✅ AUTO “VISTA” SOLO SI ESTUVO VISIBLE 2s
  // - Si está ENVIADA y el card entra en viewport: arranca timer 2000ms.
  // - Si sale antes, se cancela.
  // - Si se marca vista, el store en secuencial ya valida que solo el “activo” pueda.
  const pendientesKey = useMemo(() => {
    // clave estable para rearmar observer si cambia la lista/estado
    return pendientes.map(x => `${x.c.id}:${x.inv.estado}`).join("|");
  }, [pendientes]);

  useEffect(() => {
    // limpiar timers previos
    for (const t of seenTimers.current.values()) window.clearTimeout(t);
    seenTimers.current.clear();

    if (!pendientes.length) return;

    const eligible = new Set(
      pendientes.filter(x => x.inv.estado === "ENVIADA").map(x => x.c.id)
    );
    if (!eligible.size) return;

    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          const el = e.target as HTMLDivElement;
          const convId = el.dataset.convid || "";
          if (!convId) continue;

          // Solo ENVIADA es candidata a auto-vista
          if (!eligible.has(convId)) continue;

          const existing = seenTimers.current.get(convId);
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            // si ya hay timer, no duplicar
            if (existing) continue;

            const t = window.setTimeout(() => {
              // condiciones de seguridad: tab visible
              if (document.visibilityState !== "visible") return;

              convocatoriaStore.markSeen(convId, session.userId);
              setTick(x => x + 1);

              // liberar timer
              seenTimers.current.delete(convId);
            }, 2000);

            seenTimers.current.set(convId, t);
          } else {
            // si salió de vista antes de 2s, cancelamos
            if (existing) {
              window.clearTimeout(existing);
              seenTimers.current.delete(convId);
            }
          }
        }
      },
      {
        threshold: [0.0, 0.6, 1.0],
        root: null
      }
    );

    // observar nodos actuales
    for (const convId of eligible) {
      const node = cardRefs.current.get(convId);
      if (node) obs.observe(node);
    }

    return () => {
      obs.disconnect();
      for (const t of seenTimers.current.values()) window.clearTimeout(t);
      seenTimers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.userId, pendientesKey]);

  function aceptar(convId: string) {
    convocatoriaStore.respond(convId, session.userId, "ACEPTO");
    setTick(t => t + 1);
  }

  function rechazar(convId: string) {
    convocatoriaStore.respond(convId, session.userId, "RECHAZO");
    setTick(t => t + 1);
  }

  function whatsappSuplencias(convId: string, accion: "ACEPTO" | "RECHAZO") {
    const msg =
      `Hola Suplencias, soy ${session.displayName} (${session.userId}). ` +
      `Respecto a la convocatoria ${convId}: ${accion === "ACEPTO" ? "ACEPTO" : "RECHAZO"}. ` +
      `Lo registro también en Mediflow.`;
    window.open(waLink(SUPLENCIAS_WHATSAPP, msg), "_blank");
  }

  function Card({ item, showActions }: { item: any; showActions: boolean }) {
    const c = item.c;
    const inv = item.inv as { estado: InvitacionEstado; respondedAt?: string };
    const myAsg = item.myAsg as any | undefined;

    const badge = badgePrincipal({
      convEstado: c.estado,
      invEstado: inv.estado,
      isAssigned: !!item.isAssigned,
      myAsgEstado: myAsg?.estado
    });

    const secondary =
      c.estado === "CANCELADA"
        ? c.cancelReason
          ? `Motivo: ${c.cancelReason}`
          : "Esta convocatoria fue cancelada."
        : c.estado === "CUBIERTA"
        ? "Cupos completos."
        : "";

    return (
      <div className="btnGhost" style={{ padding: 12, textAlign: "left" }}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <b>
              {c.sector}
              {c.sede ? ` · ${c.sede}` : ""}
            </b>
            <span className="pill" style={pillStyle(badge.kind)}>
              {badge.label}
            </span>
          </div>
        </div>

        <div className="sub" style={{ marginTop: 6 }}>
          Turno: {new Date(c.inicio).toLocaleString()} → {new Date(c.fin).toLocaleString()}
        </div>

        {inv.respondedAt ? (
          <div className="sub" style={{ marginTop: 4 }}>
            Respondido: {new Date(inv.respondedAt).toLocaleString()}
          </div>
        ) : null}

        {secondary ? (
          <div className="sub" style={{ marginTop: 6 }}>
            {secondary}
          </div>
        ) : null}

        {c.estado === "CANCELADA" ? null : showActions ? (
          <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
            <button
              className="btnGhost"
              onClick={() => rechazar(c.id)}
              style={{ borderColor: "rgba(239,68,68,.25)" }}
            >
              Rechazar
            </button>

            <button
              className="btnGhost"
              onClick={() => aceptar(c.id)}
              style={{ borderColor: "rgba(22,163,74,.25)" }}
            >
              Aceptar
            </button>

            <button className="btnGhost" onClick={() => whatsappSuplencias(c.id, "ACEPTO")}>
              WhatsApp: Acepto
            </button>

            <button
              className="btnGhost"
              onClick={() => whatsappSuplencias(c.id, "RECHAZO")}
              style={{ borderColor: "rgba(239,68,68,.25)" }}
            >
              WhatsApp: Rechazo
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Mis Convocatorias</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Hola, {session.displayName}</p>
          </div>
          <button className="btnGhost" onClick={() => setTick(t => t + 1)}>Refrescar</button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel">
            <h3 style={{ margin: 0, fontSize: 14 }}>Pendientes</h3>
            {pendientes.length === 0 ? (
              <p className="sub" style={{ marginTop: 10 }}>
                No tenés convocatorias pendientes.
              </p>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {pendientes.map(item => (
                  <div
                    key={item.c.id}
                    data-convid={item.c.id}
                    ref={(el) => cardRefs.current.set(item.c.id, el)}
                  >
                    <Card item={item} showActions />
                  </div>
                ))}
              </div>
            )}
            {pendientes.length ? (
              <div className="sub" style={{ marginTop: 10 }}>
                Nota: una convocatoria se marca como “Vista” automáticamente si permanece visible 2 segundos.
              </div>
            ) : null}
          </div>

          <div className="panel">
            <h3 style={{ margin: 0, fontSize: 14 }}>Confirmadas</h3>
            {confirmadas.length === 0 ? (
              <p className="sub" style={{ marginTop: 10 }}>
                No tenés guardias confirmadas.
              </p>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {confirmadas.map(item => (
                  <Card key={item.c.id} item={item} showActions={false} />
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h3 style={{ margin: 0, fontSize: 14 }}>Rechazadas</h3>
            {rechazadas.length === 0 ? (
              <p className="sub" style={{ marginTop: 10 }}>
                No rechazaste convocatorias.
              </p>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {rechazadas.map(item => (
                  <Card key={item.c.id} item={item} showActions={false} />
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h3 style={{ margin: 0, fontSize: 14 }}>No disponibles</h3>
            <p className="sub" style={{ marginTop: 6 }}>
              Canceladas, vencidas o sin cupo. No requieren acción.
            </p>

            {noDisponibles.length === 0 ? (
              <p className="sub" style={{ marginTop: 10 }}>
                No tenés convocatorias en esta categoría.
              </p>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {noDisponibles.map(item => (
                  <Card key={item.c.id} item={item} showActions={false} />
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <p className="sub" style={{ margin: 0 }}>
              WhatsApp es canal secundario para avisos rápidos. La respuesta oficial queda registrada en Mediflow.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
