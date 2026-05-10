import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authStore } from "./auth.store";
import { homeForRole } from "./auth.types";
import { usersStore } from "../modules/config/users.store";
import lockupPng from "../assets/branding/mediflow-lockup.png";

export function LoginPage() {
  const nav = useNavigate();
  const [idInput,  setIdInput]  = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const defaultPassword = usersStore.getConfig().defaultPassword;

  const hint = useMemo(() => {
    const v = (idInput || "").trim();
    if (!v) return "Nro. funcionario, cédula, F-xxxx o CI-xxxx";
    if (v.toUpperCase().startsWith("F-"))  return "Acceso como funcionario";
    if (v.toUpperCase().startsWith("CI-")) return "Acceso por cédula";
    if (/^\d+$/.test(v)) return "Nro. funcionario o cédula";
    return "Usá solo números, o prefijo F- / CI-";
  }, [idInput]);

  function onLogin() {
    if (!password) { setLoginError("Ingresá la contraseña."); return; }
    setLoginError(null);
    setLoading(true);
    setTimeout(() => {
      const res = authStore.loginWithPassword(idInput, password);
      setLoading(false);
      if (!res.ok) { setLoginError(res.error); return; }
      authStore.setSession(res.user);
      nav(homeForRole(res.user.role));
    }, 280);
  }

  function quickLogin(id: string) {
    setIdInput(id);
    setPassword(defaultPassword);
    setLoginError(null);
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>

        {/* ── Banda decorativa ── */}
        <div style={headerBandStyle} />

        {/* ── Logo ── */}
        <div style={logoAreaStyle}>
          <img src={lockupPng} alt="MediFlow" style={logoStyle} draggable={false} />
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Gestión de guardias y suplencias médicas
          </p>
        </div>

        {/* ── Formulario ── */}
        <div style={formBodyStyle}>
          {/* ID */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>ID de acceso</label>
            <input
              style={inputStyle}
              value={idInput}
              onChange={e => setIdInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onLogin(); }}
              placeholder="Ej: 1001 · 9999 · CI-48206484"
              autoFocus
            />
            <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--subtle)" }}>{hint}</p>
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...inputStyle, paddingRight: 40 }}
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onLogin(); }}
                placeholder="Contraseña"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 16, color: "var(--muted)", padding: 2,
                }}
              >{showPass ? "🙈" : "👁"}</button>
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--subtle)" }}>
              Contraseña demo: <code style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--blue)" }}>{defaultPassword}</code>
            </p>
          </div>

          {loginError && <div style={errorStyle}>{loginError}</div>}

          <button
            style={{ ...btnStyle, opacity: loading ? 0.75 : 1 }}
            onClick={onLogin}
            disabled={loading}
            onMouseEnter={e => !loading && ((e.currentTarget as HTMLElement).style.filter = "brightness(1.08)")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.filter = "")}
          >
            {loading ? "Verificando…" : "Ingresar"}
          </button>

          {/* ── Accesos rápidos demo ── */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-2)" }}>
            <p style={demoTitleStyle}>Acceso rápido — seleccioná un rol</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { id: "9999",  label: "Super Admin",   rgb: "21,101,192" },
                { id: "2001",  label: "Administrador", rgb: "38,166,154" },
                { id: "1001",  label: "Coordinador",   rgb: "109,191,60" },
                { id: "93598", label: "Médico",        rgb: "217,119,6"  },
              ].map(acc => (
                <button
                  key={acc.id}
                  style={demoAccStyle}
                  onClick={() => quickLogin(acc.id)}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--blue-tint)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: `rgb(${acc.rgb})`, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{acc.id}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{acc.label}</div>
                  </div>
                </button>
              ))}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--subtle)", textAlign: "center" }}>
              Al seleccionar un rol se completan ID y contraseña automáticamente
            </p>
          </div>
        </div>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: "var(--subtle)", textAlign: "center" }}>
        MediFlow v2 · Demo — datos locales en este navegador
      </p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
  minHeight: "100vh", display: "grid", placeItems: "center",
  padding: 20,
  background: "linear-gradient(150deg, #eef4fd 0%, #f4f7fb 60%, #edf5f2 100%)",
};
const cardStyle: React.CSSProperties = {
  width: "min(420px, 100%)",
  background: "var(--surface)",
  borderRadius: 20,
  boxShadow: "0 8px 40px rgba(21,101,192,0.13), 0 2px 8px rgba(0,0,0,0.07)",
  overflow: "hidden",
  border: "1px solid rgba(21,101,192,0.10)",
};
const headerBandStyle: React.CSSProperties = {
  height: 8,
  background: "linear-gradient(90deg, #1565C0 0%, #1976D2 50%, #0d8a85 100%)",
};
const logoAreaStyle: React.CSSProperties = { padding: "28px 28px 0", textAlign: "center" };
const logoStyle: React.CSSProperties = { height: 64, width: "auto", objectFit: "contain", display: "block", margin: "0 auto" };
const formBodyStyle: React.CSSProperties = { padding: "20px 28px 28px" };
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 10,
  border: "1.5px solid var(--border)", background: "var(--surface-2)",
  fontSize: 15, color: "var(--text)", outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
};
const errorStyle: React.CSSProperties = {
  marginBottom: 12, padding: "10px 14px", borderRadius: 8,
  background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.18)",
  color: "var(--danger)", fontSize: 13,
};
const btnStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "13px 12px", borderRadius: 10,
  border: "none", background: "linear-gradient(180deg, #1976D2, #1565C0)",
  color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer",
  boxShadow: "0 3px 12px rgba(21,101,192,0.30)", transition: "filter 0.12s, opacity 0.12s",
};
const demoTitleStyle: React.CSSProperties = {
  margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "var(--subtle)",
  textTransform: "uppercase", letterSpacing: "0.06em",
};
const demoAccStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
  borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--surface-2)",
  cursor: "pointer", textAlign: "left", transition: "background 0.12s",
};
