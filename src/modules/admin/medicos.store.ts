import { storage } from "../../core/storage";
import type { Medico, MedicoTipo } from "./medicos.types";

const KEY = "mediflow.catalogo.medicos.v2";

const DEFAULT: Medico[] = [
  // ── TITULARES ─────────────────────────────────────────────────────────────
  { userId: "F-93598",    displayName: "Dra. Laura Redondo",         funcionario: "93598",  cedula: "42187634", especialidad: "Cardiología",        tipo: "TITULAR",       prioridad: 1,  telefono: "+59892100001", activo: true },
  { userId: "F-10021",    displayName: "Dr. Martín Sosa",            funcionario: "10021",  cedula: "31450022", especialidad: "Medicina General",   tipo: "TITULAR",       prioridad: 2,  telefono: "+59892100002", activo: true },
  { userId: "F-10045",    displayName: "Dra. Gabriela Ferreira",     funcionario: "10045",  cedula: "29876543", especialidad: "Pediatría",          tipo: "TITULAR",       prioridad: 3,  telefono: "+59892100003", activo: true },
  { userId: "F-10078",    displayName: "Dr. Rodrigo Bentancur",      funcionario: "10078",  cedula: "38901234", especialidad: "Emergentología",     tipo: "TITULAR",       prioridad: 4,  telefono: "+59892100004", activo: true },
  { userId: "F-10102",    displayName: "Dra. Sofía Álvarez",         funcionario: "10102",  cedula: "45678901", especialidad: "Ginecología",        tipo: "TITULAR",       prioridad: 5,  telefono: "+59892100005", activo: true },
  { userId: "F-10130",    displayName: "Dr. Federico Núñez",         funcionario: "10130",  cedula: "27654321", especialidad: "Traumatología",      tipo: "TITULAR",       prioridad: 6,  telefono: "+59892100006", activo: true },
  { userId: "F-10155",    displayName: "Dra. Patricia Montero",      funcionario: "10155",  cedula: "33412089", especialidad: "Neurología",         tipo: "TITULAR",       prioridad: 7,  telefono: "+59892100007", activo: true },

  // ── SUPLENTES ─────────────────────────────────────────────────────────────
  { userId: "CI-48206484", displayName: "Dr. Diego Suárez",          cedula: "48206484",                        especialidad: "Medicina General",   tipo: "SUPLENTE",      prioridad: 10, telefono: "+59892100010", activo: true },
  { userId: "CI-19904039", displayName: "Dr. Pablo Cardoso",         cedula: "19904039",                        especialidad: "Medicina General",   tipo: "SUPLENTE",      prioridad: 11, telefono: "+59892100011", activo: true },
  { userId: "CI-52301876", displayName: "Dra. Valentina Sánchez",    cedula: "52301876",                        especialidad: "Pediatría",          tipo: "SUPLENTE",      prioridad: 12, telefono: "+59892100012", activo: true },
  { userId: "CI-41098765", displayName: "Dr. Nicolás Herrera",       cedula: "41098765",                        especialidad: "Emergentología",     tipo: "SUPLENTE",      prioridad: 13, telefono: "+59892100013", activo: true },
  { userId: "CI-36754210", displayName: "Dra. Camila Vega",          cedula: "36754210",                        especialidad: "Ginecología",        tipo: "SUPLENTE",      prioridad: 14, telefono: "+59892100014", activo: true },
  { userId: "CI-44509321", displayName: "Dr. Andrés Morales",        cedula: "44509321",                        especialidad: "Gastroenterología",  tipo: "SUPLENTE",      prioridad: 15, telefono: "+59892100015", activo: true },
  { userId: "CI-29871034", displayName: "Dra. Luciana Pereira",      cedula: "29871034",                        especialidad: "Cardiología",        tipo: "SUPLENTE",      prioridad: 16, telefono: "+59892100016", activo: true },
  { userId: "CI-55234098", displayName: "Dr. Tomás Ríos",            cedula: "55234098",                        especialidad: "Traumatología",      tipo: "SUPLENTE",      prioridad: 17, telefono: "+59892100017", activo: true },
  { userId: "CI-38907612", displayName: "Dra. Florencia Castro",     cedula: "38907612",                        especialidad: "Dermatología",       tipo: "SUPLENTE",      prioridad: 18, telefono: "+59892100018", activo: true },
  { userId: "CI-47321056", displayName: "Dr. Ignacio Méndez",        cedula: "47321056",                        especialidad: "Psiquiatría",        tipo: "SUPLENTE",      prioridad: 19, telefono: "+59892100019", activo: true },

  // ── INDEPENDIENTES ────────────────────────────────────────────────────────
  { userId: "CI-31045678", displayName: "Dr. Alejandro Rojas",       cedula: "31045678",                        especialidad: "Oncología",          tipo: "INDEPENDIENTE", prioridad: 25, telefono: "+59892100025", activo: true },
  { userId: "CI-42765430", displayName: "Dra. Natalia Ibáñez",       cedula: "42765430",                        especialidad: "Endocrinología",     tipo: "INDEPENDIENTE", prioridad: 26, telefono: "+59892100026", activo: true },
  { userId: "CI-58123904", displayName: "Dr. Sebastián Lema",        cedula: "58123904",                        especialidad: "Medicina General",   tipo: "INDEPENDIENTE", prioridad: 27, telefono: "+59892100027", activo: true },
  { userId: "CI-24507891", displayName: "Dra. Mariana Otero",        cedula: "24507891",                        especialidad: "Neurología",         tipo: "INDEPENDIENTE", prioridad: 28, telefono: "+59892100028", activo: true },
  { userId: "CI-61023487", displayName: "Dr. Gustavo Acosta",        cedula: "61023487",                        especialidad: "Emergentología",     tipo: "INDEPENDIENTE", prioridad: 29, telefono: "+59892100029", activo: true },
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
