import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authStore } from "../auth/auth.store";
import { usersStore } from "../modules/config/users.store";
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
    { label: "Inicio",         path: "/dashboard",                  rgb: "21,101,192",  exact: true },
    { label: "Parte Diario",      path: "/parte-diario",               rgb: "109,191,60"                },
    { label: "Nueva Convocatoria",path: "/dashboard/nueva",            rgb: "21,101,192",  dividerBefore: true },
    { label: "Reportes",          path: "/dashboard/reportes/horas",   rgb: "217,119,6"                 },
    { label: "Administración",    path: "/admin",                      rgb: "38,166,154",  dividerBefore: true },
    { label: "Configuración",     path: "/config",                     rgb: "100,116,139"               },
  ],
  ADMIN: [
    { label: "Inicio",         path: "/dashboard",                  rgb: "21,101,192",  exact: true },
    { label: "Parte Diario",      path: "/parte-diario",               rgb: "109,191,60"               },
    { label: "Reportes",          path: "/dashboard/reportes/horas",   rgb: "217,119,6",   dividerBefore: true },
    { label: "Administración",    path: "/admin",                      rgb: "38,166,154",  dividerBefore: true },
  ],
  COORDINADOR: [
    { label: "Inicio",         path: "/dashboard",                  rgb: "21,101,192",  exact: true },
    { label: "Parte Diario",      path: "/parte-diario",               rgb: "109,191,60"               },
    { label: "Nueva Convocatoria",path: "/dashboard/nueva",            rgb: "21,101,192",  dividerBefore: true },
    { label: "Reportes",          path: "/dashboard/reportes/horas",   rgb: "217,119,6"                },
    { label: "Administración",    path: "/admin",                      rgb: "38,166,154",  dividerBefore: true },
  ],
  MEDICO: [
    { label: "Mis Convocatorias", path: "/medico",       rgb: "21,101,192", exact: true },
    { label: "Parte Diario",      path: "/parte-diario", rgb: "109,191,60", dividerBefore: true },
  ],
  CONSULTA_PD: [
    { label: "Parte Diario",      path: "/parte-diario", rgb: "109,191,60", exact: true },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN:       "Administrador",
  COORDINADOR: "Coordinador",
  MEDICO:      "Médico",
  CONSULTA_PD: "Consulta",
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
  const session  = authStore.getSession()!;
  const navigate = useNavigate();
  const location    = useLocation();
  const prevPathRef = useRef(location.pathname);

  const prevPath  = prevPathRef.current;
  const currDepth = location.pathname.split("/").filter(Boolean).length;
  const prevDepth = prevPath.split("/").filter(Boolean).length;
  let pageAnim = "pageFadeIn 0.15s ease";
  if (location.pathname !== prevPath) {
    if (location.pathname === "/parte-diario") {
      pageAnim = "pageFadeIn 0.38s ease";
    } else if (currDepth > prevDepth) {
      pageAnim = "slideFromRight 0.20s ease";
    } else if (currDepth < prevDepth) {
      pageAnim = "slideFromLeft 0.20s ease";
    }
  }
  useEffect(() => { prevPathRef.current = location.pathname; }, [location.pathname]);

  const [showPassForm, setShowPassForm] = useState(false);
  const [passOld,     setPassOld]       = useState("");
  const [passNew,     setPassNew]       = useState("");
  const [passConfirm, setPassConfirm]   = useState("");
  const [passShowOld, setPassShowOld]   = useState(false);
  const [passShowNew, setPassShowNew]   = useState(false);
  const [passMsg,     setPassMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const items = NAV[session.role] ?? [];

  function isActive(item: NavItem): boolean {
    if (item.exact) return location.pathname === item.path;
    return location.pathname === item.path || location.pathname.startsWith(item.path + "/");
  }

  function logout() {
    authStore.clear();
    window.location.assign("/login");
  }

  function togglePassForm() {
    setShowPassForm(v => !v);
    setPassOld(""); setPassNew(""); setPassConfirm(""); setPassMsg(null);
  }

  function changePassword() {
    if (!passNew.trim())      { setPassMsg({ ok: false, text: "Ingresá la nueva contraseña." }); return; }
    if (passNew !== passConfirm) { setPassMsg({ ok: false, text: "Las contraseñas no coinciden." }); return; }
    if (!usersStore.checkPassword(session.userId, passOld))
      { setPassMsg({ ok: false, text: "Contraseña actual incorrecta." }); return; }
    usersStore.setPassword(session.userId, passNew);
    setPassMsg({ ok: true, text: "Contraseña actualizada correctamente." });
    setPassOld(""); setPassNew(""); setPassConfirm("");
    setTimeout(() => { setShowPassForm(false); setPassMsg(null); }, 1800);
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
          {/* User card — clickable para cambiar contraseña */}
          <button
            onClick={togglePassForm}
            title="Cambiar contraseña"
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "8px 8px", borderRadius: 10, marginBottom: 6,
              border: showPassForm ? "1px solid rgba(21,101,192,0.30)" : "1px solid transparent",
              background: showPassForm ? "rgba(21,101,192,0.05)" : "transparent",
              cursor: "pointer", textAlign: "left",
              transition: "background 0.12s, border-color 0.12s",
            }}
            onMouseEnter={e => { if (!showPassForm) (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
            onMouseLeave={e => { if (!showPassForm) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <div style={avatarStyle}>{initials(session.displayName)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={userNameStyle}>{session.displayName}</div>
              <div style={userRoleStyle}>{ROLE_LABEL[session.role]}</div>
            </div>
            <span style={{ fontSize: 11, color: "var(--subtle)", flexShrink: 0 }}>
              {showPassForm ? "▲" : "🔑"}
            </span>
          </button>

          {/* Formulario de cambio de contraseña */}
          {showPassForm && (
            <div style={{
              padding: "12px", borderRadius: 10, marginBottom: 8,
              background: "var(--surface-2)", border: "1px solid var(--border-2)",
            }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                Cambiar contraseña
              </p>

              {/* Contraseña actual */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input
                  type={passShowOld ? "text" : "password"}
                  placeholder="Contraseña actual"
                  value={passOld}
                  onChange={e => { setPassOld(e.target.value); setPassMsg(null); }}
                  style={passInputStyle}
                />
                <button type="button" onClick={() => setPassShowOld(v => !v)} style={passEyeStyle}>
                  {passShowOld ? "🙈" : "👁"}
                </button>
              </div>

              {/* Nueva */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input
                  type={passShowNew ? "text" : "password"}
                  placeholder="Nueva contraseña"
                  value={passNew}
                  onChange={e => { setPassNew(e.target.value); setPassMsg(null); }}
                  style={passInputStyle}
                />
                <button type="button" onClick={() => setPassShowNew(v => !v)} style={passEyeStyle}>
                  {passShowNew ? "🙈" : "👁"}
                </button>
              </div>

              {/* Confirmar */}
              <input
                type="password"
                placeholder="Confirmar nueva"
                value={passConfirm}
                onChange={e => { setPassConfirm(e.target.value); setPassMsg(null); }}
                style={{ ...passInputStyle, marginBottom: 10 }}
                onKeyDown={e => { if (e.key === "Enter") changePassword(); }}
              />

              {passMsg && (
                <p style={{
                  margin: "0 0 8px", fontSize: 11.5, lineHeight: 1.4, padding: "6px 8px",
                  borderRadius: 6, fontWeight: 600,
                  background: passMsg.ok ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.08)",
                  color: passMsg.ok ? "rgb(22,163,74)" : "rgb(185,28,28)",
                }}>
                  {passMsg.ok ? "✓ " : "✗ "}{passMsg.text}
                </p>
              )}

              <button
                onClick={changePassword}
                style={{
                  width: "100%", padding: "8px", borderRadius: 8, border: "none",
                  background: "var(--blue)", color: "#fff", fontWeight: 700, fontSize: 12,
                  cursor: "pointer",
                }}
              >Guardar contraseña</button>
            </div>
          )}

          <button onClick={logout} style={logoutBtnStyle}
            onMouseEnter={e => Object.assign((e.currentTarget as HTMLButtonElement).style, logoutHoverStyle)}
            onMouseLeave={e => Object.assign((e.currentTarget as HTMLButtonElement).style, logoutBaseStyle)}>
            <IconLogout />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </nav>

      {/* ── Main area ── */}
      <main style={{ marginLeft: "var(--sidebar-w)", flex: 1, minHeight: "100vh", padding: "22px 26px" }}>
        <div key={location.pathname} style={{ animation: pageAnim }}>
          {children}
        </div>
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
  padding: "16px 14px 14px",
  borderBottom: "1px solid var(--border-2)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const logoImgStyle: React.CSSProperties = {
  height: 44,
  width: "auto",
  display: "block",
  objectFit: "contain",
  objectPosition: "center",
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
const passInputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "7px 32px 7px 10px", borderRadius: 7,
  border: "1px solid var(--border)", background: "var(--surface)",
  fontSize: 12, color: "var(--text)", fontFamily: "inherit",
};
const passEyeStyle: React.CSSProperties = {
  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0,
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
