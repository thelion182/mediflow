export type MedicoTipo = "TITULAR" | "SUPLENTE" | "INDEPENDIENTE";

export type Medico = {
  userId: string;          // CI-xxxx o F-xxxx (lo que decidan)
  displayName: string;

  cedula?: string;
  funcionario?: string;
  especialidad?: string;
  telefono?: string;       // E164 para WhatsApp luego (+598...)

  tipo?: MedicoTipo;       // TITULAR / SUPLENTE / INDEPENDIENTE

  // 1 = primero. undefined = “sin prioridad”
  prioridad?: number;

  activo?: boolean;
};
