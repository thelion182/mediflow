/**
 * Edge Function: /convocatorias
 *
 * GET  /convocatorias          → lista (coord+)
 * GET  /convocatorias/:id      → detalle
 * POST /convocatorias          → crear + enviar invitaciones
 * PATCH /convocatorias/:id     → editar estado / datos
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsPreFlight, json, error } from "../_shared/cors.ts";
import { requireAuth, requireRole, getSupabase } from "../_shared/auth.ts";
import type { CreateConvocatoriaInput, Canal } from "../_shared/types.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreFlight();

  try {
    const session = await requireAuth(req);
    const sb = getSupabase(req);
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/convocatorias\/?/, "").split("/");
    const id = parts[0] || null;

    // ── GET /convocatorias ──────────────────────────────────────────────
    if (req.method === "GET" && !id) {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const { data, error: err } = await sb
        .from("convocatorias")
        .select(`
          *,
          invitaciones(*),
          asignaciones(*)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (err) return error(err.message, 500);
      return json(data);
    }

    // ── GET /convocatorias/:id ──────────────────────────────────────────
    if (req.method === "GET" && id) {
      const { data, error: err } = await sb
        .from("convocatorias")
        .select("*, invitaciones(*), asignaciones(*)")
        .eq("id", id)
        .single();

      if (err) return error(err.message, err.code === "PGRST116" ? 404 : 500);
      return json(data);
    }

    // ── POST /convocatorias ─────────────────────────────────────────────
    if (req.method === "POST" && !id) {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const body = await req.json() as CreateConvocatoriaInput;

      // Validaciones básicas
      if (!body.sector)             return error("sector requerido");
      if (!body.inicio || !body.fin) return error("inicio y fin requeridos");
      if (!body.destinatarios?.length) return error("al menos un destinatario requerido");
      if (!body.canales?.length)    return error("al menos un canal requerido");

      const cupos   = Number(body.cupos) || 1;
      const modo    = cupos > 1 ? "MASIVO" : (body.modoEnvio || "SECUENCIAL");
      const canales = body.canales as Canal[];

      // Insertar convocatoria
      const { data: conv, error: convErr } = await sb
        .from("convocatorias")
        .insert({
          sector:      body.sector,
          sede:        body.sede   ?? null,
          inicio:      body.inicio,
          fin:         body.fin,
          cupos,
          vencimiento: body.vencimiento,
          prioridad:   body.prioridad ?? "NORMAL",
          notas:       body.notas    ?? null,
          modo_envio:  modo,
          canales,
          timeouts:    body.timeouts ?? { sinVerMin: 30, sinResponderMin: 15 },
          estado:      "ENVIADA",
          created_by:  session.userId,
        })
        .select()
        .single();

      if (convErr) return error(convErr.message, 500);

      // Insertar invitaciones
      const canalPrimario = canales[0];
      const invitaciones = body.destinatarios.map((medicoId, idx) => ({
        convocatoria_id: conv.id,
        medico_id: medicoId,
        canal: canalPrimario,
        estado: modo === "MASIVO" ? "ENVIADA" : (idx === 0 ? "ENVIADA" : "EN_ESPERA"),
        orden: idx,
        sent_at: modo === "MASIVO" || idx === 0 ? new Date().toISOString() : null,
      }));

      const { error: invErr } = await sb.from("invitaciones").insert(invitaciones);
      if (invErr) return error(invErr.message, 500);

      // TODO: disparar envío real (WhatsApp / SMS / Email) via queue

      return json(conv, 201);
    }

    // ── PATCH /convocatorias/:id ────────────────────────────────────────
    if (req.method === "PATCH" && id) {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const body = await req.json();
      const allowedFields = ["estado", "notas", "cancel_reason", "prioridad"];
      const patch: Record<string, unknown> = {};
      for (const f of allowedFields) {
        if (f in body) patch[f] = body[f];
      }

      const { data, error: err } = await sb
        .from("convocatorias")
        .update(patch)
        .eq("id", id)
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data);
    }

    return error("Method not allowed", 405);

  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return error("No autenticado", 401);
    if (e.message === "FORBIDDEN")    return error("Sin permisos", 403);
    return error(e.message, 500);
  }
});
