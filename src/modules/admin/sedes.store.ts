import { storage } from "../../core/storage";
import type { Sede } from "./sedes.types";

const KEY = "mediflow.catalogo.sedes.v1";

function slugify(input: string) {
  return (input || "")
    .trim()
    .toUpperCase()
    .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U").replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const DEFAULT: Sede[] = [
  // Montevideo: SANATORIOS
  {
    id: "SANATORIO_CENTRAL",
    nombre: "Sanatorio Central Dr. Luis Pedro Lenguas",
    tipo: "SANATORIO",
    departamento: "Montevideo",
    direccion: "Minas 1250 esq. Soriano",
    telefono: "1870",
    activo: true
  },
  {
    id: "SANATORIO_JUAN_PABLO_II",
    nombre: "Sanatorio Juan Pablo II",
    tipo: "SANATORIO",
    departamento: "Montevideo",
    direccion: "Bulevar Artigas 2120",
    telefono: "1870",
    activo: true
  },
  {
    id: "SANATORIO_GALICIA",
    nombre: "Sanatorio Galicia",
    tipo: "SANATORIO",
    departamento: "Montevideo",
    direccion: "Av. Millán 4480",
    telefono: "1870",
    activo: true
  },

  // Interior: sanatorio
  {
    id: "FILIAL_JUAN_LACAZE",
    nombre: "Juan Lacaze (Sanatorio)",
    tipo: "SANATORIO",
    departamento: "Colonia",
    direccion: "José Salvo 212",
    telefono: "2487 95 56",
    activo: true
  },

  // Filiales (ejemplos fuertes; podés importar el resto por CSV)
  { id: "FILIAL_BELVEDERE", nombre: "Belvedere", tipo: "FILIAL", departamento: "Montevideo", direccion: "Av Carlos M Ramírez 120", activo: true },
  { id: "FILIAL_COLON", nombre: "Colón", tipo: "FILIAL", departamento: "Montevideo", direccion: "Av. Lezica 5704", activo: true },
  { id: "FILIAL_PASO_DE_LA_ARENA", nombre: "Paso de la Arena", tipo: "FILIAL", departamento: "Montevideo", direccion: "Luis Batlle Berres 6580", activo: true },
  { id: "FILIAL_POLICLINICO_360", nombre: "Policlínico 360", tipo: "FILIAL", departamento: "Montevideo", direccion: "Monte Caseros 2660", activo: true },

  { id: "FILIAL_ATLANTIDA", nombre: "Atlántida", tipo: "FILIAL", departamento: "Canelones", direccion: "Calle 4 esq Av Central", activo: true },
  { id: "FILIAL_BARROS_BLANCOS", nombre: "Barros Blancos", tipo: "FILIAL", departamento: "Canelones", direccion: "Ruta 8 / km 25.200", activo: true },
  { id: "FILIAL_CANELONES", nombre: "Canelones", tipo: "FILIAL", departamento: "Canelones", direccion: "José Batlle y Ordóñez 516", activo: true },
  { id: "FILIAL_EMP_NICOLICH", nombre: "Empalme Nicolich", tipo: "FILIAL", departamento: "Canelones", direccion: "Ruta 101 y 102", activo: true },
  { id: "FILIAL_LAGOMAR", nombre: "Lagomar", tipo: "FILIAL", departamento: "Canelones", direccion: "Av. Giannattasio / Km 22.200", activo: true },
  { id: "FILIAL_LAS_PIEDRAS", nombre: "Las Piedras", tipo: "FILIAL", departamento: "Canelones", direccion: "José Batlle y Ordóñez 583", activo: true },
  { id: "FILIAL_PANDO", nombre: "Pando", tipo: "FILIAL", departamento: "Canelones", direccion: "Calle 33 Nº 924", activo: true },
  { id: "FILIAL_PASO_CARRASCO", nombre: "Paso Carrasco", tipo: "FILIAL", departamento: "Canelones", direccion: "Cno Carrasco 398", activo: true },
  { id: "FILIAL_SALINAS", nombre: "Salinas", tipo: "FILIAL", departamento: "Canelones", direccion: "Ruta Interbalnearia / Km 38", activo: true }
];

export const sedesStore = {
  list(): Sede[] {
    const all = storage.get<Sede[]>(KEY, []);
    const base = all.length ? all : DEFAULT;
    return base
      .map(s => ({ ...s, activo: s.activo ?? true }))
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  },

  saveAll(items: Sede[]) {
    storage.set(KEY, items.map(s => ({ ...s, activo: s.activo ?? true })));
  },

  upsert(s: Sede) {
    const all = storage.get<Sede[]>(KEY, []);
    const base = all.length ? all : DEFAULT;

    const id = (s.id || "").trim() || slugify(s.nombre);
    const item: Sede = { ...s, id, activo: s.activo ?? true };

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
