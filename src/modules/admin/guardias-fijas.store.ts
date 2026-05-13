import { storage } from "../../core/storage";

const KEY = "mediflow.guardias-fijas.v2";

// Días de la semana: 0=domingo … 6=sábado
export type PatronDias =
  | { tipo: "DIAS_SEMANA"; dias: number[] }           // cualquier combinación de días
  | { tipo: "NTH_SEMANA";  diaSemana: number; nth: number }; // nth=1..4 | -1=último

export type Turno = { horaInicio: string; horaFin: string };  // "HH:MM"

export type GuardiaFija = {
  id: string;
  medicoId: string;
  patron: PatronDias;
  turnos: Turno[];          // uno o más bloques horarios
  sector: string;
  sede?: string;
  activo: boolean;
  notas?: string;
  vigenciaDesde?: string;   // YYYY-MM-DD, opcional
  vigenciaHasta?: string;   // YYYY-MM-DD, opcional
};

export type OcurrenciaFija = {
  guardiaFijaId: string;
  medicoId: string;
  sector: string;
  sede?: string;
  notas?: string;
  turno: Turno;
  fecha: string;    // YYYY-MM-DD
  inicio: string;   // ISO — puede ser el día siguiente si es nocturno
  fin: string;
};

const DEFAULT: GuardiaFija[] = [];

function uid() {
  return `gf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  if (nth > 0) {
    const firstWd = new Date(year, month, 1).getDay();
    const day = 1 + ((weekday - firstWd + 7) % 7) + (nth - 1) * 7;
    return new Date(year, month, day);
  } else {
    // -1 = último
    const lastDay = new Date(year, month + 1, 0);
    const lastWd  = lastDay.getDay();
    const day = lastDay.getDate() - ((lastWd - weekday + 7) % 7);
    return new Date(year, month, day);
  }
}

function matchesPatron(date: Date, patron: PatronDias): boolean {
  const wd = date.getDay();
  if (patron.tipo === "DIAS_SEMANA") return patron.dias.includes(wd);
  // NTH_SEMANA
  const target = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), patron.diaSemana, patron.nth);
  return target.getFullYear() === date.getFullYear()
    && target.getMonth()      === date.getMonth()
    && target.getDate()       === date.getDate();
}

export const guardiasFijasStore = {
  list(): GuardiaFija[] {
    return storage.get<GuardiaFija[]>(KEY, DEFAULT);
  },

  add(data: Omit<GuardiaFija, "id">): GuardiaFija {
    const all  = this.list();
    const item = { ...data, id: uid() } as GuardiaFija;
    storage.set(KEY, [...all, item]);
    return item;
  },

  update(id: string, data: Partial<Omit<GuardiaFija, "id">>) {
    storage.set(KEY, this.list().map(g => g.id === id ? { ...g, ...data } : g));
  },

  remove(id: string) {
    storage.set(KEY, this.list().filter(g => g.id !== id));
  },

  getForDateRange(desde: Date, hasta: Date): OcurrenciaFija[] {
    const activas = this.list().filter(g => g.activo);
    const result: OcurrenciaFija[] = [];

    const current = new Date(desde);
    current.setHours(0, 0, 0, 0);
    const end = new Date(hasta);
    end.setHours(23, 59, 59, 999);

    while (current <= end) {
      const fechaStr = current.toISOString().slice(0, 10);

      for (const g of activas) {
        // respetar vigencia
        if (g.vigenciaDesde && fechaStr < g.vigenciaDesde) continue;
        if (g.vigenciaHasta && fechaStr > g.vigenciaHasta) continue;
        if (!matchesPatron(current, g.patron)) continue;

        for (const t of g.turnos) {
          const [sh, sm] = t.horaInicio.split(":").map(Number);
          const [eh, em] = t.horaFin.split(":").map(Number);
          const inicioISO = new Date(current.getFullYear(), current.getMonth(), current.getDate(), sh, sm).toISOString();
          // turno nocturno: si fin < inicio → fin es al día siguiente
          const overnight = eh < sh || (eh === sh && em < sm);
          const finDate   = overnight
            ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, eh, em)
            : new Date(current.getFullYear(), current.getMonth(), current.getDate(), eh, em);
          result.push({
            guardiaFijaId: g.id,
            medicoId:      g.medicoId,
            sector:        g.sector,
            sede:          g.sede,
            notas:         g.notas,
            turno:         t,
            fecha:         fechaStr,
            inicio:        inicioISO,
            fin:           finDate.toISOString(),
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return result;
  },
};

// ── Helpers de descripción (usados en UI) ────────────────────────────────
const DIAS_ABREV = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const NTH_LABELS: Record<number, string> = { 1: "1°", 2: "2°", 3: "3°", 4: "4°", [-1]: "Último" };

export function describePlatron(patron: PatronDias): string {
  if (patron.tipo === "NTH_SEMANA") {
    return `${NTH_LABELS[patron.nth] ?? patron.nth}° ${DIAS_ABREV[patron.diaSemana]} del mes`;
  }
  const dias = [...patron.dias].sort();
  if (JSON.stringify(dias) === JSON.stringify([1, 2, 3, 4, 5])) return "Lunes a Viernes";
  if (JSON.stringify(dias) === JSON.stringify([0, 6]))           return "Fin de semana";
  if (dias.length === 7)                                          return "Todos los días";
  return dias.map(d => DIAS_ABREV[d]).join(", ");
}

export function describeTurnos(turnos: Turno[]): string {
  return turnos.map(t => {
    const overnight = t.horaFin < t.horaInicio;
    return `${t.horaInicio}–${t.horaFin}${overnight ? " (+1d)" : ""}`;
  }).join("  ·  ");
}
