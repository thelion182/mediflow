import { storage } from "../../core/storage";
import type { Medico, MedicoTipo } from "./medicos.types";

const KEY = "mediflow.catalogo.medicos.v1";

const DEFAULT: Medico[] = [
  {
    userId: "CI-48206484",
    displayName: "Médico (Demo)",
    cedula: "48206484",
    especialidad: "Medicina General",
    tipo: "SUPLENTE",
    prioridad: 1,
    activo: true
  },
  {
    userId: "CI-19904039",
    displayName: "Dr. Pablo Cardoso (Demo)",
    cedula: "19904039",
    especialidad: "Medicina General",
    tipo: "SUPLENTE",
    prioridad: 2,
    activo: true
  },
  {
    userId: "F-93598",
    displayName: "Dra. Redondo (Demo)",
    funcionario: "93598",
    especialidad: "Cardiología",
    tipo: "TITULAR",
    prioridad: 3,
    activo: true
  }
];

// Para ordenar sin “ensuciar” el dato real
function prioEffective(n?: number) {
  return typeof n === "number" && isFinite(n) ? n : 9999;
}

function normalizeTipo(t?: MedicoTipo): MedicoTipo {
  return t ?? "SUPLENTE";
}

function normalizePrioridad(n?: number): number | undefined {
  if (typeof n !== "number" || !isFinite(n)) return undefined;
  const v = Math.floor(n);
  if (v < 1) return 1;
  return v;
}

function normalizeMedico(m: Medico): Medico {
  return {
    ...m,
    displayName: (m.displayName || "").trim(),
    cedula: (m.cedula || "").trim() || undefined,
    funcionario: (m.funcionario || "").trim() || undefined,
    especialidad: (m.especialidad || "").trim() || undefined,
    telefono: (m.telefono || "").trim() || undefined,
    tipo: normalizeTipo(m.tipo),
    prioridad: normalizePrioridad(m.prioridad),
    activo: m.activo ?? true
  };
}

export const medicosStore = {
  list(): Medico[] {
    const raw = storage.get<Medico[]>(KEY, []);
    const base = raw.length === 0 ? DEFAULT : raw;

    return base
      .map(normalizeMedico)
      .sort((a, b) => {
        const pa = prioEffective(a.prioridad);
        const pb = prioEffective(b.prioridad);
        if (pa !== pb) return pa - pb;
        return (a.displayName || "").localeCompare(b.displayName || "");
      });
  },

  saveAll(items: Medico[]) {
    // Guardamos normalizado (evita basura)
    storage.set(KEY, items.map(normalizeMedico));
  },

  upsert(m: Medico) {
    const raw = storage.get<Medico[]>(KEY, []);
    const base = raw.length ? raw : DEFAULT.slice(); // copia para no mutar DEFAULT

    const item = normalizeMedico(m);

    const idx = base.findIndex(x => x.userId === item.userId);
    if (idx >= 0) base[idx] = normalizeMedico({ ...base[idx], ...item });
    else base.unshift(item);

    storage.set(KEY, base);
  },

  remove(userId: string) {
    const raw = storage.get<Medico[]>(KEY, []);
    const base = raw.length ? raw : DEFAULT;
    storage.set(KEY, base.filter(m => m.userId !== userId));
  },

  // (Opcional pero útil) búsqueda directa para otras pantallas/stores
  getById(userId: string): Medico | null {
    const all = this.list();
    return all.find(m => m.userId === userId) ?? null;
  }
};
