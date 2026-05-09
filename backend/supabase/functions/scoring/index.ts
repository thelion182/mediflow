/**
 * Edge Function: /scoring
 *
 * GET  /scoring               → scores actuales del cache
 * POST /scoring/recalcular    → fuerza recalculo (admin+)
 * GET  /scoring/config        → lee configuracion de scoring
 * PUT  /scoring/config        → guarda configuracion (admin+)
 * GET  /scoring/reglas        → lista reglas adicionales
 * POST /scoring/reglas        → crea regla
 * PUT  /scoring/reglas/:id    → edita regla
 * DELETE /scoring/reglas/:id  → elimina regla
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsPreFlight, json, error } from "../_shared/cors.ts";
import { requireAuth, requireRole, getSupabase, getServiceClient } from "../_shared/auth.ts";
import type { ScoringRegla } from "../_shared/types.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreFlight();

  try {
    const session = await requireAuth(req);
    const sb = getSupabase(req);
    const url = new URL(req.url);
    const pathParts = url.pathname.replace(/^\/scoring\/?/, "").split("/").filter(Boolean);
    const action = pathParts[0];
    const reglaId = pathParts[1];

    // ── GET /scoring → scores del cache ──────────────────────────────────
    if (req.method === "GET" && !action) {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const { data, error: err } = await sb
        .from("scores_cache")
        .select("*, medicos(display_name, tipo, especialidad)")
        .order("score", { ascending: false });

      if (err) return error(err.message, 500);
      return json(data);
    }

    // ── POST /scoring/recalcular ──────────────────────────────────────────
    if (req.method === "POST" && action === "recalcular") {
      requireRole(session, "SUPER_ADMIN", "ADMIN");
      const svc = getServiceClient();

      const { data, error: err } = await svc.rpc("refresh_scores_cache");
      if (err) return error(err.message, 500);
      return json({ ok: true, filas: data });
    }

    // ── GET /scoring/config ───────────────────────────────────────────────
    if (req.method === "GET" && action === "config") {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const { data, error: err } = await sb
        .from("system_config")
        .select("scoring")
        .eq("id", "default")
        .single();

      if (err) return error(err.message, 500);
      return json(data?.scoring ?? {});
    }

    // ── PUT /scoring/config ───────────────────────────────────────────────
    if (req.method === "PUT" && action === "config") {
      requireRole(session, "SUPER_ADMIN", "ADMIN");

      const body = await req.json();

      // Validar que los pesos sumen 100
      const total = (body.pesoAceptacion ?? 0) + (body.pesoVelocidad ?? 0)
                  + (body.pesoPuntualidad ?? 0) + (body.pesoDisponibilidad ?? 0);
      if (Math.abs(total - 100) > 0.01) {
        return error(`Los pesos deben sumar 100 (suma actual: ${total})`);
      }

      const svc = getServiceClient();
      const { error: err } = await svc
        .from("system_config")
        .update({
          scoring:    body,
          updated_by: session.userId,
        })
        .eq("id", "default");

      if (err) return error(err.message, 500);
      return json({ ok: true });
    }

    // ── GET /scoring/reglas ───────────────────────────────────────────────
    if (req.method === "GET" && action === "reglas") {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const { data, error: err } = await sb
        .from("scoring_reglas")
        .select("*")
        .order("orden", { ascending: true });

      if (err) return error(err.message, 500);
      return json(data);
    }

    // ── POST /scoring/reglas ──────────────────────────────────────────────
    if (req.method === "POST" && action === "reglas") {
      requireRole(session, "SUPER_ADMIN", "ADMIN");

      const body = await req.json() as ScoringRegla;
      if (!body.nombre) return error("nombre requerido");

      const svc = getServiceClient();
      const { data, error: err } = await svc
        .from("scoring_reglas")
        .insert({
          nombre:           body.nombre,
          descripcion:      body.descripcion ?? null,
          tipo:             body.tipo ?? "CUSTOM",
          condicion:        body.condicion ?? {},
          modificador_tipo: body.modificador_tipo ?? "MULTIPLICADOR",
          modificador_valor: body.modificador_valor ?? 1.0,
          activa:           body.activa ?? true,
          orden:            body.orden  ?? 0,
          created_by:       session.userId,
        })
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data, 201);
    }

    // ── PUT /scoring/reglas/:id ───────────────────────────────────────────
    if (req.method === "PUT" && action === "reglas" && reglaId) {
      requireRole(session, "SUPER_ADMIN", "ADMIN");

      const body = await req.json() as Partial<ScoringRegla>;
      const svc = getServiceClient();

      const allowed = ["nombre", "descripcion", "tipo", "condicion",
                       "modificador_tipo", "modificador_valor", "activa", "orden"];
      const patch: Record<string, unknown> = {};
      for (const k of allowed) if (k in body) patch[k] = (body as any)[k];

      const { data, error: err } = await svc
        .from("scoring_reglas")
        .update(patch)
        .eq("id", reglaId)
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data);
    }

    // ── DELETE /scoring/reglas/:id ────────────────────────────────────────
    if (req.method === "DELETE" && action === "reglas" && reglaId) {
      requireRole(session, "SUPER_ADMIN", "ADMIN");

      const svc = getServiceClient();
      const { error: err } = await svc
        .from("scoring_reglas")
        .delete()
        .eq("id", reglaId);

      if (err) return error(err.message, 500);
      return json({ ok: true });
    }

    return error("Ruta no encontrada", 404);

  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return error("No autenticado", 401);
    if (e.message === "FORBIDDEN")    return error("Sin permisos", 403);
    return error(e.message, 500);
  }
});
