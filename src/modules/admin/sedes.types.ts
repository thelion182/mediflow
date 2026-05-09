export type SedeTipo = "SANATORIO" | "FILIAL";

export type Sede = {
  id: string;            // slug estable: SANATORIO_GALICIA, FILIAL_LAGOMAR, etc.
  nombre: string;        // texto visible
  tipo: SedeTipo;
  departamento?: string;
  direccion?: string;
  telefono?: string;
  activo?: boolean;
};
