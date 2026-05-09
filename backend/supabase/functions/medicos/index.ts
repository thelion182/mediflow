/**
 * Edge Function: /medicos
 *
 * GET  /medicos          → lista (coord+)
 * GET  /medicos/:id      → detalle
 * POST /medicos          → crear/upsert (admin+)
 * PUT  /medicos/:id      → editar (admin+)
 * DELETE /medicos/:id    → eliminar lógico (admin+)
 * GET  /medicos/:id/score → score del médico
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsPreFlight, json, error } from "../_shared/cors.ts";
import { requireAuth, requireRole, getSupabase, getServiceClient } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreFlight();

  try {
    const session = await requireAuth(req);
    const sb = getSupabase(req);
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/medicos\/?/, "").split("/").filter(Boolean);
    const medicoId = parts[0] ?? null;
    const subaction = parts[1] ?? null;

    // ── GET /medicos ────────────────────────────────────────────────────
    if (req.method === "GET" && !medicoId) {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const soloActivos = url.searchParams.get("activos") !== "false";
      let query = sb.from("medicos").select("*").order("prioridad", { ascending: true, nullsFirst: false });
      if (soloActivos) query = query.eq("activo", true);

      const { data, error: err } = await query;
      if (err) return error(err.message, 500);
      return json(data);
    }

    // ── GET /medicos/:id/score ──────────────────────────────────────────
    if (req.method === "GET" && medicoId && subaction === "score") {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const { data, error: err } = await sb
        .from("scores_cache")
        .select("*")
        .eq("medico_id", medicoId)
        .maybeSingle();

      if (err) return error(err.message, 500);
      return json(data ?? { medico_id: medicoId, score: 0, pct_aceptacion: 0, inv_total: 0 });
    }

    // ── GET /medicos/:id ────────────────────────────────────────────────
    if (req.method === "GET" && medicoId) {
      const { data, error: err } = await sb
        .from("medicos")
        .select("*")
        .eq("user_id", medicoId)
        .single();

      if (err) return error(err.message, 404);
      return json(data);
    }

    // ── POST /medicos (upsert) ──────────────────────────────────────────
    if (req.method === "POST" && !medicoId) {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const body = await req.json();
      if (!body.user_id || !body.display_name) return error("user_id y display_name requeridos");

      const svc = getServiceClient();
      const { data, error: err } = await svc
        .from("medicos")
        .upsert({
          user_id:      body.user_id,
          display_name: body.display_name.trim(),
          cedula:       body.cedula?.trim()      || null,
          funcionario:  body.funcionario?.trim() || null,
          especialidad: body.especialidad?.trim()|| null,
          telefono:     body.telefono?.trim()    || null,
          tipo:         body.tipo     ?? "SUPLENTE",
          prioridad:    body.prioridad ?? null,
          activo:       body.activo   ?? true,
        })
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data, 201);
    }

    // ── PUT /medicos/:id ────────────────────────────────────────────────
    if (req.method === "PUT" && medicoId) {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const body = await req.json();
      const allowed = ["display_name","cedula","funcionario","especialidad","telefono","tipo","prioridad","activo"];
      const patch: Record<string, unknown> = {};
      for (const f of allowed) if (f in body) patch[f] = body[f];

      const svc = getServiceClient();
      const { data, error: err } = await svc
        .from("medicos")
        .update(patch)
        .eq("user_id", medicoId)
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data);
    }

    // ── DELETE /medicos/:id (soft delete) ───────────────────────────────
    if (req.method === "DELETE" && medicoId) {
      requireRole(session, "SUPER_ADMIN", "ADMIN");

      const svc = getServiceClient();
      const { error: err } = await svc
        .from("medicos")
        .update({ activo: false })
        .eq("user_id", medicoId);

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
