/**
 * Edge Function: /auth
 *
 * POST /auth/login           → login con pin/código (demo) o email+password
 * POST /auth/logout          → invalidar sesión
 * GET  /auth/me              → perfil del usuario autenticado
 * POST /auth/create-profile  → crea perfil tras signup (llamado internamente)
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreFlight, json, error } from "../_shared/cors.ts";
import { requireAuth, getServiceClient } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreFlight();

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  // ── POST /auth/login ──────────────────────────────────────────────────
  if (req.method === "POST" && action === "login") {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) return error("email y password requeridos");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data, error: err } = await sb.auth.signInWithPassword({ email, password });
    if (err) return error("Credenciales inválidas", 401);

    // Leer perfil
    const { data: profile } = await sb
      .from("profiles")
      .select("role, medico_id, display_name")
      .eq("id", data.user.id)
      .single();

    return json({
      access_token:  data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_in:    data.session?.expires_in,
      user: {
        id:          data.user.id,
        email:       data.user.email,
        role:        profile?.role,
        medicoId:    profile?.medico_id,
        displayName: profile?.display_name,
      },
    });
  }

  // ── POST /auth/logout ─────────────────────────────────────────────────
  if (req.method === "POST" && action === "logout") {
    // El cliente invalida el token localmente; el backend puede revocar
    return json({ ok: true });
  }

  // ── GET /auth/me ──────────────────────────────────────────────────────
  if (req.method === "GET" && action === "me") {
    try {
      const session = await requireAuth(req);
      const svc = getServiceClient();

      const { data: profile } = await svc
        .from("profiles")
        .select("role, medico_id, display_name")
        .eq("id", session.userId)
        .single();

      return json({
        id:          session.userId,
        role:        session.role,
        medicoId:    session.medicoId,
        displayName: profile?.display_name,
      });
    } catch {
      return error("No autenticado", 401);
    }
  }

  // ── POST /auth/create-profile ─────────────────────────────────────────
  // Llamado desde un trigger de Supabase Auth (after signup)
  if (req.method === "POST" && action === "create-profile") {
    const body = await req.json();
    const { userId, email, role, displayName, medicoId } = body;

    if (!userId) return error("userId requerido");

    const svc = getServiceClient();
    const { error: err } = await svc.from("profiles").upsert({
      id:           userId,
      role:         role ?? "MEDICO",
      display_name: displayName ?? email ?? "",
      medico_id:    medicoId ?? null,
    });

    if (err) return error(err.message, 500);
    return json({ ok: true });
  }

  return error("Ruta no encontrada", 404);
});
