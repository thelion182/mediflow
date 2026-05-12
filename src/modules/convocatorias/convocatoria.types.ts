export type ConvocatoriaEstado =
  | "BORRADOR"
  | "ENVIADA"
  | "PARCIAL"
  | "CUBIERTA"
  | "VENCIDA"
  | "CANCELADA";

export type InvitacionEstado =
  | "EN_ESPERA"      // todavía no le llegó (secuencial)
  | "ENVIADA"
  | "VISTA"
  | "ACEPTO"
  | "RECHAZO"
  | "SIN_RESPUESTA"
  | "VENCIDA"
  | "CUBIERTA_X_OTRO"; // convocatoria masiva cubierta por otro médico

export type AsignacionEstado =
  | "CONFIRMADA"
  | "DEVOLUCION_PENDIENTE"  // médico solicitó devolver la guardia, pendiente de aprobación
  | "CANCELADA_POR_MEDICO"
  | "REEMPLAZADA"
  | "CUMPLIDA"
  | "NO_CUMPLIDA";

export type Canal = "APP" | "WHATSAPP" | "SMS" | "EMAIL";

export type Invitacion = {
  medicoId: string;           // userId: "CI-xxxx" o "F-xxxx"
  estado: InvitacionEstado;
  canal: Canal;
  sentAt?: string;            // ISO (en secuencial: se setea cuando se activa)
  seenAt?: string;            // ISO
  respondedAt?: string;       // ISO
};

export type Asignacion = {
  id: string;
  medicoId: string;
  estado: AsignacionEstado;
  createdAt: string;

  closedAt?: string;
  horas?: number;
  cierreNota?: string;

  // Devolución de guardia
  devolucionSolicitadaEn?: string;   // ISO
  devolucionMotivo?: string;
  devolucionAprobadaEn?: string;     // ISO
  devolucionAprobadaPor?: string;    // userId del aprobador
};

export type Convocatoria = {
  id: string;
  sector: string;
  sede?: string;

  inicio: string;             // ISO
  fin: string;                // ISO

  cupos: number;              // total
  vencimiento: string;        // ISO

  prioridad: "NORMAL" | "ALTA";
  notas?: string;

  // ⭐ Recomendado: no opcionales (evita estados “a medias”)
  modoEnvio: "MASIVO" | "SECUENCIAL";
  canales: Canal[];                                        // canales usados en esta convocatoria
  timeouts: { sinVerMin: number; sinResponderMin: number };

  estado: ConvocatoriaEstado;

  invitaciones: Invitacion[];
  asignaciones: Asignacion[];

  cancelReason?: string;
  updatedAt?: string;

  createdAt: string;
  createdBy: string;

  // Auto-renovación al vencer sin cobertura
  autoRenew?: boolean;
  autoRenewMinutes?: number;
  autoRenewMaxCount?: number;
  autoRenewCount?: number;

  // Modo de priorización de destinatarios
  prioMode?: "SCORING" | "MANUAL";
};
