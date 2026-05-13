import { storage } from "../../core/storage";

const KEY = "mediflow.especialidades.v2";

const DEFAULTS: Record<string, string> = {
  "Anestesiología":       "💉",
  "Cardiología":          "❤️",
  "Cirugía":              "🔪",
  "Dermatología":         "🧴",
  "Emergentología":       "🚑",
  "Endocrinología":       "⚗️",
  "Gastroenterología":    "🔬",
  "Ginecología":          "🌸",
  "Medicina General":     "🩺",
  "Medicina Interna":     "🏥",
  "Nefrología":           "🫘",
  "Neumología":           "🫁",
  "Neurología":           "🧠",
  "Oftalmología":         "👁️",
  "Oncología":            "🎗️",
  "Otorrinolaringología": "👂",
  "Pediatría":            "👶",
  "Psiquiatría":          "🧘",
  "Reumatología":         "🦿",
  "Traumatología":        "🦴",
  "Urología":             "💊",
};

export const especialidadesStore = {
  getAll(): Record<string, string> {
    return storage.get<Record<string, string>>(KEY, DEFAULTS);
  },
  listNames(): string[] {
    return Object.keys(this.getAll()).sort();
  },
  setIcono(nombre: string, icono: string) {
    storage.set(KEY, { ...this.getAll(), [nombre]: icono.trim() });
  },
  getIcono(nombre: string): string {
    return this.getAll()[nombre] ?? "🏥";
  },
  add(nombre: string) {
    const all = this.getAll();
    if (!all[nombre]) storage.set(KEY, { ...all, [nombre]: "🏥" });
  },
  remove(nombre: string) {
    const { [nombre]: _removed, ...rest } = this.getAll();
    storage.set(KEY, rest);
  },
  rename(oldNombre: string, newNombre: string) {
    if (oldNombre === newNombre) return;
    const all = this.getAll();
    const icono = all[oldNombre] ?? "🏥";
    const { [oldNombre]: _removed, ...rest } = all;
    storage.set(KEY, { ...rest, [newNombre]: icono });
  },
};
