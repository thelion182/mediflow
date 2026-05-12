import { storage } from "../../core/storage";
import { newId } from "../../core/id";
import { nowIso } from "../../core/date";
import { hoursBetween } from "../../core/hours";
import { medicosStore } from "../admin/medicos.store";
import type { Canal, Convocatoria, ConvocatoriaEstado, Invitacion, Asignacion } from "./convocatoria.types";

const KEY = "mediflow.convocatorias.v1";

// Defaults "genéricos" (fallback final)
const DEFAULT_SIN_VER_MIN = 60;
const DEFAULT_SIN_RESP_MIN = 60;

const MIN = 60 * 1000;

export type MedicoMini = { userId: string; nombre: string };

export function getMedicosCatalogo(): MedicoMini[] {
  return medicosStore.list().map(m => ({
    userId: m.userId,
    nombre: m.displayName
  }));
}

/**
 * Snapshot para no romper pantallas que importan DEMO_MEDICOS.
 * Si editás el catálogo y querés verlo reflejado, refrescá la página.
 */
export const DEMO_MEDICOS: MedicoMini[] = getMedicosCatalogo();

// Helper a nivel módulo (nombre distinto para no chocar con el método del store)
export function lookupMedicoPhone(userId: string): string | null {
  const m = medicosStore.list().find(x => x.userId === userId);
  const phone = (m?.telefono || "").trim();
  return phone ? phone : null;
}

function computeEstado(c: Convocatoria): ConvocatoriaEstado {
  if (c.estado === "CANCELADA") return "CANCELADA";

  const now = Date.now();
  const venc = new Date(c.vencimiento).getTime();

  const confirmadas = (c.asignaciones || []).filter(
    a => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA" || a.estado === "DEVOLUCION_PENDIENTE"
  ).length;

  if (confirmadas >= c.cupos) return "CUBIERTA";
  if (now > venc) return confirmadas > 0 ? "PARCIAL" : "VENCIDA";
  return confirmadas > 0 ? "PARCIAL" : "ENVIADA";
}

function isSequential(c: Convocatoria) {
  return (c.modoEnvio ?? "MASIVO") === "SECUENCIAL" && (Number(c.cupos) || 1) === 1;
}

function defaultTimeoutsByPrioridad(prio: "NORMAL" | "ALTA" | undefined) {
  // Regla operativa (tu "autopiloto")
  if (prio === "ALTA") return { sinVerMin: 15, sinResponderMin: 10 };
  if (prio === "NORMAL") return { sinVerMin: 30, sinResponderMin: 15 };
  return { sinVerMin: DEFAULT_SIN_VER_MIN, sinResponderMin: DEFAULT_SIN_RESP_MIN };
}

function timeoutsOf(c: Convocatoria) {
  // Si tiene timeouts guardados, usamos esos.
  // Si no, caemos a defaults por prioridad.
  const fromPrio = defaultTimeoutsByPrioridad(c.prioridad);
  const sinVerMin = c.timeouts?.sinVerMin ?? fromPrio.sinVerMin;
  const sinResponderMin = c.timeouts?.sinResponderMin ?? fromPrio.sinResponderMin;

  return { sinVerMin, sinResponderMin };
}

function findActiveInvIndex(c: Convocatoria) {
  return (c.invitaciones || []).findIndex(i => i.estado === "ENVIADA" || i.estado === "VISTA");
}

function findNextWaitingIndex(c: Convocatoria) {
  return (c.invitaciones || []).findIndex(i => i.estado === "EN_ESPERA");
}

function expireInv(inv: Invitacion) {
  inv.estado = "VENCIDA";
  inv.respondedAt = nowIso();
}

function activateInv(inv: Invitacion) {
  inv.estado = "ENVIADA";
  inv.sentAt = nowIso();
  // higiene: al activar, limpiamos marcas previas (si el objeto se reutiliza por alguna edición)
  delete (inv as any).seenAt;
  delete (inv as any).respondedAt;
}

