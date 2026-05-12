export type MedicoTipo = "TITULAR" | "SUPLENTE" | "INDEPENDIENTE";
export type MedicoGremio = "SAQ" | "SMU";

export type NivelTecnico        = "EXCELENTE" | "BUENO" | "REGULAR" | "MALO";
export type NivelPostgrado      = "COMPLETO"  | "EN_CURSO" | "NO_REALIZA";
export type NivelRelacionamiento= "BUENO"     | "REGULAR"  | "MALO";
export type NivelQuejas         = "NINGUNA"   | "RECURRENTES" | "FRECUENTES";

export type ScoreManual = {
  tecnico?:          NivelTecnico;
  postgrado?:        NivelPostgrado;
  relacionamiento?:  NivelRelacionamiento;
  quejas?:           NivelQuejas;
};

export type Medico = {
  userId: string;
  displayName: string;

  cedula?: string;
  funcionario?: string;
  especialidad?: string;
  telefono?: string;

  tipo?: MedicoTipo;
  gremio?: MedicoGremio;          // SAQ (quirúrgicos) | SMU (resto)

  prioridad?: number;             // 1 = primero (modo MANUAL)
  sectoresHabilitados?: string[]; // IDs de sectores en los que puede trabajar

  scoreManual?: ScoreManual;      // criterios manuales del nuevo scoring
  antiguedadAnios?: number;       // años en la institución (criterio automático de scoring)
  penalizacionGuardiaFija?: number; // pts que se restan del score si no confirma guardia fija

  activo?: boolean;
};
