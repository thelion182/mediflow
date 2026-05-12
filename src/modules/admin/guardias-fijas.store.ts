import { storage } from "../../core/storage";

const KEY = "mediflow.guardias-fijas.v1";

export type GuardiaFija = {
  id: string;
  medicoId: string;
  diaSemana: number;   // 0=domingo, 1=lunes, …, 6=sábado
  horaInicio: string;  // "HH:MM"
  horaFin: string;
  sector: string;
  sede?: string;
  activo: boolean;
  notas?: string;
};

const DEFAULT: GuardiaFija[] = [];

function uid() {
  return `gf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const guardiasFijasStore = {
  list(): GuardiaFija[] {
    return storage.get<GuardiaFija[]>(KEY, DEFAULT);
  },

  add(data: Omit<GuardiaFija, "id">): GuardiaFija {
    const all = this.list();
    const item: GuardiaFija = { ...data, id: uid() };
    storage.set(KEY, [...all, item]);
    return item;
  },

  update(id: string, data: Partial<Omit<GuardiaFija, "id">>) {
    const all = this.list().map(g => g.id === id ? { ...g, ...data } : g);
    storage.set(KEY, all);
  },

  remove(id: string) {
    storage.set(KEY, this.list().filter(g => g.id !== id));
  },

  // Devuelve guardias fijas activas que corresponden a una fecha/hora dada
  getForDateRange(desde: Date, hasta: Date): Array<GuardiaFija & { fecha: string; inicio: string; fin: string }> {
    const activas = this.list().filter(g => g.activo);
    const result: Array<GuardiaFija & { fecha: string; inicio: string; fin: string }> = [];

    const current = new Date(desde);
    current.setHours(0, 0, 0, 0);
    const end = new Date(hasta);
    end.setHours(23, 59, 59, 999);

    while (current <= end) {
      const wd = current.getDay();
      for (const g of activas) {
        if (g.diaSemana !== wd) continue;
        const [sh, sm] = g.horaInicio.split(":").map(Number);
        const [eh, em] = g.horaFin.split(":").map(Number);
        const fechaStr = current.toISOString().slice(0, 10);
        const inicioISO = new Date(current.getFullYear(), current.getMonth(), current.getDate(), sh, sm).toISOString();
        const finISO    = new Date(current.getFullYear(), current.getMonth(), current.getDate(), eh, em).toISOString();
        if (new Date(inicioISO) >= desde && new Date(finISO) <= hasta) {
          result.push({ ...g, fecha: fechaStr, inicio: inicioISO, fin: finISO });
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return result;
  },
};
