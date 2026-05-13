import { storage } from "../../core/storage";

const KEY = "mediflow.especialidades.v1";

const DEFAULTS: Record<string, string> = {
  "Cardiología":          "❤️",
  "Pediatría":            "👶",
  "Medicina General":     "🩺",
  "Emergentología":       "🚑",
  "Ginecología":          "🌸",
  "Traumatología":        "🦴",
  "Neurología":           "🧠",
  "Gastroenterología":    "🔬",
  "Dermatología":         "🧴",
  "Psiquiatría":          "🧘",
  "Oncología":            "🎗️",
  "Endocrinología":       "⚗️",
  "Anestesiología":       "💉",
  "Oftalmología":         "👁️",
  "Otorrinolaringología": "👂",
  "Urología":             "💊",
  "Cirugía":              "🔪",
  "Medicina Interna":     "🏥",
  "Reumatología":         "🦿",
  "Nefrología":           "🫁",
};

export const especialidadesStore = {
  getAll(): Record<string, string> {
    return storage.get<Record<string, string>>(KEY, DEFAULTS);
  },
  setIcono(nombre: string, icono: string) {
    storage.set(KEY, { ...this.getAll(), [nombre]: icono.trim() });
  },
  getIcono(nombre: string): string {
    return this.getAll()[nombre] ?? "🏥";
  },
};
