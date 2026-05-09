import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Role = "SUPER_ADMIN" | "ADMIN" | "COORDINADOR" | "MEDICO";

export interface Session {
  userId: string;
  role: Role;
  medicoId?: string;
}

export function getSupabase(req: Request) {
  const url  = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export async function requireAuth(req: Request): Promise<Session> {
  const sb = getSupabase(req);
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");

  const { data: profile } = await sb
    .from("profiles")
    .select("role, medico_id")
    .eq("id", user.id)
    .single();

  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  return {
    userId:   user.id,
    role:     profile.role as Role,
    medicoId: profile.medico_id ?? undefined,
  };
}

export function requireRole(session: Session, ...roles: Role[]) {
  if (!roles.includes(session.role)) throw new Error("FORBIDDEN");
}
