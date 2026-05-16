import { storage } from "../../core/storage";
import type { SystemConfig } from "./config.types";

const KEY = "mediflow.config.v1";

export const DEFAULT_CONFIG: SystemConfig = {
  organizacion: {
    nombre: "Organización Médica",
    whatsappSuplencias: "+59899737934",
  },
  fotos: {
    baseUrl: "",
    campo: "funcionario",
    extension: "jpg",
  },
  canales: {
    app: { enabled: true },
    whatsapp: {
      enabled: true,
      provider: "ENLACE_MANUAL",
    },
    sms: {
      enabled: false,
      provider: "TWILIO",
    },
    email: {
      enabled: false,
      provider: "SENDGRID",
    },
  },
  defaultCanales: ["APP", "WHATSAPP"],
  convocatorias: {
    defaultModoEnvio: "SECUENCIAL",
    defaultCupos: 1,
    defaultSinVerMin: 30,
    defaultSinResponderMin: 15,
    defaultPrioridad: "NORMAL",
    plazoDevolusionHoras: 24,
  },
  scoring: {
    enabled: false,
    periodosDias: 90,
    pesoAceptacion: 40,
    pesoVelocidad: 25,
    pesoPuntualidad: 25,
    pesoDisponibilidad: 10,
  },
  mensajes: {
    invitacion:
      "Suplencias · Círculo Católico\nNecesitamos guardia para:\nSector: {{lugar}}\nFecha: {{fecha}}\nHorario: {{hora_inicio}} a {{hora_fin}}\nRespondé SI o NO a este mensaje.\nGracias.",
    cancelacion:
      "Suplencias · Círculo Católico\nSe canceló la guardia en:\nSector: {{lugar}}\nFecha: {{fecha}}\nHorario: {{hora_inicio}} a {{hora_fin}}\nMotivo: {{motivo}}\nGracias.",
    turnoActivo:
      "Suplencias · Círculo Católico\nHola, sos el siguiente en la lista.\nNecesitamos guardia para:\nSector: {{lugar}}\nFecha: {{fecha}}\nHorario: {{hora_inicio}} a {{hora_fin}}\nRespondé SI o NO a este mensaje a la brevedad.\nGracias.",
    recordatorio:
      "Suplencias · Círculo Católico\nRecordatorio: guardia disponible.\nSector: {{lugar}}\nFecha: {{fecha}}\nHorario: {{hora_inicio}} a {{hora_fin}}\nRespondé SI o NO a este mensaje.\nGracias.",
  },
};

export const configStore = {
  get(): SystemConfig {
    const saved = storage.get<Partial<SystemConfig>>(KEY, {});
    // Deep merge: saved values override defaults, but defaults fill missing keys
    return deepMerge(DEFAULT_CONFIG, saved ?? {}) as SystemConfig;
  },

  set(patch: Partial<SystemConfig>): void {
    const current = this.get();
    storage.set(KEY, deepMerge(current, patch));
  },

  reset(): void {
    storage.set(KEY, DEFAULT_CONFIG);
  },
};

// Simple deep merge (plain objects only, not arrays — arrays are replaced)
function deepMerge(base: any, override: any): any {
  if (override === null || override === undefined) return base;
  if (typeof base !== "object" || Array.isArray(base)) return override ?? base;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (typeof bv === "object" && !Array.isArray(bv) && typeof ov === "object" && !Array.isArray(ov)) {
      result[key] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      result[key] = ov;
    }
  }
  return result;
}
