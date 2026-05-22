import { storage } from "../../core/storage";
import { newId } from "../../core/id";

const KEY = "mediflow.audit.v1";
const MAX = 500;

export type AuditEvento =
  | "CONV_CREADA"
  | "CONV_CANCELADA"
  | "CONV_RESPONDIDA_ACEPTO"
  | "CONV_RESPONDIDA_RECHAZO"
  | "ASIG_CERRADA"
  | "ASIG_CANCELADA"
  | "DEVOLUCION_SOLICITADA"
  | "DEVOLUCION_APROBADA"
  | "DEVOLUCION_RECHAZADA"
  | "MEDICO_EDITADO"
  | "CONVOCATORIA_EDITADA";

export type AuditEntry = {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  evento: AuditEvento;
  entidadId: string;
  datos?: Record<string, unknown>;
};

export const auditStore = {
  list(): AuditEntry[] {
    return storage.get<AuditEntry[]>(KEY, []);
  },

  add(entry: Omit<AuditEntry, "id">): void {
    const all = storage.get<AuditEntry[]>(KEY, []);
    const next: AuditEntry = { id: newId("AU"), ...entry };
    storage.set(KEY, [next, ...all].slice(0, MAX));
  },

  clear(): void {
    storage.set(KEY, []);
  },
};
