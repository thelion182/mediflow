import type { Medico } from "./medicos.types";
import type { Convocatoria } from "../convocatorias/convocatoria.types";

const W = {
  tecnico:          64,
  postgrado:        49,
  relacionamiento:  36,
  quejas:           25,
  coberturaNoche:   16,
  rechazos:         9,
  horasMensuales:   4,
  antiguedad:       1,
};

export type ScoreResult = {
  medico: Medico;
  total: number;
  descalificado: boolean;
  quedaUltimo: boolean;
  detalle: Record<string, number>;
};

export function computeNuevoScore(m: Medico, convs: Convocatoria[]): ScoreResult {
  const sm = m.scoreManual ?? {};
  let total = 0;
  let descalificado = false;
  let quedaUltimo = false;
  const detalle: Record<string, number> = {};

  // 1. Técnico (64)
  if (sm.tecnico === "EXCELENTE") { detalle.tecnico = 3 * W.tecnico; }
  else if (sm.tecnico === "BUENO") { detalle.tecnico = 2 * W.tecnico; }
  else if (sm.tecnico === "REGULAR") { detalle.tecnico = 0.8 * W.tecnico; quedaUltimo = true; }
  else if (sm.tecnico === "MALO") { descalificado = true; detalle.tecnico = 0; }
  else { detalle.tecnico = 0; }
  total += detalle.tecnico ?? 0;

  // 2. Postgrado/Residencia (49)
  if (sm.postgrado === "COMPLETO")     detalle.postgrado = 2 * W.postgrado;
  else if (sm.postgrado === "EN_CURSO") detalle.postgrado = 1 * W.postgrado;
  else detalle.postgrado = 0;
  total += detalle.postgrado;

  // 3. Relacionamiento (36)
  if (sm.relacionamiento === "BUENO")       detalle.relacionamiento = 2 * W.relacionamiento;
  else if (sm.relacionamiento === "REGULAR") { detalle.relacionamiento = 0.7 * W.relacionamiento; quedaUltimo = true; }
  else if (sm.relacionamiento === "MALO")    { detalle.relacionamiento = 0; quedaUltimo = true; }
  else detalle.relacionamiento = 0;
  total += detalle.relacionamiento;

  // 4. Quejas (25)
  if (sm.quejas === "NINGUNA")          detalle.quejas = 2 * W.quejas;
  else if (sm.quejas === "RECURRENTES") { detalle.quejas = 0.5 * W.quejas; quedaUltimo = true; }
  else if (sm.quejas === "FRECUENTES")  { detalle.quejas = 0; quedaUltimo = true; }
  else detalle.quejas = 0;
  total += detalle.quejas;

  // 5. Cobertura fines de semana y noches (16)
  const nocheFinde = convs.filter(c => {
    const h = new Date(c.inicio).getHours();
    const wd = new Date(c.inicio).getDay();
    return (h >= 20 || h < 7 || wd === 0 || wd === 6) &&
      c.invitaciones.some(i => i.medicoId === m.userId);
  });
  const nocheAcept = nocheFinde.filter(c =>
    c.invitaciones.some(i => i.medicoId === m.userId && i.estado === "ACEPTO")
  );
  const cobertPct = nocheFinde.length > 0 ? nocheAcept.length / nocheFinde.length : 0;
  if (cobertPct >= 0.2) detalle.coberturaNoche = 2 * W.coberturaNoche;
  else if (cobertPct > 0) detalle.coberturaNoche = 1 * W.coberturaNoche;
  else detalle.coberturaNoche = 0;
  total += detalle.coberturaNoche;

  // 6. Rechazos (9)
  const invs = convs.flatMap(c => c.invitaciones.filter(i => i.medicoId === m.userId));
  const responded = invs.filter(i => i.estado === "ACEPTO" || i.estado === "RECHAZO");
  const rechazos  = invs.filter(i => i.estado === "RECHAZO");
  const tasaRechazo = responded.length > 0 ? rechazos.length / responded.length : 0;
  if (responded.length === 0)    detalle.rechazos = 0;
  else if (tasaRechazo < 0.5)    detalle.rechazos = 2 * W.rechazos;
  else                           detalle.rechazos = 1 * W.rechazos;
  total += detalle.rechazos;

  // 7. Horas mensuales (4) — menos de 48h puntúa más (incentivo de distribución)
  const now = new Date();
  const mesStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const mesEnd   = Date.now();
  let horasMes = 0;
  for (const c of convs) {
    const t = new Date(c.inicio).getTime();
    if (t < mesStart || t > mesEnd) continue;
    for (const a of c.asignaciones) {
      if (a.medicoId !== m.userId) continue;
      if (a.estado !== "CONFIRMADA" && a.estado !== "CUMPLIDA") continue;
      const h = (new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 3_600_000;
      horasMes += h;
    }
  }
  detalle.horasMensuales = horasMes < 48 ? 1 * W.horasMensuales : 0;
  total += detalle.horasMensuales;

  // 8. Antigüedad (1)
  const años = m.antiguedadAnios ?? 0;
  if (años > 5)      detalle.antiguedad = 2 * W.antiguedad;
  else if (años >= 2) detalle.antiguedad = 1 * W.antiguedad;
  else               detalle.antiguedad = 0;
  total += detalle.antiguedad;

  // Penalización guardia fija
  const pen = m.penalizacionGuardiaFija ?? 0;
  total = Math.max(0, total - pen);

  return { medico: m, total: Math.round(total * 10) / 10, descalificado, quedaUltimo, detalle };
}
