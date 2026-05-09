export function hoursBetween(inicioIso: string, finIso: string): number {
  const start = new Date(inicioIso).getTime();
  const end = new Date(finIso).getTime();
  const diffMs = Math.max(0, end - start);
  const hours = diffMs / (1000 * 60 * 60);
  // redondeo a 2 decimales para reportes
  return Math.round(hours * 100) / 100;
}
