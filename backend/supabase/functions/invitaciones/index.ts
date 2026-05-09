/**
 * Edge Function: /invitaciones
 *
 * POST /invitaciones/responder   → médico acepta o rechaza
 * POST /invitaciones/cancelar    → coord cancela asignación
 * POST /invitaciones/asignar     → coord asigna manualmente
 * POST /invitaciones/marcar-vista → médico marcó como vista (WebSocket fallback)
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
    const action = url.pathname.split("/").pop();

    // ── RESPONDER ────────────────────────────────────────────────────────
    if (req.method === "POST" && action === "responder") {
      requireRole(session, "MEDICO");

      const { invitacionId, respuesta } = await req.json();
      if (!["ACEPTO", "RECHAZO"].includes(respuesta)) return error("respuesta inválida");

      // Verificar que la invitación pertenece al médico
      const { data: inv, error: fetchErr } = await sb
        .from("invitaciones")
        .select("*, convocatorias(*)")
        .eq("id", invitacionId)
        .eq("medico_id", session.medicoId ?? "")
        .single();

      if (fetchErr || !inv) return error("Invitación no encontrada", 404);
      if (!["ENVIADA", "VISTA"].includes(inv.estado)) return error("Invitación no está activa");
      if (new Date(inv.convocatorias.vencimiento) < new Date()) return error("Convocatoria vencida");

      const svc = getServiceClient();

      // Actualizar invitación
      await svc.from("invitaciones").update({
        estado: respuesta,
        responded_at: new Date().toISOString(),
      }).eq("id", invitacionId);

      if (respuesta === "ACEPTO") {
        // Crear asignación
        await svc.from("asignaciones").insert({
          convocatoria_id: inv.convocatoria_id,
          medico_id:       session.medicoId,
          estado:          "CONFIRMADA",
        });

        // Actualizar estado convocatoria
        await actualizarEstadoConvocatoria(svc, inv.convocatoria_id);
      } else {
        // Rechazo en secuencial → activar siguiente
        if (inv.convocatorias.modo_envio === "SECUENCIAL") {
          await activarSiguiente(svc, inv.convocatoria_id);
        }
        await actualizarEstadoConvocatoria(svc, inv.convocatoria_id);
      }

      return json({ ok: true });
    }

    // ── MARCAR VISTA ────────────────────────────────────────────────────
    if (req.method === "POST" && action === "marcar-vista") {
      requireRole(session, "MEDICO");

      const { invitacionId } = await req.json();
      const svc = getServiceClient();

      await svc.from("invitaciones")
        .update({ estado: "VISTA", seen_at: new Date().toISOString() })
        .eq("id", invitacionId)
        .eq("medico_id", session.medicoId ?? "")
        .eq("estado", "ENVIADA"); // solo si sigue ENVIADA

      return json({ ok: true });
    }

    // ── CANCELAR ASIGNACIÓN ─────────────────────────────────────────────
    if (req.method === "POST" && action === "cancelar") {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const { convocatoriaId, asignacionId, nota } = await req.json();
      const svc = getServiceClient();

      await svc.from("asignaciones").update({
        estado:      "CANCELADA_POR_MEDICO",
        cierre_nota: nota ?? null,
        closed_at:   new Date().toISOString(),
      }).eq("id", asignacionId).eq("convocatoria_id", convocatoriaId);

      await actualizarEstadoConvocatoria(svc, convocatoriaId);
      return json({ ok: true });
    }

    // ── ASIGNAR MANUALMENTE ─────────────────────────────────────────────
    if (req.method === "POST" && action === "asignar") {
      requireRole(session, "SUPER_ADMIN", "ADMIN", "COORDINADOR");

      const { convocatoriaId, medicoId, nota } = await req.json();
      const svc = getServiceClient();

      // Verificar que no exista ya una asignación CONFIRMADA para este médico
      const { data: existe } = await svc
        .from("asignaciones")
        .select("id")
        .eq("convocatoria_id", convocatoriaId)
        .eq("medico_id", medicoId)
        .eq("estado", "CONFIRMADA")
        .maybeSingle();

      if (existe) return error("El médico ya tiene una asignación activa en esta convocatoria");

      await svc.from("asignaciones").insert({
        convocatoria_id: convocatoriaId,
        medico_id:       medicoId,
        estado:          "CONFIRMADA",
        cierre_nota:     nota ?? null,
        created_by:      session.userId,
      });

      await actualizarEstadoConvocatoria(svc, convocatoriaId);
      return json({ ok: true });
    }

    return error("Acción no reconocida", 404);

  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return error("No autenticado", 401);
    if (e.message === "FORBIDDEN")    return error("Sin permisos", 403);
    return error(e.message, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function actualizarEstadoConvocatoria(svc: any, convId: string) {
  const { data: conv } = await svc
    .from("convocatorias")
    .select("cupos, estado")
    .eq("id", convId)
    .single();

  if (!conv) return;

  const { data: asigs } = await svc
    .from("asignaciones")
    .select("estado")
    .eq("convocatoria_id", convId);

  const confirmadas = (asigs ?? []).filter((a: any) => a.estado === "CONFIRMADA").length;
  const cupos = conv.cupos;

  let nuevoEstado = conv.estado;
  if (confirmadas === 0)         nuevoEstado = "ENVIADA";
  else if (confirmadas < cupos)  nuevoEstado = "PARCIAL";
  else                           nuevoEstado = "CUBIERTA";

  if (nuevoEstado !== conv.estado) {
    await svc.from("convocatorias")
      .update({ estado: nuevoEstado })
      .eq("id", convId);
  }
}

async function activarSiguiente(svc: any, convId: string) {
  const { data: siguiente } = await svc
    .from("invitaciones")
    .select("id")
    .eq("convocatoria_id", convId)
    .eq("estado", "EN_ESPERA")
    .order("orden", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (siguiente) {
    await svc.from("invitaciones").update({
      estado:  "ENVIADA",
      sent_at: new Date().toISOString(),
    }).eq("id", siguiente.id);
  }
}