function autoAdvanceConvocatoria(c: Convocatoria): { c: Convocatoria; changed: boolean } {
  if (!isSequential(c)) return { c, changed: false };
  if (c.estado === "CANCELADA") return { c, changed: false };

  const confirmadas = (c.asignaciones || []).filter(a => a.estado === "CONFIRMADA" || a.estado === "CUMPLIDA").length;
  if (confirmadas >= c.cupos) return { c, changed: false };

  const { sinVerMin, sinResponderMin } = timeoutsOf(c);
  const now = Date.now();

  let changed = false;

  // Si no hay nadie activo y hay en espera, activamos el primero
  let activeIdx = findActiveInvIndex(c);
  if (activeIdx < 0) {
    const nextIdx = findNextWaitingIndex(c);
    if (nextIdx >= 0) {
      activateInv(c.invitaciones[nextIdx]);
      changed = true;
      activeIdx = nextIdx;
    }
  }

  // Loop: si el activo expiró, lo vencemos y activamos al siguiente en espera
  while (activeIdx >= 0) {
    const inv = c.invitaciones[activeIdx];
    const sentAt = inv.sentAt ? new Date(inv.sentAt).getTime() : null;
    const seenAt = inv.seenAt ? new Date(inv.seenAt).getTime() : null;

    const expiredNoSee =
      inv.estado === "ENVIADA" &&
      sentAt !== null &&
      now - sentAt > sinVerMin * MIN;

    const expiredNoAnswer =
      inv.estado === "VISTA" &&
      seenAt !== null &&
      !inv.respondedAt &&
      now - seenAt > sinResponderMin * MIN;

    if (!expiredNoSee && !expiredNoAnswer) break;

    expireInv(inv);
    changed = true;

    const nextIdx = findNextWaitingIndex(c);
    if (nextIdx >= 0) {
      activateInv(c.invitaciones[nextIdx]);
      changed = true;
      activeIdx = nextIdx;
      continue;
    }

    // nadie más: se termina la secuencia
    break;
  }

  if (changed) {
    c.updatedAt = nowIso();
    c.estado = computeEstado(c);
  }

  return { c, changed };
}

function autoAdvanceAll(raw: Convocatoria[]) {
  let changedAny = false;
  const out = raw.map(item => {
    const res = autoAdvanceConvocatoria(item);
    if (res.changed) changedAny = true;
    return res.c;
  });

  if (changedAny) storage.set(KEY, out);
  return out;
}

function autoRenewIfNeeded(raw: Convocatoria[]): { list: Convocatoria[]; changed: boolean } {
  let changed = false;
  const now = Date.now();

  const out = raw.map(c => {
    if (!c.autoRenew) return c;
    if (c.estado === "CANCELADA") return c;

    const tentativo = computeEstado(c);
    if (tentativo !== "VENCIDA") return c;

    const count = c.autoRenewCount ?? 0;
    const maxCount = c.autoRenewMaxCount ?? 3;
    if (count >= maxCount) return c;

    const renewMins = c.autoRenewMinutes ?? 60;
    c = {
      ...c,
      vencimiento: new Date(now + renewMins * 60_000).toISOString(),
      autoRenewCount: count + 1,
      updatedAt: new Date(now).toISOString(),
    };

    // SECUENCIAL: si no quedan invitaciones activas o en espera, resetear y reenviar
    if (isSequential(c)) {
      const hasActive = c.invitaciones.some(
        i => i.estado === "ENVIADA" || i.estado === "VISTA" || i.estado === "EN_ESPERA"
      );
      if (!hasActive) {
        const invs: Invitacion[] = c.invitaciones.map(inv =>
          inv.estado === "ACEPTO"
            ? inv
            : { ...inv, estado: "EN_ESPERA" as const, sentAt: undefined, seenAt: undefined, respondedAt: undefined }
        );
        const firstWaiting = invs.findIndex(i => i.estado === "EN_ESPERA");
        if (firstWaiting >= 0) {
          invs[firstWaiting] = { ...invs[firstWaiting], estado: "ENVIADA", sentAt: new Date(now).toISOString() };
        }
        c = { ...c, invitaciones: invs };
      }
    }

    c = { ...c, estado: computeEstado(c) };
    changed = true;
    return c;
  });

  return { list: out, changed };
}

function hydrate(list: Convocatoria[]) {
  const advanced = autoAdvanceAll(list);
  const { list: renewed, changed: renewChanged } = autoRenewIfNeeded(advanced);
  if (renewChanged) storage.set(KEY, renewed);
  return renewed.map(c => ({ ...c, estado: computeEstado(c) }));
}

function sortDestinatariosByPrioridad(destinatarios: string[]) {
  const cat = medicosStore.list();
  const prioMap = new Map(
    cat.map(m => [
      m.userId,
      typeof (m as any).prioridad === "number" ? (m as any).prioridad : 9999
    ])
  );
  return [...destinatarios].sort((a, b) => (prioMap.get(a) ?? 9999) - (prioMap.get(b) ?? 9999));
}

