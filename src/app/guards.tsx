import React from "react";
import { Navigate } from "react-router-dom";
import { authStore } from "../auth/auth.store";
import type { Role } from "../auth/auth.types";
import { homeForRole } from "../auth/auth.types";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = authStore.getSession();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Acepta uno o más roles permitidos
export function RequireRole({ roles, children }: { roles: Role | Role[]; children: React.ReactNode }) {
  const session = authStore.getSession();
  if (!session) return <Navigate to="/login" replace />;

  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(session.role)) {
    return <Navigate to={homeForRole(session.role)} replace />;
  }
  return <>{children}</>;
}

// Shorthand para rutas de coordinación (COORDINADOR, ADMIN, SUPER_ADMIN)
export function RequireCoord({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["COORDINADOR", "ADMIN", "SUPER_ADMIN"]}>
      {children}
    </RequireRole>
  );
}

// Shorthand para rutas de administración (ADMIN, SUPER_ADMIN)
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
      {children}
    </RequireRole>
  );
}
