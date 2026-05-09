import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authStore } from "./auth.store";
import { homeForRole } from "./auth.types";
import lockupPng from "../assets/branding/mediflow-lockup.png";

export function LoginPage() {
  const nav = useNavigate();
  const [idInput, setIdInput] = useState("1001");
  const [error, setError] = useState<string | null>(null);

  const hint = useMemo(() => {
    const v = (idInput || "").trim();
    if (!v) return "Ingresá Nro Funcionario o Cédula";
    if (v.toUpperCase().startsWith("F-"))  return "Detectado: Funcionario";
    if (v.toUpperCase().startsWith("CI-")) return "Detectado: Cédula";
    if (/^\d+$/.test(v)) return "Detectado: número (funcionario o cédula)";
    return "Tip: usá solo números, o prefijo F- / CI-";
  }, [idInput]);

  function onLogin() {
    setError(null);
    const res = authStore.loginByIdOrUserId(idInput);
    if (!res.ok) { setError(res.error); return; }
    authStore.setSession(res.user);
    nav(homeForRole(res.user.role));
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <img src={lockupPng} alt="MediFlow" style={logoStyle} draggable={false} />
        </div>

        {/* Tagline */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          <span style={demoBadgeStyle}>Demo</span>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>
            Convocatorias y suplencias médicas con trazabilidad y reportes.
          </p>
        </div>

        {/* Campo */}
        <label style={labelStyle}>ID (Nro. funcionario o cédula)</label>
        <input
          style={inputStyle}
          value={idInput}
          onChange={e => setIdInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onLogin(); }}
          placeholder="Ej: 1001 · 9999 · 48206484"
          autoFocus
        />
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--subtle)" }}>{hint}</p>

        {error && (
          <div style={errorStyle}>{error}</div>
        )}

        <button style={btnStyle} onClick={onLogin}
          onMouseEnter={e => (e.currentTarget.style.filter = "brightness(1.06)")}
          onMouseLeave={e => (e.currentTarget.style.filter = "")}>
          Ingresar
        </button>

        {/* Demo accounts */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border-2)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Accesos demo
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { id: "9999",  label: "Super Admin" },
              { id: "2001",  label: "Administrador" },
              { id: "1001",  label: "Coordinador" },
              { id: "93598", label: "Médico (F-93598)" },
            ].map(acc => (
              <button key={acc.id} style={demoAccStyle}
                onClick={() => { setIdInput(acc.id); setError(null); }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{acc.id}</span>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>{acc.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  width: "min(420px, 100%)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow)",
  padding: "28px 24px 24px",
};

const logoStyle: React.CSSProperties = {
  height: 36,
  width: "auto",
  objectFit: "contain",
};

const demoBadgeStyle: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 999,
  background: "var(--green-tint)",
  color: "var(--green-dark)",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
  letterSpacing: "0.04em",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--muted)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "#fbfdff",
  fontSize: 14,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const errorStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(220,38,38,0.07)",
  border: "1px solid rgba(220,38,38,0.18)",
  color: "var(--danger)",
  fontSize: 13,
};

const btnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 14,
  padding: "11px 12px",
  borderRadius: "var(--radius)",
  border: "none",
  background: "linear-gradient(180deg, var(--blue-mid), var(--blue))",
  color: "white",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 2px 10px rgba(21,101,192,0.25)",
  transition: "filter 0.12s",
};

const demoAccStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-2)",
  background: "var(--surface-2)",
  cursor: "pointer",
  fontSize: 13,
  textAlign: "left",
  transition: "border-color 0.12s, background 0.12s",
};
