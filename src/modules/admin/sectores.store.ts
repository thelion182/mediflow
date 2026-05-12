import { storage } from "../../core/storage";
import type { Sector } from "./sectores.types";

const KEY = "mediflow.catalogo.sectores.v2";

function slugify(input: string) {
  return (input || "")
    .trim()
    .toUpperCase()
    .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U").replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const DEFAULT: Sector[] = [
  { id: "CAI",              nombre: "CAI",                        activo: true },
  { id: "GUARDIA_FILIAL",   nombre: "Guardia Filial",             activo: true },
  { id: "PISO",             nombre: "Piso",                       activo: true },
  { id: "POLICLINICA",      nombre: "Policlínica",                activo: true },
  { id: "PUERTA_EMERGENCIA",nombre: "Puerta de Emergencia",       activo: true },
  { id: "REP_MEDICAMENTOS", nombre: "Repetición de medicamentos", activo: true },
  { id: "RETEN",            nombre: "Retén",                      activo: true },
  { id: "URG_DOMICILIARIA", nombre: "Urgencia Domiciliaria",      activo: true },
];

export const sectoresStore = {
  list(): Sector[] {
    const all = storage.get<Sector[]>(KEY, []);
    const base = all.length ? all : DEFAULT;
    return base
      .map(s => ({ ...s, activo: s.activo ?? true }))
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  },

  saveAll(items: Sector[]) {
    storage.set(KEY, items.map(s => ({ ...s, activo: s.activo ?? true })));
  },

  upsert(s: Sector) {
    const all = storage.get<Sector[]>(KEY, []);
    const base = all.length ? all : DEFAULT;

    const id = (s.id || "").trim() || slugify(s.nombre);
    const item: Sector = { ...s, id, activo: s.activo ?? true };

    const idx = base.findIndex(x => x.id === item.id);
    if (idx >= 0) base[idx] = { ...base[idx], ...item };
    else base.unshift(item);

    storage.set(KEY, base);
  },

  remove(id: string) {
    const all = this.list().filter(s => s.id !== id);
    storage.set(KEY, all);
  }
};
