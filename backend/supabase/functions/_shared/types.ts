// Tipos compartidos entre Edge Functions (espejo de convocatoria.types.ts del frontend)

export type Canal = "APP" | "WHATSAPP" | "SMS" | "EMAIL";
export type ModoEnvio = "MASIVO" | "SECUENCIAL";
export type Prioridad = "NORMAL" | "ALTA";

export type ConvEstado   = "BORRADOR" | "ENVIADA" | "PARCIAL" | "CUBIERTA" | "VENCIDA" | "CANCELADA";
export type InvEstado    = "EN_ESPERA" | "ENVIADA" | "VISTA" | "ACEPTO" | "RECHAZO" | "SIN_RESPUESTA" | "VENCIDA";
export type AsigEstado   = "CONFIRMADA" | "CANCELADA_POR_MEDICO" | "REEMPLAZADA" | "CUMPLIDA" | "NO_CUMPLIDA";

export interface CreateConvocatoriaInput {
  sector:        string;
  sede?:         string;
  inicio:        string;   // ISO
  fin:           string;
  cupos:         number;
  vencimiento:   string;
  prioridad:     Prioridad;
  notas?:        string;
  modoEnvio:     ModoEnvio;
  canales:       Canal[];
  destinatarios: string[]; // medico user_ids en orden
  timeouts?:     { sinVerMin: number; sinResponderMin: number };
}

export interface ResponderInvitacionInput {
  invitacionId: string;
  respuesta: "ACEPTO" | "RECHAZO";
}

export interface CancelarAsignacionInput {
  convocatoriaId: string;
  asignacionId:   string;
  nota?:          string;
}

export interface AsignarManualInput {
  convocatoriaId: string;
  medicoId:       string;
  nota?:          string;
}

// Scoring rule (espejo de scoring_reglas)
export interface ScoringRegla {
  id?:                string;
  nombre:             string;
  descripcion?:       string;
  tipo:               string;
  condicion:          Record<string, unknown>;
  modificador_tipo:   "MULTIPLICADOR" | "PUNTOS";
  modificador_valor:  number;
  activa:             boolean;
  orden:              number;
}
