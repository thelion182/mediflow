import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authStore } from "../auth/auth.store";
import type { Role } from "../auth/auth.types";
import lockupPng from "../assets/branding/mediflow-lockup.png";

// ── Nav items ───────────────────────────────────────────────────────────
type NavItem = {
  label: string;
  path: string;
  rgb?: string;        // "r, g, b" para rgba() en estado activo
  exact?: boolean;     // match exacto (evita que /dashboard active /dashboard/nueva)
  dividerBefore?: boolean;
};

const NAV: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { label: "Dashboard",         path: "/dashboard",                  rgb: "21,101,192",  exact: true },
    { label: "Parte Diario",      path: "/parte-diario",               rgb: "109,191,60"                },
    { label: "Nueva Convocatoria",path: "/dashboard/nueva",            rgb: "21,101,192",  dividerBefore: true },
    { label: "Reportes",          path: "/dashboard/reportes/horas",   rgb: "217,119,6"                 },
    { label: "Administración",    path: "/admin",                      rgb: "38,166,154",  dividerBefore: true },
    { label: "Configuración",     path: "/config",                     rgb: "100,116,139"               },
  ],
  ADMIN: [
    { label: "Dashboard",         path: "/dashboard",                  rgb: "21,101,192",  exact: true },
    { label: "Parte Diario",      path: "/parte-diario",               rgb: "109,191,60"               },
    { label: "Reportes",          path: "/dashboard/reportes/horas",   rgb: "217,119,6",   dividerBefore: true },
    { label: "Administración",    path: "/admin",                      rgb: "38,166,154",  dividerBefore: true },
  ],
  COORDINADOR: [
    { label: "Dashboard",         path: "/dashboard",                  rgb: "21,101,192",  exact: true },
    { label: "Parte Diario",      path: "/parte-diario",               rgb: "109,191,60"               },
    { label: "Nueva Convocatoria",path: "/dashboard/nueva",            rgb: "21,101,192",  dividerBefore: true },
    { label: "Reportes",          path: "/dashboard/reportes/horas",   rgb: "217,119,6"                },
    { label: "Administración",    path: "/admin",                      rgb: "38,166,154",  dividerBefore: true },
  ],
  MEDICO: [
    { label: "Mis Convocatorias", path: "/medico",                     rgb: "21,101,192",  exact: true },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN:       "Administrador",
  COORDINADOR: "Coordinador",
  MEDICO:      "Médico",
};

// ── Icons (SVG inline) ──────────────────────────────────────────────────
function IconDot({ color }: { color: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" style={{ flexShrink: 0 }}>
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────
function initials(name: string) {
  return (name || "U").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ── AppShell ─────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  const session = authStore.getSession()!;
  const navigate = useNavigate();
  const location = useLocation();

  const items = NAV[session.role] ?? [];

  function isActive(item: NavItem): boolean {
    if (item.exact) return location.pathname === item.path;
    return location.pathname === item.path || location.pathname.startsWith(item.path + "/");
  }

  function logout() {
    authStore.clear();
    window.location.assign("/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ── */}
      <nav style={sidebarStyle}>
        {/* Logo */}
        <div style={logoAreaStyle}>
          <img src={lockupPng} alt="MediFlow" style={logoImgStyle} draggable={false} />
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((item, i) => {
            const active = isActive(item);
            const rgb = item.rgb ?? "21,101,192";
            return (
              <React.Fragment key={item.path}>
                {item.dividerBefore && i > 0 && (
                  <div style={{ height: 1, background: "var(--border-2)", margin: "6px 4px" }} />
                )}
                <button
                  onClick={() => navigate(item.path)}
                  style={navItemStyle(active, rgb)}
                >
                  <IconDot color={active ? `rgb(${rgb})` : "var(--subtle)"} />
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer: user + logout */}
        <div style={{ padding: "10px 8px", borderTop: "1px solid var(--border-2)" }}>
          <div style={userCardStyle}>
            <div style={avatarStyle}>{initials(session.displayName)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={userNameStyle}>{session.displayName}</div>
              <div style={userRoleStyle}>{ROLE_LABEL[session.role]}</div>
            </div>
          </div>
          <button onClick={logout} style={logoutBtnStyle}
            onMouseEnter={e => Object.assign((e.currentTarget as HTMLButtonElement).style, logoutHoverStyle)}
            onMouseLeave={e => Object.assign((e.currentTarget as HTMLButtonElement).style, logoutBaseStyle)}>
            <IconLogout />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </nav>

      {/* ── Main area ── */}
      <main style={{ marginLeft: "var(--sidebar-w)", flex: 1, minHeight: "100vh", padding: "22px 26px", maxWidth: 1100 }}>
        {children}
      </main>
    </div>
  );
}

// ── Styles (objects) ────────────────────────────────────────────────────
const sidebarStyle: React.CSSProperties = {
  width: "var(--sidebar-w)",
  minHeight: "100vh",
  background: "var(--surface)",
  borderRight: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  zIndex: 100,
  overflowY: "auto",
};

const logoAreaStyle: React.CSSProperties = {
  padding: "16px 16px 14px",
  borderBottom: "1px solid var(--border-2)",
};

const logoImgStyle: React.CSSProperties = {
  height: 30,
  width: "auto",
  display: "block",
  objectFit: "contain",
  objectPosition: "left center",
};

function navItemStyle(active: boolean, rgb: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "9px 10px",
    borderRadius: 10,
    border: "none",
    background: active ? `rgba(${rgb}, 0.10)` : "transparent",
    color: active ? `rgb(${rgb})` : "var(--muted)",
    fontWeight: active ? 600 : 500,
    fontSize: 13.5,
    cursor: "pointer",
    textAlign: "left",
    transition: "background 0.12s, color 0.12s",
  };
}

const userCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 8px",
  borderRadius: 10,
  marginBottom: 6,
};

const avatarStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "var(--blue-tint-2)",
  color: "var(--blue)",
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
};

const userNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const userRoleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  marginTop: 1,
};

const logoutBaseStyle: React.CSSProperties = {
  background: "transparent",
  borderColor: "var(--border)",
  color: "var(--muted)",
};
const logoutHoverStyle: React.CSSProperties = {
  background: "rgba(220,38,38,0.06)",
  borderColor: "rgba(220,38,38,0.20)",
  color: "var(--danger)",
};
const logoutBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--muted)",
  fontSize: 13,
  cursor: "pointer",
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
};
