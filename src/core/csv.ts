export type CsvParseResult = { headers: string[]; rows: Record<string, string>[] };

export function parseCsv(text: string): CsvParseResult {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(l => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]).map(c => c.replace(/^"|"$/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = cols[idx] ?? ""));
    rows.push(row);
  }

  return { headers, rows };
}
