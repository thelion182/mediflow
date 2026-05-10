import { storage } from "../../core/storage";

export type PrioAuditEntry = {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  sector: string;
  sede?: string;
  overrides: Array<{
    medicoId: string;
    medicoName: string;
    catPrio?: number;
    overridePrio: number;
  }>;
};

const KEY = "mediflow.prio.audit.v1";

export const prioAuditStore = {
  list(): PrioAuditEntry[] {
    return storage.get<PrioAuditEntry[]>(KEY, [])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  add(entry: Omit<PrioAuditEntry, "id">) {
    const all = storage.get<PrioAuditEntry[]>(KEY, []);
    storage.set(KEY, [{ ...entry, id: `PA-${Date.now()}` }, ...all]);
  },

  clear() {
    storage.set(KEY, []);
  },
};
