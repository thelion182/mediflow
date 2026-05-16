import { supabase, hasBackend } from "./supabase";
import { onStorageWrite } from "../core/storage";

// ── localStorage key map ──────────────────────────────────────────────────
const K = {
  medicos:       "mediflow.catalogo.medicos.v4",
  convocatorias: "mediflow.convocatorias.v1",
  config:        "mediflow.config.v1",
  sedes:         "mediflow.catalogo.sedes.v1",
  sectores:      "mediflow.catalogo.sectores.v2",
  especialidades:"mediflow.especialidades.v2",
  guardiasFijas: "mediflow.guardias-fijas.v2",
  prioAudit:     "mediflow.prio.audit.v1",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────
function wrap<T extends { id?: string; userId?: string }>(
  pk: "id" | "userId",
  items: T[]
): { [key: string]: string; data: any }[] {
  return items.map(item => ({ [pk]: (item as any)[pk], data: item }));
}

async function upsert(table: string, rows: object[], conflict: string) {
  if (!supabase) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflict });
  if (error) console.warn(`[sync] ${table}:`, error.message);
}

// ── Register write → Supabase callbacks ──────────────────────────────────
// These fire automatically on every localStorage write via storage.set()
if (hasBackend) {
  onStorageWrite(K.medicos, async (data: any[]) => {
    await upsert("medicos", wrap("userId", data), "userId");
  });

  onStorageWrite(K.convocatorias, async (data: any[]) => {
    await upsert("convocatorias", wrap("id", data), "id");
  });

  onStorageWrite(K.sedes, async (data: any[]) => {
    await upsert("sedes", wrap("id", data), "id");
  });

  onStorageWrite(K.sectores, async (data: any[]) => {
    await upsert("sectores", wrap("id", data), "id");
  });

  onStorageWrite(K.guardiasFijas, async (data: any[]) => {
    await upsert("guardias_fijas", wrap("id", data), "id");
  });

  onStorageWrite(K.prioAudit, async (data: any[]) => {
    await upsert("prio_audit", wrap("id", data), "id");
  });

  onStorageWrite(K.especialidades, async (data: Record<string, string>) => {
    const rows = Object.entries(data).map(([nombre, icono]) => ({ nombre, icono }));
    await upsert("especialidades", rows, "nombre");
  });

  onStorageWrite(K.config, async (data: any) => {
    await upsert("system_config", [{ id: 1, data }], "id");
  });
}

// ── Initial hydration: Supabase → localStorage ────────────────────────────
// Called once on app startup. Overwrites localStorage only when Supabase
// has data, so fresh databases don't wipe the local demo seed.
export async function hydrateFromSupabase(): Promise<void> {
  if (!supabase) return;

  try {
    const [
      rMedicos,
      rConvocatorias,
      rSedes,
      rSectores,
      rGuardias,
      rPrioAudit,
      rEspecialidades,
      rConfig,
    ] = await Promise.allSettled([
      supabase.from("medicos").select("data"),
      supabase.from("convocatorias").select("data"),
      supabase.from("sedes").select("data"),
      supabase.from("sectores").select("data"),
      supabase.from("guardias_fijas").select("data"),
      supabase.from("prio_audit").select("data"),
      supabase.from("especialidades").select("nombre,icono"),
      supabase.from("system_config").select("data").eq("id", 1),
    ]);

    function hydrate(key: string, result: PromiseSettledResult<any>, transform?: (rows: any[]) => any) {
      if (result.status !== "fulfilled") return;
      const rows = result.value.data;
      if (!rows || rows.length === 0) return;
      const value = transform ? transform(rows) : rows.map((r: any) => r.data);
      localStorage.setItem(key, JSON.stringify(value));
    }

    hydrate(K.medicos,       rMedicos);
    hydrate(K.convocatorias, rConvocatorias);
    hydrate(K.sedes,         rSedes);
    hydrate(K.sectores,      rSectores);
    hydrate(K.guardiasFijas, rGuardias);
    hydrate(K.prioAudit,     rPrioAudit);
    hydrate(K.config,        rConfig, rows => rows[0].data);
    hydrate(K.especialidades, rEspecialidades, rows =>
      Object.fromEntries(rows.map((r: any) => [r.nombre, r.icono]))
    );

    console.info("[sync] Hidratación completa desde Supabase.");
  } catch (err) {
    console.warn("[sync] Error en hidratación:", err);
  }
}

export { hasBackend };
