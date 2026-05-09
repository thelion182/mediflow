/**
 * Webhook: /webhooks/whatsapp
 *
 * Recibe respuestas de médicos via WhatsApp Business API o Twilio.
 * El médico responde "1" = ACEPTO, "2" = RECHAZO al número de coordinación.
 *
 * Para activar: configurar este endpoint como webhook en Meta / Twilio.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsPreFlight, json, error } from "../../_shared/cors.ts";
import { getServiceClient } from "../../_shared/auth.ts";

const VERIFY_TOKEN = Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreFlight();

  // ── Verificación de webhook (GET de Meta) ──────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return error("Verify token inválido", 403);
  }

  // ── POST: mensaje entrante ─────────────────────────────────────────────
  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return error("JSON inválido"); }

    // Detectar proveedor por estructura del payload
    const isMetaWA = body?.object === "whatsapp_business_account";
    const isTwilio = body?.From !== undefined && body?.Body !== undefined;

    let fromNumber = "";
    let messageText = "";

    if (isMetaWA) {
      const entry   = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const msg     = changes?.value?.messages?.[0];
      if (!msg) return json({ ok: true }); // ping de Meta, ignorar
      fromNumber  = msg.from;
      messageText = msg.text?.body?.trim() ?? "";
    } else if (isTwilio) {
      fromNumber  = String(body.From ?? "").replace("whatsapp:", "");
      messageText = String(body.Body ?? "").trim();
    } else {
      return json({ ok: true }); // payload desconocido, ignorar silenciosamente
    }

    const respuesta = resolverRespuesta(messageText);
    if (!respuesta) return json({ ok: true }); // respuesta no reconocida

    await procesarRespuesta(fromNumber, respuesta);
    return json({ ok: true });
  }

  return error("Método no permitido", 405);
});

// Interpreta el texto del mensaje como ACEPTO / RECHAZO / null
function resolverRespuesta(text: string): "ACEPTO" | "RECHAZO" | null {
  const t = text.toLowerCase().trim();
  if (["1", "acepto", "si", "sí", "yes", "ok"].includes(t)) return "ACEPTO";
  if (["2", "rechazo", "no"].includes(t)) return "RECHAZO";
  return null;
}

async function procesarRespuesta(telefono: string, respuesta: "ACEPTO" | "RECHAZO") {
  const svc = getServiceClient();

  // Normalizar número (eliminar prefijos de país si es necesario)
  const telNorm = normalizarTel(telefono);

  // Buscar médico por teléfono
  const { data: medico } = await svc
    .from("medicos")
    .select("user_id")
    .or(`telefono.eq.${telNorm},telefono.eq.+${telNorm}`)
    .maybeSingle();

  if (!medico) return; // médico no registrado

  // Buscar invitación activa más reciente (ENVIADA o VISTA) del médico
  const { data: inv } = await svc
    .from("invitaciones")
    .select("id, convocatoria_id, convocatorias(vencimiento, modo_envio, cupos)")
    .eq("medico_id", medico.user_id)
    .in("estado", ["ENVIADA", "VISTA"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!inv) return; // no hay invitación activa

  const conv = (inv as any).convocatorias;
  if (new Date(conv.vencimiento) < new Date()) return; // convocatoria vencida

  // Actualizar invitación
  await svc.from("invitaciones").update({
    estado:       respuesta,
    responded_at: new Date().toISOString(),
  }).eq("id", inv.id);

  if (respuesta === "ACEPTO") {
    // Verificar cupos disponibles antes de asignar
    const { data: asigs } = await svc
      .from("asignaciones")
      .select("id")
      .eq("convocatoria_id", inv.convocatoria_id)
      .eq("estado", "CONFIRMADA");

    const confirmadas = (asigs ?? []).length;
    if (confirmadas < Number(conv.cupos)) {
      await svc.from("asignaciones").insert({
        convocatoria_id: inv.convocatoria_id,
        medico_id:       medico.user_id,
        estado:          "CONFIRMADA",
      });
    }
  } else if (conv.modo_envio === "SECUENCIAL") {
    // Activar siguiente en espera
    const { data: siguiente } = await svc
      .from("invitaciones")
      .select("id")
      .eq("convocatoria_id", inv.convocatoria_id)
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

  // Actualizar estado convocatoria
  await actualizarEstadoConv(svc, inv.convocatoria_id, conv.cupos);
}

async function actualizarEstadoConv(svc: any, convId: string, cupos: number) {
  const { data: asigs } = await svc
    .from("asignaciones")
    .select("estado")
    .eq("convocatoria_id", convId);

  const confirmadas = (asigs ?? []).filter((a: any) => a.estado === "CONFIRMADA").length;
  const estado = confirmadas === 0 ? "ENVIADA" : confirmadas < cupos ? "PARCIAL" : "CUBIERTA";

  await svc.from("convocatorias").update({ estado }).eq("id", convId);
}

function normalizarTel(t: string): string {
  return t.replace(/\D/g, "").replace(/^598/, "").replace(/^0/, "");
}
