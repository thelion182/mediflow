export function nowIso() {
  return new Date().toISOString();
}

export function toLocalDateTimeInputValue(d: Date) {
  // yyyy-MM-ddTHH:mm para input datetime-local
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function minutesFromNow(mins: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + mins);
  return d;
}
