import React, { useEffect, useMemo, useRef, useState } from "react";
import { authStore } from "../../auth/auth.store";
import { convocatoriaStore } from "../convocatorias/convocatoria.store";
import { medicosStore } from "../admin/medicos.store";
import { configStore } from "../config/config.store";
import { AppShell } from "../../ui/AppShell";
import { newId } from "../../core/id";

type InvEstado = "EN_ESPERA" | "ENVIADA" | "VISTA" | "ACEPTO" | "RECHAZO" | "VENCIDA" | "SIN_RESPUESTA" | "CUBIERTA_X_OTRO";

const SUPLENCIAS_WA = "+59899737934";

function waLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-UY", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" });
}

type BadgeKind = "OK" | "WARN" | "BAD" | "INFO" | "MUTED";
const KIND_RGB: Record<BadgeKind, string> = {
  OK:   "22,163,74",
  WARN: "217,119,6",
  BAD:  "220,38,38",
  INFO: "21,101,192",
  MUTED:"100,116,139",
};

function Badge({ label, kind }: { label: string; kind: BadgeKind }) {
  const rgb = KIND_RGB[kind];
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700,
      background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
      border: `1px solid rgba(${rgb},0.25)`, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function convBadge(convEstado: string, invEstado: InvEstado, isAssigned: boolean, asgEstado?: string): { label: string; kind: BadgeKind } {
  if (convEstado === "CANCELADA")           return { label: "Cancelada",      kind: "BAD"  };
  if (invEstado === "CUBIERTA_X_OTRO")      return { label: "Cubierta",        kind: "MUTED"};
  if (invEstado === "VENCIDA")              return { label: "Vencida",         kind: "WARN" };
  if (invEstado === "SIN_RESPUESTA")        return { label: "Sin cupo",        kind: "MUTED"};
  if (isAssigned) {
    if (asgEstado === "CUMPLIDA")           return { label: "Cumplida",        kind: "OK"   };
    if (asgEstado === "NO_CUMPLIDA")        return { label: "No cumplida",     kind: "BAD"  };
    if (asgEstado === "DEVOLUCION_PENDIENTE") return { label: "Dev. pendiente", kind: "WARN" };
    return                                        { label: "Confirmada",       kind: "OK"   };
  }
  if (invEstado === "RECHAZO")              return { label: "Rechazada",       kind: "BAD"  };
  if (invEstado === "ACEPTO")              return { label: "Aceptada",        kind: "OK"   };
  if (invEstado === "VISTA")               return { label: "Vista",           kind: "INFO" };
  return                                          { label: "Pendiente",       kind: "INFO" };
}

// ── ConvCard para médico ──────────────────────────────────────────────────
function MedicoCard({ item, showActions, canDevolver, onAceptar, onRechazar, onWA, onDevolver }: {
  item: { c: any; inv: any; myAsg?: any; isAssigned: boolean };
  showActions: boolean;
  canDevolver?: boolean;
  onAceptar: (id: string) => void;
  onRechazar: (id: string) => void;
  onWA: (id: string, accion: "ACEPTO" | "RECHAZO") => void;
  onDevolver?: (convId: string, asgId: string) => void;
}) {
  const c   = item.c;
  const inv = item.inv as { estado: InvEstado; respondedAt?: string };
  const { label, kind } = convBadge(c.estado, inv.estado, item.isAssigned, item.myAsg?.estado);
  const rgb = KIND_RGB[kind];

  const isPending = showActions && c.estado !== "CANCELADA";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid var(--border)`,
      borderLeft: `4px solid rgb(${rgb})`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: isPending ? `0 2px 12px rgba(${rgb},0.12)` : "var(--shadow-sm)",
      transition: "box-shadow 0.15s",
    }}>
      {/* Content */}
      <div style={{ padding: "14px 16px" }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", letterSpacing: "-0.01em" }}>
              {c.sector}
              {c.sede && <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)", marginLeft: 6 }}>· {c.sede}</span>}
            </div>
            {c.prioridad === "ALTA" && (
              <span style={{
                display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 800,
                color: "rgb(220,38,38)", background: "rgba(220,38,38,0.10)",
                padding: "1px 7px", borderRadius: 4, letterSpacing: "0.05em",
              }}>URGENTE</span>
            )}
          </div>
          <Badge label={label} kind={kind} />
        </div>

        {/* Date row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
          background: "var(--surface-2)", borderRadius: 8, marginBottom: 10,
        }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {fmtDate(c.inicio)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginLeft: "auto" }}>
            {fmtTime(c.inicio)} → {fmtTime(c.fin)}
          </span>
        </div>

        {/* Respondido */}
        {inv.respondedAt && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)" }}>
            Respondido: {fmtDt(inv.respondedAt)}
          </p>
        )}

        {/* Cancel reason */}
        {c.cancelReason && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--danger)" }}>
            {c.cancelReason}
          </p>
        )}

        {/* Cubierta x otro aviso */}
        {inv.estado === "CUBIERTA_X_OTRO" && (
          <div style={{
            padding: "7px 12px", borderRadius: 8, marginBottom: 10,
            background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.20)",
            fontSize: 12, color: "var(--muted)",
          }}>
            Esta guardia ya fue cubierta por otro médico. No se requiere tu respuesta.
          </div>
        )}

        {/* Devolución pendiente aviso */}
        {item.myAsg?.estado === "DEVOLUCION_PENDIENTE" && (
          <div style={{
            padding: "7px 12px", borderRadius: 8, marginBottom: 10,
            background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.25)",
            fontSize: 12, color: "rgb(150,80,0)",
          }}>
            Solicitaste devolver esta guardia. Pendiente de aprobación por coordinación.
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => onAceptar(c.id)}
              style={actionBtn("22,163,74")}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(22,163,74,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(22,163,74,0.10)")}
            >✓ Aceptar</button>
            <button
              onClick={() => onRechazar(c.id)}
              style={actionBtn("220,38,38")}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(220,38,38,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(220,38,38,0.10)")}
            >✕ Rechazar</button>
            <button
              onClick={() => onWA(c.id, "ACEPTO")}
              style={actionBtn("37,211,102")}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(37,211,102,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(37,211,102,0.10)")}
            >WhatsApp: Acepto</button>
          </div>
        )}

        {/* Devolver guardia */}
        {canDevolver && item.myAsg?.estado === "CONFIRMADA" && onDevolver && (
          <div style={{ marginTop: isPending ? 8 : 0 }}>
            <button
              onClick={() => onDevolver(c.id, item.myAsg.id)}
              style={actionBtn("217,119,6")}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(217,119,6,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(217,119,6,0.10)")}
            >↩ Devolver guardia</button>
          </div>
        )}
      </div>
    </div>
  );
}

function actionBtn(rgb: string): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: `1px solid rgba(${rgb},0.30)`, background: `rgba(${rgb},0.10)`,
    color: `rgb(${rgb})`, transition: "background 0.12s",
  };
}

// ── Sección con título y conteo ───────────────────────────────────────────
function Section({ title, count, rgb, children, empty }: {
  title: string; count: number; rgb: string;
  children: React.ReactNode; empty: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: `rgb(${rgb})` }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{title}</span>
        <span style={{
          padding: "1px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: `rgba(${rgb},0.10)`, color: `rgb(${rgb})`,
        }}>{count}</span>
      </div>
      {count === 0
        ? <p style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>{empty}</p>
        : <div style={{ display: "grid", gap: 10 }}>{children}</div>
      }
    </div>
  );
}

// ── MedicoHome ────────────────────────────────────────────────────────────
export function MedicoHome() {
  const session = authStore.getSession()!;
  const [tick, setTick] = useState(0);
  const cardRefs    = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const seenTimers  = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    convocatoriaStore.seedIfEmpty();
    setTick(t => t + 1);
    const onVis = () => setTick(t => t + 1);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      for (const t of seenTimers.current.values()) window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick(t => t + 1);
    }, 30_000);
    return () => window.clearInterval(iv);
  }, []);

  const all = useMemo(() => convocatoriaStore.list(), [tick]);

  const mine = useMemo(() => {
    const myKey  = String(session.userId || "").trim();
    const myNum  = myKey.replace(/\D/g, "");
    const myCi   = String((session as any).cedula     || "").replace(/\D/g, "");
    const myFunc = String((session as any).funcionario || "").replace(/\D/g, "");

    const matchesMe = (medicoId: string) => {
      const a = String(medicoId || "").trim();
      if (!a) return false;
      if (a === myKey) return true;
      const aNum = a.replace(/\D/g, "");
      return !!aNum && (aNum === myNum || (myCi && aNum === myCi) || (myFunc && aNum === myFunc));
    };

    return all.map(c => {
      const inv = (c.invitaciones || []).find((i: any) => matchesMe(i.medicoId));
      if (!inv) return null;
      const myAsg    = (c.asignaciones || []).find((a: any) => matchesMe(a.medicoId));
      return { c, inv, myAsg, isAssigned: !!myAsg };
    }).filter(Boolean) as Array<{ c: any; inv: any; myAsg?: any; isAssigned: boolean }>;
  }, [all, session.userId]);

  const plazoDev = configStore.get().convocatorias?.plazoDevolusionHoras ?? 24;

  const pendientes  = useMemo(() => mine.filter(x => (x.inv.estado === "ENVIADA" || x.inv.estado === "VISTA") && x.c.estado !== "CANCELADA"), [mine]);
  const confirmadas = useMemo(() => mine.filter(x => x.c.estado !== "CANCELADA" && x.isAssigned), [mine]);
  const rechazadas  = useMemo(() => mine.filter(x => x.c.estado !== "CANCELADA" && x.inv.estado === "RECHAZO"), [mine]);
  const cubiertasXOtro = useMemo(() => mine.filter(x => x.inv.estado === "CUBIERTA_X_OTRO"), [mine]);
  const noDisp      = useMemo(() => mine.filter(x => x.c.estado === "CANCELADA" || x.inv.estado === "VENCIDA" || x.inv.estado === "SIN_RESPUESTA"), [mine]);

  function canDevolver(item: { c: any; myAsg?: any }) {
    if (!item.myAsg || item.myAsg.estado !== "CONFIRMADA") return false;
    const horasHastaInicio = (new Date(item.c.inicio).getTime() - Date.now()) / 3_600_000;
    return horasHastaInicio > plazoDev;
  }

  // Auto-mark vista
  const pendientesKey = pendientes.map(x => `${x.c.id}:${x.inv.estado}`).join("|");
  useEffect(() => {
    for (const t of seenTimers.current.values()) window.clearTimeout(t);
    seenTimers.current.clear();
    if (!pendientes.length) return;
    const eligible = new Set(pendientes.filter(x => x.inv.estado === "ENVIADA").map(x => x.c.id));
    if (!eligible.size) return;
    const obs = new IntersectionObserver(entries => {
      for (const e of entries) {
        const convId = (e.target as HTMLElement).dataset.convid || "";
        if (!eligible.has(convId)) continue;
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          if (seenTimers.current.has(convId)) continue;
          const t = window.setTimeout(() => {
            if (document.visibilityState !== "visible") return;
            convocatoriaStore.markSeen(convId, session.userId);
            setTick(x => x + 1);
            seenTimers.current.delete(convId);
          }, 2000);
          seenTimers.current.set(convId, t);
        } else {
          const t = seenTimers.current.get(convId);
          if (t) { window.clearTimeout(t); seenTimers.current.delete(convId); }
        }
      }
    }, { threshold: [0.0, 0.6, 1.0] });
    for (const convId of eligible) {
      const node = cardRefs.current.get(convId);
      if (node) obs.observe(node);
    }
    return () => { obs.disconnect(); for (const t of seenTimers.current.values()) window.clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.userId, pendientesKey]);

  function aceptar(convId: string) {
    const result = convocatoriaStore.respond(convId, session.userId, "ACEPTO");
    if (result.conflict) {
      alert("No podés aceptar esta guardia: ya tenés un turno confirmado que se superpone en el mismo horario.");
    }
    setTick(t => t + 1);
  }
  function rechazar(convId: string) { convocatoriaStore.respond(convId, session.userId, "RECHAZO"); setTick(t => t + 1); }
  function onWA(convId: string, accion: "ACEPTO" | "RECHAZO") {
    const msg = `Hola Suplencias, soy ${session.displayName} (${session.userId}). Respecto a la convocatoria ${convId}: ${accion}. Lo registro también en Mediflow.`;
    window.open(waLink(SUPLENCIAS_WA, msg), "_blank");
  }
  function devolver(convId: string, asgId: string) {
    const motivo = window.prompt("Motivo de la devolución (obligatorio):");
    if (!motivo?.trim()) return;
    convocatoriaStore.solicitarDevolucion(convId, asgId, motivo.trim());
    setTick(t => t + 1);
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Mis Convocatorias</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Bienvenido/a, <b>{session.displayName}</b></p>
          </div>
          <button onClick={() => setTick(t => t + 1)} style={{
            padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--muted)", fontSize: 13, cursor: "pointer",
          }}>↺ Actualizar</button>
        </div>

        {/* KPI chips */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Pendientes",   count: pendientes.length,     rgb: "21,101,192"  },
            { label: "Confirmadas",  count: confirmadas.length,     rgb: "22,163,74"   },
            { label: "Rechazadas",   count: rechazadas.length,      rgb: "220,38,38"   },
            { label: "Sin cupo",     count: noDisp.length,          rgb: "100,116,139" },
          ].map(k => (
            <div key={k.label} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px", borderRadius: 10,
              background: "var(--surface)", border: `1px solid var(--border)`,
              boxShadow: "var(--shadow-sm)",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: `rgb(${k.rgb})` }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{k.count}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{k.label}</span>
            </div>
          ))}
        </div>

        {/* Secciones */}
        <div style={{ display: "grid", gap: 28 }}>

          <Section title="Pendientes de respuesta" count={pendientes.length} rgb="21,101,192"
            empty="No tenés convocatorias pendientes.">
            {pendientes.map(item => (
              <div key={item.c.id} data-convid={item.c.id} ref={el => cardRefs.current.set(item.c.id, el)}>
                <MedicoCard item={item} showActions onAceptar={aceptar} onRechazar={rechazar} onWA={onWA} />
              </div>
            ))}
          </Section>

          <Section title="Confirmadas" count={confirmadas.length} rgb="22,163,74"
            empty="No tenés guardias confirmadas.">
            {confirmadas.map(item => (
              <MedicoCard key={item.c.id} item={item} showActions={false}
                canDevolver={canDevolver(item)}
                onAceptar={aceptar} onRechazar={rechazar} onWA={onWA} onDevolver={devolver} />
            ))}
          </Section>

          {cubiertasXOtro.length > 0 && (
            <Section title="Cubiertas por otro médico" count={cubiertasXOtro.length} rgb="100,116,139"
              empty="">
              {cubiertasXOtro.map(item => (
                <MedicoCard key={item.c.id} item={item} showActions={false}
                  onAceptar={aceptar} onRechazar={rechazar} onWA={onWA} />
              ))}
            </Section>
          )}

          <Section title="Rechazadas" count={rechazadas.length} rgb="220,38,38"
            empty="No rechazaste convocatorias.">
            {rechazadas.map(item => (
              <MedicoCard key={item.c.id} item={item} showActions={false} onAceptar={aceptar} onRechazar={rechazar} onWA={onWA} />
            ))}
          </Section>

          <Section title="No disponibles" count={noDisp.length} rgb="100,116,139"
            empty="Sin convocatorias canceladas o vencidas.">
            {noDisp.map(item => (
              <MedicoCard key={item.c.id} item={item} showActions={false} onAceptar={aceptar} onRechazar={rechazar} onWA={onWA} />
            ))}
          </Section>

        </div>

        {/* Disponibilidad */}
        <BloqueosSelf userId={session.userId} tick={tick} onRefresh={() => setTick(t => t + 1)} />

        {/* Nota */}
        <div style={{
          marginTop: 28, padding: "12px 16px", borderRadius: 10,
          background: "var(--surface)", border: "1px solid var(--border-2)",
          fontSize: 12, color: "var(--muted)", lineHeight: 1.6,
        }}>
          WhatsApp es canal secundario. La respuesta oficial queda registrada en Mediflow.
          Una convocatoria se marca como "Vista" automáticamente si permanece visible 2 segundos.
        </div>
      </div>
    </AppShell>
  );
}

// ── BloqueosSelf: manage own availability blocks ──────────────────────────
function BloqueosSelf({ userId, tick, onRefresh }: { userId: string; tick: number; onRefresh: () => void }) {
  const medico = useMemo(() => medicosStore.list().find(m => m.userId === userId), [tick]);
  const bloqueos = medico?.bloqueos ?? [];

  const [inicio,  setInicio]  = useState("");
  const [fin,     setFin]     = useState("");
  const [motivo,  setMotivo]  = useState("");

  function addBloqueo() {
    if (!inicio || !fin) return alert("Ingresá fechas de inicio y fin.");
    if (fin < inicio) return alert("El fin debe ser igual o posterior al inicio.");
    if (!medico) return;
    const b = { id: newId("B"), inicio, fin, motivo: motivo.trim() || undefined };
    medicosStore.upsert({ ...medico, bloqueos: [...bloqueos, b] });
    setInicio(""); setFin(""); setMotivo("");
    onRefresh();
  }

  function removeBloqueo(id: string) {
    if (!medico) return;
    medicosStore.upsert({ ...medico, bloqueos: bloqueos.filter(b => b.id !== id) });
    onRefresh();
  }

  const today = new Date().toISOString().slice(0, 10);
  const vigentes = bloqueos.filter(b => b.fin >= today);
  const pasados  = bloqueos.filter(b => b.fin < today);

  return (
    <div style={{ marginTop: 28, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgb(220,38,38)" }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Mi disponibilidad</span>
        {vigentes.length > 0 && (
          <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "rgba(220,38,38,0.10)", color: "rgb(185,28,28)" }}>
            {vigentes.length} bloqueo{vigentes.length !== 1 ? "s" : ""} vigente{vigentes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {vigentes.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          {vigentes.map(b => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.20)" }}>
              <span style={{ fontSize: 13, flex: 1 }}>
                🚫 <b>{b.inicio}</b> → <b>{b.fin}</b>{b.motivo ? ` · ${b.motivo}` : ""}
              </span>
              <button onClick={() => removeBloqueo(b.id)} style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid rgba(220,38,38,0.30)", background: "none", cursor: "pointer", fontSize: 12, color: "rgb(185,28,28)" }}>Quitar</button>
            </div>
          ))}
        </div>
      )}
      {vigentes.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Sin bloqueos vigentes. Aparecerás disponible en todas las convocatorias.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Desde</label>
          <input type="date" value={inicio} min={today} onChange={e => setInicio(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, fontFamily: "inherit" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Hasta</label>
          <input type="date" value={fin} min={inicio || today} onChange={e => setFin(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, fontFamily: "inherit" }} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Motivo (opcional)</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Vacaciones, estudio, licencia…" style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, fontFamily: "inherit" }} />
        </div>
      </div>
      <button onClick={addBloqueo} disabled={!inicio || !fin} style={{
        marginTop: 10, padding: "9px 20px", borderRadius: 9, border: "none", cursor: !inicio || !fin ? "default" : "pointer",
        background: !inicio || !fin ? "var(--border)" : "rgba(220,38,38,0.85)", color: "#fff",
        fontWeight: 700, fontSize: 13, transition: "background 0.12s",
      }}>Agregar bloqueo</button>

      {pasados.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 12, color: "var(--subtle)", cursor: "pointer" }}>{pasados.length} bloqueo{pasados.length !== 1 ? "s" : ""} pasado{pasados.length !== 1 ? "s" : ""}</summary>
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {pasados.map(b => (
              <div key={b.id} style={{ fontSize: 12, color: "var(--subtle)", padding: "4px 8px", borderRadius: 6, background: "var(--surface-2)" }}>
                {b.inicio} → {b.fin}{b.motivo ? ` · ${b.motivo}` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
