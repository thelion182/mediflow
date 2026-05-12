export type Role = "SUPER_ADMIN" | "ADMIN" | "COORDINADOR" | "MEDICO" | "CONSULTA_PD";

export type User = {
  userId: string;
  displayName: string;
  role: Role;
  funcionario?: string;
  cedula?: string;
};

export function homeForRole(role: Role): string {
  if (role === "MEDICO")      return "/medico";
  if (role === "CONSULTA_PD") return "/parte-diario";
  return "/dashboard";
}
