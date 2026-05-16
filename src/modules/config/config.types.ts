export type Canal = "APP" | "WHATSAPP" | "SMS" | "EMAIL";

// ── Canal configs ─────────────────────────────────────────────────────────
export type AppCanalConfig = {
  enabled: boolean;
};

export type WhatsAppProvider = "ENLACE_MANUAL" | "WHATSAPP_BUSINESS_API" | "TWILIO";

export type WhatsAppConfig = {
  enabled: boolean;
  provider: WhatsAppProvider;
  // WhatsApp Business API
  phoneNumberId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  // Twilio WA
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  webhookSecret?: string;
};

export type SmsProvider = "TWILIO" | "SMSMASSIVOS_UY" | "AWS_SNS";

export type SmsConfig = {
  enabled: boolean;
  provider: SmsProvider;
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  webhookSecret?: string;
  // AWS SNS
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
};

export type EmailProvider = "SENDGRID" | "RESEND" | "SMTP" | "AWS_SES";

export type EmailConfig = {
  enabled: boolean;
  provider: EmailProvider;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  // SMTP
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  // AWS SES
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
};

// ── Fotos config ──────────────────────────────────────────────────────────
export type FotosConfig = {
  baseUrl: string;                                   // e.g. "/fotos" or "http://intranet/fotos"
  campo: "funcionario" | "userId" | "cedula";        // campo del Medico usado como nombre de archivo
  extension: "jpg" | "png" | "webp" | "jpeg";
};

// ── Message templates ─────────────────────────────────────────────────────
export type MessageTemplates = {
  invitacion:   string;
  cancelacion:  string;
  turnoActivo:  string;
  recordatorio: string;
};

// Variables disponibles en templates:
// {{lugar}}       — sector + sede (o solo sector si no hay sede)
// {{sector}}      — solo el sector
// {{sede}}        — solo la sede (vacío si no hay)
// {{fecha}}       — día formateado (ej: "viernes 16 de mayo de 2026")
// {{hora_inicio}} — hora de inicio (ej: "08:00")
// {{hora_fin}}    — hora de fin (ej: "20:00")
// {{motivo}}      — motivo de cancelación (solo en template cancelacion)

// ── System config ─────────────────────────────────────────────────────────
export type SystemConfig = {
  organizacion: {
    nombre: string;
    whatsappSuplencias: string;   // número de línea de coordinación (+598...)
  };
  fotos: FotosConfig;
  canales: {
    app: AppCanalConfig;
    whatsapp: WhatsAppConfig;
    sms: SmsConfig;
    email: EmailConfig;
  };
  defaultCanales: Canal[];        // preseleccionados al crear convocatoria
  convocatorias: {
    defaultModoEnvio: "MASIVO" | "SECUENCIAL";
    defaultCupos: number;
    defaultSinVerMin: number;
    defaultSinResponderMin: number;
    defaultPrioridad: "NORMAL" | "ALTA";
    plazoDevolusionHoras: number; // plazo para que el médico devuelva una guardia aceptada
  };
  scoring: {
    enabled: boolean;
    periodosDias: number;
    pesoAceptacion: number;       // suma de los 4 pesos = 100
    pesoVelocidad: number;
    pesoPuntualidad: number;
    pesoDisponibilidad: number;
  };
  mensajes: MessageTemplates;
};

// ── Helpers ───────────────────────────────────────────────────────────────
export const CANAL_META: Record<Canal, { label: string; rgb: string; icon: string }> = {
  APP:      { label: "App",       rgb: "21,101,192",  icon: "⬡" },
  WHATSAPP: { label: "WhatsApp",  rgb: "37,211,102",  icon: "✆" },
  SMS:      { label: "SMS",       rgb: "217,119,6",   icon: "✉" },
  EMAIL:    { label: "Email",     rgb: "38,166,154",  icon: "✉" },
};
