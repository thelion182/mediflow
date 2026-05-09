/**
 * Webhook: /webhooks/sms
 *
 * Recibe respuestas de médicos vía SMS (Twilio / SMSMasivos.uy / AWS SNS).
 * Médico responde "1" = ACEPTO, "2" = RECHAZO.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsPreFlight, json, error } from "../../_shared/cors.ts";
import { getServiceClient } from "../../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreFlight();
  if (req.method !== "POST") return error("Método no permitido", 405);

  let fromNumber = "";
  let messageText = "";

  const contentType = req.headers.get("content-type") ?? "";

  // Twilio SMS: form-encoded
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    fromNumber  = params.get("From") ?? "";
    messageText = (params.get("Body") ?? "").trim();
  } else {
    // AWS SNS / SMSMasivos: JSON
    try {
      const body = await req.json();
      // AWS SNS
      if (body?.Type === "Notification") {
        const msg = JSON.parse(body.Message ?? "{}");
        fromNumber  = msg.originationNumber ?? msg.from ?? "";
        messageText = (msg.messageBody ?? "").trim();
      } else {
        // SMSMasivos o genérico
        fromNumber  = body.from ?? body.sender ?? "";
        messageText = (body.text ?? body.body ?? body.message ?? "").trim();
      }
    } catch {
      return error("Payload no reconocido");
    }
  }

  if (!fromNumber || !messageText) return json({ ok: true });

  const respuesta = resolverRespuesta(messageText);
  if (!respuesta) return json({ ok: true });

  await procesarRespuesta(fromNumber, respuesta);
  return json({ ok: true });
});

function resolverRespuesta(text: string): "ACEPTO" | "RECHAZO" | null {
  const t = text.toLowerCase().trim();
  if (["1", "acepto", "si", "sí", "yes", "ok"].includes(t)) return "ACEPTO";
  if (["2", "rechazo", "no"].includes(t)) return "RECHAZO";
  return null;
}

async function procesarRespuesta(telefono: string, respuesta: "ACEPTO" | "RECHAZO") {
  const svc = getServiceClient();
  const telNorm = telefono.replace(/\D/g, "").replace(/^598/, "").replace(/^0/, "");

  const { data: medico } = await svc
    .from("medicos")
    .select("user_id")
    .or(`telefono.eq.${telNorm},telefono.eq.+598${telNorm}`)
    .maybeSingle();

  if (!medico) return;

  const { data: inv } = await svc
    .from("invitaciones")
    .select("id, convocatoria_id, convocatorias(vencimiento, modo_envio, cupos)")
    .eq("medico_id", medico.user_id)
    .in("estado", ["ENVIADA", "VISTA"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!inv) return;

  const conv = (inv as any).convocatorias;
  if (new Date(conv.vencimiento) < new Date()) return;

  await svc.from("invitaciones").update({
    estado:       respuesta,
    responded_at: new Date().toISOString(),
  }).eq("id", inv.id);

  if (respuesta === "ACEPTO") {
    const { data: asigs } = await svc
      .from("asignaciones")
      .select("id")
      .eq("convocatoria_id", inv.convocatoria_id)
      .eq("estado", "CONFIRMADA");

    if ((asigs ?? []).length < Number(conv.cupos)) {
      await svc.from("asignaciones").insert({
        convocatoria_id: inv.convocatoria_id,
        medico_id:       medico.user_id,
        estado:          "CONFIRMADA",
      });
    }
  } else if (conv.modo_envio === "SECUENCIAL") {
    const { data: sig } = await svc
      .from("invitaciones")
      .select("id")
      .eq("convocatoria_id", inv.convocatoria_id)
      .eq("estado", "EN_ESPERA")
      .order("orden", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (sig) {
      await svc.from("invitaciones").update({
        estado: "ENVIADA", sent_at: new Date().toISOString(),
      }).eq("id", sig.id);
    }
  }

  const { data: asigs } = await svc
    .from("asignaciones").select("estado")
    .eq("convocatoria_id", inv.convocatoria_id);

  const n = (asigs ?? []).filter((a: any) => a.estado === "CONFIRMADA").length;
  const estado = n === 0 ? "ENVIADA" : n < Number(conv.cupos) ? "PARCIAL" : "CUBIERTA";
  await svc.from("convocatorias").update({ estado }).eq("id", inv.convocatoria_id);
}