export const convocatoriaStore = {
  getMedicoPhone(medicoId: string): string | null {
    return lookupMedicoPhone(medicoId);
  },

  list(): Convocatoria[] {
    const raw = storage.get<Convocatoria[]>(KEY, []);
    return hydrate(raw).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  get(id: string): Convocatoria | null {
    const all = this.list();
    return all.find(c => c.id === id) ?? null;
  },

  seedIfEmpty() {
    const all = storage.get<Convocatoria[]>(KEY, []);
    if (all.length > 0) return;

    const medicos = medicosStore.list().filter(m => (m.activo ?? true));
    const ordered = sortDestinatariosByPrioridad(medicos.map(m => m.userId));

    const prioridad: "NORMAL" | "ALTA" = "ALTA";
    const autoT = defaultTimeoutsByPrioridad(prioridad);

    const base: Convocatoria = {
      id: newId("C"),
      sector: "Emergencia",
      sede: "Sanatorio",
      inicio: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      fin: new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString(),
      cupos: 1,
      vencimiento: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      prioridad,
      notas: "Guardia demo. Presentarse 15 minutos antes.",
      estado: "ENVIADA",
      modoEnvio: "SECUENCIAL",
      timeouts: autoT,
      invitaciones: ordered.map((medicoId, idx): Invitacion => ({
        medicoId,
        estado: idx === 0 ? "ENVIADA" : "EN_ESPERA",
        canal: "APP",
        sentAt: idx === 0 ? nowIso() : undefined
      })),
      asignaciones: [],
      canales: ["APP"],
      createdAt: nowIso(),
      createdBy: "F-1001"
    };

    storage.set(KEY, [base]);
  },

  createAndSend(input: {
    sector: string;
    sede?: string;
    inicio: string;
    fin: string;
    cupos: number;
    vencimiento: string;
    prioridad: "NORMAL" | "ALTA";
    notas?: string;
    createdBy: string;
    destinatarios: string[];

    modoEnvio?: "MASIVO" | "SECUENCIAL";
    timeouts?: { sinVerMin: number; sinResponderMin: number };
    keepOrder?: boolean;
    canales?: Canal[];
    autoRenew?: boolean;
    autoRenewMinutes?: number;
    autoRenewMaxCount?: number;
    prioMode?: "SCORING" | "MANUAL";
  }): Convocatoria {
    const all = storage.get<Convocatoria[]>(KEY, []);

    const cupos = Number(input.cupos) || 1;
    const modo = input.modoEnvio ?? (cupos === 1 ? "SECUENCIAL" : "MASIVO");
    const canalPrimario: Canal = input.canales?.[0] ?? "APP";

    // ✅ CLAVE: el orden final lo decide la UI si keepOrder=true
    const ordered = input.keepOrder
      ? [...input.destinatarios]
      : sortDestinatariosByPrioridad(input.destinatarios);

    const invitaciones: Invitacion[] =
      modo === "SECUENCIAL" && cupos === 1
        ? ordered.map((medicoId, idx) => ({
            medicoId,
            estado: idx === 0 ? "ENVIADA" : "EN_ESPERA",
            canal: canalPrimario,
            sentAt: idx === 0 ? nowIso() : undefined
          }))
        : ordered.map((medicoId) => ({
            medicoId,
            estado: "ENVIADA",
            canal: canalPrimario,
            sentAt: nowIso()
          }));

    // ✅ Regla automática: si no viene timeouts, se calcula por prioridad
    const autoT = defaultTimeoutsByPrioridad(input.prioridad);
    const timeouts = input.timeouts ?? autoT;

    const c: Convocatoria = {
      id: newId("C"),
      sector: input.sector,
      sede: input.sede,
      inicio: input.inicio,
      fin: input.fin,
      cupos,
      vencimiento: input.vencimiento,
      prioridad: input.prioridad,
      notas: input.notas,
      estado: "ENVIADA",
      modoEnvio: modo,
      canales: input.canales ?? ["APP"],
      timeouts,
      invitaciones,
      asignaciones: [],
      createdAt: nowIso(),
      createdBy: input.createdBy,
      updatedAt: nowIso(),
      autoRenew: input.autoRenew || undefined,
      autoRenewMinutes: input.autoRenewMinutes,
      autoRenewMaxCount: input.autoRenewMaxCount,
      autoRenewCount: 0,
      prioMode: input.prioMode,
    };

    storage.set(KEY, [c, ...all]);
    return c;
  },

  markSeen(convId: string, medicoId: string) {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const idx = all.findIndex(c => c.id === convId);
    if (idx < 0) return;

    const c = all[idx];

    // Avanza antes (por si justo caducó el anterior y ahora soy activo)
    const adv = autoAdvanceConvocatoria(c);
    if (adv.changed) all[idx] = adv.c;

    const inv = (c.invitaciones || []).find(i => i.medicoId === medicoId);
    if (!inv) return;

    // En secuencial: sólo el activo puede marcar vista
    if (isSequential(c)) {
      const activeIdx = findActiveInvIndex(c);
      if (activeIdx < 0) return;
      if (c.invitaciones[activeIdx]?.medicoId !== medicoId) return;
    }

    if (inv.estado === "ENVIADA") {
      inv.estado = "VISTA";
      inv.seenAt = nowIso();
      c.updatedAt = nowIso();
      storage.set(KEY, all);
    }
  },

  respond(convId: string, medicoId: string, action: "ACEPTO" | "RECHAZO") {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const idx = all.findIndex(c => c.id === convId);
    if (idx < 0) return;

    const c = all[idx];
    if (c.estado === "CANCELADA") return;

    const adv = autoAdvanceConvocatoria(c);
    if (adv.changed) all[idx] = adv.c;

    const inv = (c.invitaciones || []).find(i => i.medicoId === medicoId);
    if (!inv) return;

    if (isSequential(c)) {
      const activeIdx = findActiveInvIndex(c);
      if (activeIdx < 0) return;
      if (c.invitaciones[activeIdx]?.medicoId !== medicoId) return;
    }

    if (inv.estado === "ACEPTO" || inv.estado === "RECHAZO") return;

    const venc = new Date(c.vencimiento).getTime();
    if (Date.now() > venc) {
      inv.estado = "VENCIDA";
      inv.respondedAt = nowIso();
      c.updatedAt = nowIso();
      storage.set(KEY, all);
      return;
    }

    if (action === "RECHAZO") {
      inv.estado = "RECHAZO";
      inv.respondedAt = nowIso();

      if (isSequential(c)) {
        const nextIdx = findNextWaitingIndex(c);
        if (nextIdx >= 0) activateInv(c.invitaciones[nextIdx]);
      }

      c.estado = computeEstado(c);
      c.updatedAt = nowIso();
      storage.set(KEY, all);
      return;
    }

    inv.estado = "ACEPTO";
    inv.respondedAt = nowIso();

    const asign: Asignacion = {
      id: newId("A"),
      medicoId,
      estado: "CONFIRMADA",
      createdAt: nowIso()
    };
    c.asignaciones.unshift(asign);

    if (isSequential(c)) {
      for (const other of c.invitaciones) {
        if (other.medicoId === medicoId) continue;
        if (other.estado === "EN_ESPERA" || other.estado === "ENVIADA" || other.estado === "VISTA") {
          other.estado = "SIN_RESPUESTA";
          other.respondedAt = nowIso();
        }
      }
    }

    c.estado = computeEstado(c);

    // Aviso masivo: si la convocatoria quedó cubierta en modo MASIVO, notificar al resto
    if (c.modoEnvio === "MASIVO" && c.estado === "CUBIERTA") {
      for (const other of c.invitaciones) {
        if (other.medicoId === medicoId) continue;
        if (other.estado === "EN_ESPERA" || other.estado === "ENVIADA" || other.estado === "VISTA") {
          other.estado = "CUBIERTA_X_OTRO";
          other.respondedAt = nowIso();
        }
      }
    }

    c.updatedAt = nowIso();
    storage.set(KEY, all);
  },

  closeAsignacion(convId: string, asignacionId: string, result: "CUMPLIDA" | "NO_CUMPLIDA", nota?: string) {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const idx = all.findIndex(c => c.id === convId);
    if (idx < 0) return;

    const c = all[idx];
    const a = (c.asignaciones || []).find(x => x.id === asignacionId);
    if (!a) return;
    if (a.estado !== "CONFIRMADA") return;

    a.estado = result;
    a.closedAt = nowIso();
    a.horas = hoursBetween(c.inicio, c.fin);
    a.cierreNota = nota?.trim() || undefined;

    c.estado = computeEstado(c);
    c.updatedAt = nowIso();
    storage.set(KEY, all);
  },

  buildHorasReport(params: { fromIso: string; toIso: string }) {
    const all = this.list();
    const from = new Date(params.fromIso).getTime();
    const to = new Date(params.toIso).getTime();

    const rows: Array<{
      convocatoriaId: string;
      sector: string;
      sede?: string;
      inicio: string;
      fin: string;
      medicoId: string;
      estado: string;
      horas: number;
    }> = [];

    for (const c of all) {
      const start = new Date(c.inicio).getTime();
      if (start < from || start > to) continue;

      for (const a of c.asignaciones || []) {
        if (a.estado !== "CUMPLIDA" && a.estado !== "NO_CUMPLIDA") continue;

        rows.push({
          convocatoriaId: c.id,
          sector: c.sector,
          sede: c.sede,
          inicio: c.inicio,
          fin: c.fin,
          medicoId: a.medicoId,
          estado: a.estado,
          horas: typeof a.horas === "number" ? a.horas : hoursBetween(c.inicio, c.fin)
        });
      }
    }
    return rows;
  },

  update(convId: string, patch: Partial<Convocatoria>, actorId: string, traceNote?: string) {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const idx = all.findIndex(c => c.id === convId);
    if (idx < 0) return;

    const c = all[idx];
    Object.assign(c, patch);

    c.updatedAt = nowIso();
    c.estado = computeEstado(c);

    storage.set(KEY, all);
  },

  cancel(convId: string, reason: string, actorId: string) {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const idx = all.findIndex(c => c.id === convId);
    if (idx < 0) return;

    const c = all[idx];
    c.estado = "CANCELADA";
    c.cancelReason = reason?.trim() || "Cancelada";
    c.updatedAt = nowIso();

    storage.set(KEY, all);
  },

  hardDelete(convId: string) {
    const all = storage.get<Convocatoria[]>(KEY, []);
    storage.set(KEY, all.filter(c => c.id !== convId));
  },

  cancelarAsignacion(convId: string, asignacionId: string, nota?: string) {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const idx = all.findIndex(c => c.id === convId);
    if (idx < 0) return;

    const c = all[idx];
    const a = (c.asignaciones || []).find(x => x.id === asignacionId);
    if (!a || a.estado !== "CONFIRMADA") return;

    a.estado = "CANCELADA_POR_MEDICO";
    a.closedAt = nowIso();
    a.cierreNota = nota?.trim() || "Cancelación manual desde Parte Diario";

    c.estado = computeEstado(c);
    c.updatedAt = nowIso();
    storage.set(KEY, all);
  },

  // ── Devolución de guardia ─────────────────────────────────────────────

  solicitarDevolucion(convId: string, asigId: string, motivo: string): boolean {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const c = all.find(x => x.id === convId);
    if (!c) return false;
    const a = (c.asignaciones || []).find(x => x.id === asigId);
    if (!a || a.estado !== "CONFIRMADA") return false;
    a.estado = "DEVOLUCION_PENDIENTE";
    a.devolucionSolicitadaEn = nowIso();
    a.devolucionMotivo = motivo.trim() || "Sin motivo especificado";
    c.updatedAt = nowIso();
    storage.set(KEY, all);
    return true;
  },

  aprobarDevolucion(convId: string, asigId: string, aprobadorId: string): boolean {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const c = all.find(x => x.id === convId);
    if (!c) return false;
    const a = (c.asignaciones || []).find(x => x.id === asigId);
    if (!a || a.estado !== "DEVOLUCION_PENDIENTE") return false;
    a.estado = "CANCELADA_POR_MEDICO";
    a.devolucionAprobadaEn = nowIso();
    a.devolucionAprobadaPor = aprobadorId;
    a.closedAt = nowIso();
    c.estado = computeEstado(c);
    c.updatedAt = nowIso();
    storage.set(KEY, all);
    return true;
  },

  rechazarDevolucion(convId: string, asigId: string): boolean {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const c = all.find(x => x.id === convId);
    if (!c) return false;
    const a = (c.asignaciones || []).find(x => x.id === asigId);
    if (!a || a.estado !== "DEVOLUCION_PENDIENTE") return false;
    a.estado = "CONFIRMADA";
    delete (a as any).devolucionSolicitadaEn;
    delete (a as any).devolucionMotivo;
    c.updatedAt = nowIso();
    storage.set(KEY, all);
    return true;
  },

  asignarManual(convId: string, medicoId: string, nota?: string): boolean {
    const all = storage.get<Convocatoria[]>(KEY, []);
    const idx = all.findIndex(c => c.id === convId);
    if (idx < 0) return false;

    const c = all[idx];
    const existing = (c.asignaciones || []).find(
      a => a.medicoId === medicoId && a.estado === "CONFIRMADA"
    );
    if (existing) return false;

    const asign: Asignacion = {
      id: newId("A"),
      medicoId,
      estado: "CONFIRMADA",
      createdAt: nowIso(),
      cierreNota: nota?.trim() || undefined
    };
    c.asignaciones.unshift(asign);

    c.estado = computeEstado(c);
    c.updatedAt = nowIso();
    storage.set(KEY, all);
    return true;
  }
};
